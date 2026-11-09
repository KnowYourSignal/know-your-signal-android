package com.knowyoursignal.telemetry

import android.net.Network
import android.os.SystemClock
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.knowyoursignal.NativeTelemetrySpec
import com.knowyoursignal.data.FieldDatabase
import com.knowyoursignal.sync.SyncConfig
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch

internal data class CaptureDraft(
    val id: String,
    val reading: Reading,
    val capturedAt: String,
    val shareRevision: Long? = null,
)

internal object CaptureDrafts {
    private val current = AtomicReference<CaptureDraft?>()
    fun put(draft: CaptureDraft) = current.set(draft)
    fun find(id: String) = current.get()?.takeIf { it.id == id }

    fun forget(id: String) {
        find(id)?.let { current.compareAndSet(it, null) }
    }
}

internal class TelemetryModule(context: ReactApplicationContext) : NativeTelemetrySpec(context) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val app = context.applicationContext
    private val location = LocationReader(app)
    private val signal = SignalReader(app)
    private val server = SyncConfig.load()?.server

    private data class Observation(val reading: Reading, val network: Network)
    private val lock = Any()
    private var generation = 0L
    private var pendingRead: Job? = null
    private var pendingLocate: Job? = null
    private var latest: Observation? = null

    override fun readSensors(promise: Promise) {
        synchronized(lock) {
            pendingRead?.cancel()
            val currentGeneration = generation
            pendingRead = submit(promise) { readSnapshot(currentGeneration) }
        }
    }

    override fun stopReading() {
        val job = synchronized(lock) {
            generation += 1
            latest = null
            pendingRead.also { pendingRead = null }
        }
        job?.cancel()
    }

    private suspend fun readSnapshot(expected: Long): WritableMap {
        var position: Position? = null
        var power: Signal? = null
        var network: Network? = null
        val problem = try {
            position = location.read(requirePrecise = true)
            network = signal.currentNetwork()
            power = network?.let { signal.read(it) }
            if (network != signal.currentNetwork()) "NETWORK_CHANGED"
            else CaptureValidator.problem(position, power, SystemClock.elapsedRealtime())
        } catch (error: CaptureException) {
            error.code
        } catch (_: SecurityException) {
            "PERMISSION_DENIED"
        }
        val observation = if (problem == null && position != null && power != null && network != null) {
            Observation(Reading(position, power), network)
        } else null
        val coroutine = currentCoroutineContext()
        synchronized(lock) {
            coroutine.ensureActive()
            if (generation != expected) throw CancellationException("Capture session ended")
            latest = observation
        }
        return Arguments.createMap().apply {
            optionalNumber("latitude", position?.latitude)
            optionalNumber("longitude", position?.longitude)
            optionalNumber("accuracyM", position?.accuracyM)
            optionalNumber("powerDbm", power?.powerDbm?.toDouble())
            putString("metric", power?.metric)
            putString("technology", power?.technology)
            putString("connection", power?.connection)
            putDouble("validForMs", (observation?.reading?.validForMs(SystemClock.elapsedRealtime()) ?: 0).toDouble())
            putString("problem", problem)
        }
    }

    override fun freezeCapture(promise: Promise) {
        submit(promise) {
            val (expected, observation) = synchronized(lock) {
                val value = latest ?: throw CaptureException("STALE_READING")
                latest = null
                generation to value
            }
            val reading = observation.reading
            val shareRevision = server?.let { endpoint ->
                FieldDatabase.open(app).measurements().consent()
                    ?.takeIf { it.enabled && it.server == endpoint }?.revision
            }
            if (observation.network != signal.currentNetwork()) throw CaptureException("NETWORK_CHANGED")
            CaptureValidator.problem(reading.position, reading.signal, SystemClock.elapsedRealtime())?.let {
                throw CaptureException(it)
            }
            val capturedAt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }.format(Date())
            val draft = CaptureDraft(UUID.randomUUID().toString(), reading, capturedAt, shareRevision)
            synchronized(lock) {
                if (expected != generation) throw CancellationException("Capture session ended")
                CaptureDrafts.put(draft)
            }
            Arguments.createMap().apply {
                putString("id", draft.id)
                putDouble("accuracyM", reading.position.accuracyM)
                putInt("powerDbm", reading.signal.powerDbm)
                putString("metric", reading.signal.metric)
                putString("technology", reading.signal.technology)
                putString("connection", reading.signal.connection)
                putString("capturedAt", draft.capturedAt)
            }
        }
    }

    override fun locate(promise: Promise) {
        synchronized(lock) {
            pendingLocate?.cancel()
            pendingLocate = submit(promise) {
                val position = location.read(requirePrecise = false)
                Arguments.createMap().apply {
                    putDouble("latitude", position.latitude)
                    putDouble("longitude", position.longitude)
                }
            }
        }
    }

    override fun stopLocating() {
        val job = synchronized(lock) { pendingLocate.also { pendingLocate = null } }
        job?.cancel()
    }

    private fun submit(promise: Promise, block: suspend () -> Any?): Job {
        val settled = AtomicBoolean(false)
        fun reject(code: String) {
            if (settled.compareAndSet(false, true)) promise.reject(code, code)
        }
        val job = scope.launch(start = CoroutineStart.LAZY) {
            try {
                val value = block()
                if (settled.compareAndSet(false, true)) promise.resolve(value)
            } catch (error: CancellationException) {
                throw error
            } catch (error: CaptureException) {
                reject(error.code)
            } catch (_: SecurityException) {
                reject("PERMISSION_DENIED")
            } catch (_: Exception) {
                reject("SENSOR_UNAVAILABLE")
            }
        }
        job.invokeOnCompletion { error ->
            if (error is CancellationException) reject("READING_CANCELLED")
        }
        job.start()
        return job
    }

    override fun invalidate() {
        stopReading()
        stopLocating()
        scope.cancel()
        super.invalidate()
    }
}

private fun WritableMap.optionalNumber(key: String, value: Double?) {
    if (value == null) putNull(key) else putDouble(key, value)
}
