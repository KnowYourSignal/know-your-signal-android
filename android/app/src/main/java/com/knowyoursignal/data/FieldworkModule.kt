package com.knowyoursignal.data

import android.content.Context
import androidx.room.withTransaction
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

    override fun getGuideStatus(promise: Promise) = run(promise) {
        Arguments.createMap().apply {
            putBoolean("overview", preferences.getBoolean("guide_overview_v1", false))
            putBoolean("room", preferences.getBoolean("guide_room_v1", false))
        }
    }

    override fun markGuideSeen(scope: String, promise: Promise) = run(promise) {
        if (scope !in setOf("overview", "room")) throw CaptureException("INVALID_GUIDE")
        check(preferences.edit().putBoolean("guide_${scope}_v1", true).commit())
        null
    }

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

    override fun saveMeasurement(captureId: String, floor: Double, zoneSize: String, promise: Promise) =
        save(captureId, floor, zoneSize, null, promise)

    override fun saveMeasurementWithClassification(
        captureId: String, floor: Double, zoneSize: String, connectionChoice: String?, promise: Promise,
    ) = save(captureId, floor, zoneSize, connectionChoice, promise)

    private fun save(
        captureId: String, floor: Double, zoneSize: String, connectionChoice: String?, promise: Promise,
    ) = run(promise) {
        val saved = repository.save(captureId, floor, zoneSize, config?.server.orEmpty(), connectionChoice)
        val sessionName = dao.findSession(saved.measurement.sessionId)?.name ?: DEFAULT_SESSION_NAME
        CaptureDrafts.forget(captureId)
        saved.wakeRevision?.let { schedule(it) }
        saved.measurement.toMap(sessionName)
    }

    override fun startSession(name: String?, promise: Promise) = run(promise) {
        repository.startSession(name).toMap()
    }

    override fun listSessions(promise: Promise) = run(promise) {
        Arguments.createArray().apply {
            repository.listSessions().forEach { pushMap(it.toMap()) }
        }
    }

    override fun getRecentRoom(promise: Promise) = run(promise) {
        dao.recentRoom()?.let { room ->
            Arguments.createMap().apply {
                putInt("floor", room.floor)
                putString("zoneSize", room.zoneSize)
            }
        }
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
        val sessionNames = repository.listSessions().associate { it.id to it.name }
        Arguments.createArray().apply {
            repository.list(floor, metric).forEach {
                pushMap(it.toMap(sessionNames[it.sessionId] ?: DEFAULT_SESSION_NAME))
            }
        }
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

    private suspend fun status() = database.withTransaction {
        val consent = dao.consent()
        val counts = dao.counts()
        val session = dao.latestSession()
        Arguments.createMap().apply {
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
            putString("activeSessionId", session?.id ?: DEFAULT_SESSION_ID)
            putString("activeSessionName", session?.name ?: DEFAULT_SESSION_NAME)
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

private fun SessionEntity.toMap() = Arguments.createMap().apply {
    putString("id", id)
    putString("name", name)
    putString("startedAt", startedAt)
}

private fun MeasurementEntity.toMap(sessionName: String = DEFAULT_SESSION_NAME) = Arguments.createMap().apply {
    putString("id", id)
    putDouble("latitude", latitude)
    putDouble("longitude", longitude)
    putDouble("accuracyM", accuracyM)
    putInt("powerDbm", powerDbm)
    putString("metric", metric)
    putString("technology", technology)
    putString("connection", connection)
    putString("classificationOrigin", classificationOrigin)
    putString("capturedAt", capturedAt)
    putInt("floor", floor)
    putString("zoneSize", zoneSize)
    putString("syncState", syncState)
    putString("sessionId", sessionId)
    putString("sessionName", sessionName)
}
