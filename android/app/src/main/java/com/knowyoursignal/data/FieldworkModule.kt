package com.knowyoursignal.data

import android.content.Context
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.knowyoursignal.BuildConfig
import com.knowyoursignal.NativeFieldworkSpec
import com.knowyoursignal.sync.ShareAdapter
import com.knowyoursignal.sync.SyncConfig
import com.knowyoursignal.sync.SyncCoordinator
import com.knowyoursignal.sync.SyncScheduler
import com.knowyoursignal.telemetry.CaptureException
import com.knowyoursignal.telemetry.CaptureDrafts
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.withLock

internal class FieldworkModule(private val context: ReactApplicationContext) : NativeFieldworkSpec(context) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val database by lazy { FieldDatabase.open(context) }
    private val dao get() = database.measurements()
    private val repository by lazy { LocalRepository(database) }
    private val preferences by lazy { context.getSharedPreferences("fieldwork_ui", Context.MODE_PRIVATE) }
    private val config = SyncConfig.load()

    override fun getStatus(promise: Promise) = run(promise) { status() }

    override fun setConsent(enabled: Boolean, promise: Promise) = run(promise) {
        if (enabled && config == null) throw CaptureException("SYNC_NOT_CONFIGURED")
        val choice = SyncCoordinator.consent.withLock {
            ConsentRepository(database).choose(enabled, config?.server.orEmpty()).also {
                SyncCoordinator.cancelUpload()
            }
        }
        if (choice.remotePending) schedule(choice.revision, replace = true)
        status()
    }

    override fun setTechnicalMode(enabled: Boolean, promise: Promise) = run(promise) {
        check(preferences.edit().putBoolean("technicalMode", enabled).commit())
        null
    }

    override fun saveMeasurement(captureId: String, floor: Double, zoneSize: String, promise: Promise) = run(promise) {
        val saved = repository.save(captureId, floor, zoneSize, config?.server.orEmpty())
        CaptureDrafts.forget(captureId)
        saved.wakeRevision?.let { schedule(it) }
        saved.measurement.toMap()
    }

    override fun listLayers(promise: Promise) = run(promise) {
        Arguments.createArray().apply {
            dao.layers().forEach { layer ->
                pushMap(Arguments.createMap().apply {
                    putInt("floor", layer.floor)
                    putString("metric", layer.metric)
                    putInt("count", layer.count)
                })
            }
        }
    }

    override fun listMeasurements(floor: Double, metric: String, promise: Promise) = run(promise) {
        Arguments.createArray().apply { repository.list(floor, metric).forEach { pushMap(it.toMap()) } }
    }

    override fun retrySync(promise: Promise) = run(promise) {
        dao.consent()?.let {
            dao.setSyncProblem(it.revision, null)
            if (!schedule(it.revision, replace = true)) throw CaptureException("SYNC_NOT_SCHEDULED")
        }
        null
    }

    override fun getMapConfiguration(promise: Promise) = run(promise) {
        Arguments.createMap().apply {
            putString("url", config?.server.orEmpty())
            putString("publishableKey", config?.publishableKey.orEmpty())
            putBoolean("mapTiles", BuildConfig.MAP_TILES_AVAILABLE)
        }
    }

    override fun shareEvidence(path: String, promise: Promise) = run(promise) {
        val activity = context.currentActivity ?: throw CaptureException("EXPORT_FAILED")
        ShareAdapter.share(activity, path)
        null
    }

    private suspend fun schedule(revision: Long, replace: Boolean = false): Boolean = try {
        SyncScheduler.request(context, replace)
        true
    } catch (error: CancellationException) {
        throw error
    } catch (_: Exception) {
        // Room already committed. Retain the capture and let periodic recovery
        // or the user's retry wake the durable queue.
        dao.setSyncProblem(revision, "SYNC_NOT_SCHEDULED")
        false
    }

    private suspend fun status() = Arguments.createMap().apply {
        val consent = dao.consent()
        val counts = dao.counts()
        putString("choice", when (consent?.enabled) {
            true -> "community"
            false -> "local"
            null -> "undecided"
        })
        putBoolean("consentPending", consent?.remotePending == true)
        putBoolean("technicalMode", preferences.getBoolean("technicalMode", false))
        putBoolean("syncAvailable", config != null)
        putString("syncProblem", consent?.lastProblem)
        putInt("total", counts.total)
        putInt("pending", counts.pending)
        putInt("synced", counts.synced)
        putInt("failed", counts.failed)
    }

    private fun run(promise: Promise, block: suspend () -> Any?) {
        scope.launch {
            try {
                promise.resolve(block())
            } catch (error: CancellationException) {
                throw error
            } catch (error: CaptureException) {
                promise.reject(error.code, error.code)
            } catch (_: Exception) {
                promise.reject("LOCAL_OPERATION_FAILED", "LOCAL_OPERATION_FAILED")
            }
        }
    }

    override fun invalidate() {
        scope.cancel()
        super.invalidate()
    }
}

private fun MeasurementEntity.toMap() = Arguments.createMap().apply {
    putString("id", id)
    putDouble("latitude", latitude)
    putDouble("longitude", longitude)
    putDouble("accuracyM", accuracyM)
    putInt("powerDbm", powerDbm)
    putString("metric", metric)
    putString("technology", technology)
    putString("connection", connection)
    putString("capturedAt", capturedAt)
    putInt("floor", floor)
    putString("zoneSize", zoneSize)
    putString("syncState", syncState)
}
