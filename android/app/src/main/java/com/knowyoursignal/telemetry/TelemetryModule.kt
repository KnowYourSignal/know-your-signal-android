package com.knowyoursignal.telemetry

import android.os.SystemClock
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.knowyoursignal.NativeTelemetrySpec
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

internal data class CaptureDraft(val id: String, val reading: Reading, val capturedAt: String)

internal object CaptureDrafts {
    private val current = AtomicReference<CaptureDraft?>()
    fun put(draft: CaptureDraft) = current.set(draft)
    fun find(id: String) = current.get()?.takeIf { it.id == id }
}

internal class TelemetryModule(context: ReactApplicationContext) : NativeTelemetrySpec(context) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val location = LocationReader(context.applicationContext)
    private val signal = SignalReader(context.applicationContext)
    private val readerLock = Mutex()
    private val latest = AtomicReference<Reading?>()

    override fun readSensors(promise: Promise) = run(promise) {
        readerLock.withLock {
            var position: Position? = null
            var power: Signal? = null
            val problem = try {
                position = location.read(requirePrecise = true)
                power = signal.read()
                CaptureValidator.problem(position, power, SystemClock.elapsedRealtime())
            } catch (error: CaptureException) {
                error.code
            } catch (_: SecurityException) {
                "PERMISSION_DENIED"
            }
            val reading = if (problem == null && position != null && power != null) {
                Reading(position, power)
            } else null
            latest.set(reading)
            Arguments.createMap().apply {
                optionalNumber("latitude", position?.latitude)
                optionalNumber("longitude", position?.longitude)
                optionalNumber("accuracyM", position?.accuracyM)
                optionalNumber("powerDbm", power?.powerDbm?.toDouble())
                putString("metric", power?.metric)
                putString("technology", power?.technology)
                putString("connection", power?.connection)
                putDouble("validForMs", (reading?.validForMs(SystemClock.elapsedRealtime()) ?: 0).toDouble())
                putString("problem", problem)
            }
        }
    }

    override fun freezeCapture(promise: Promise) = run(promise) {
        val reading = latest.getAndSet(null) ?: throw CaptureException("STALE_READING")
        CaptureValidator.problem(reading.position, reading.signal, SystemClock.elapsedRealtime())?.let {
            throw CaptureException(it)
        }
        val capturedAt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.format(Date())
        val draft = CaptureDraft(UUID.randomUUID().toString(), reading, capturedAt)
        CaptureDrafts.put(draft)
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

    override fun locate(promise: Promise) = run(promise) {
        val position = location.read(requirePrecise = false)
        Arguments.createMap().apply {
            putDouble("latitude", position.latitude)
            putDouble("longitude", position.longitude)
        }
    }

    private fun run(promise: Promise, block: suspend () -> Any?) {
        scope.launch {
            try {
                promise.resolve(block())
            } catch (error: CancellationException) {
                throw error
            } catch (error: CaptureException) {
                promise.reject(error.code, error.code)
            } catch (_: SecurityException) {
                promise.reject("PERMISSION_DENIED", "PERMISSION_DENIED")
            } catch (_: Exception) {
                promise.reject("SENSOR_UNAVAILABLE", "SENSOR_UNAVAILABLE")
            }
        }
    }

    override fun invalidate() {
        scope.cancel()
        super.invalidate()
    }
}

private fun WritableMap.optionalNumber(key: String, value: Double?) {
    if (value == null) putNull(key) else putDouble(key, value)
}
