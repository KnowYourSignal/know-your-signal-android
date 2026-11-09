package com.knowyoursignal.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.ListenableWorker.Result
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.await
import com.knowyoursignal.data.ConsentEntity
import com.knowyoursignal.data.FieldDatabase
import com.knowyoursignal.data.LocalRepository
import com.knowyoursignal.data.MeasurementDao
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.Call

internal object SyncScheduler {
    private const val QUEUE = "kys-outbox"
    private const val RECONCILE = "kys-outbox-reconcile"
    private val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    suspend fun request(context: Context, replace: Boolean = false) {
        if (SyncConfig.load() == null) return
        val work = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(online)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 60, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            QUEUE, if (replace) ExistingWorkPolicy.REPLACE else ExistingWorkPolicy.APPEND_OR_REPLACE, work,
        ).await()
    }

    fun reconcile(context: Context) {
        if (SyncConfig.load() == null) return
        // Recovers the durable outbox if the app stopped after a Room commit,
        // before the one-time request reached WorkManager.
        val work = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(online)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 60, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(RECONCILE, ExistingPeriodicWorkPolicy.KEEP, work)
    }
}

internal object SyncCoordinator {
    val worker = Mutex()
    val consent = Mutex()
    private var upload: Call? = null

    fun cancelUpload() {
        upload?.cancel()
        upload = null
    }

    fun gate(dao: MeasurementDao, expected: ConsentEntity, uploading: Boolean = false): RequestGate =
        { call, enqueue ->
            consent.withLock {
                val current = dao.consent()
                if (current?.revision != expected.revision || current.server != expected.server) {
                    throw ConsentChanged()
                }
                if (uploading) upload = call
                enqueue()
            }
        }
}

class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val config = SyncConfig.load() ?: return Result.success()
        return OutboxSynchronizer(
            config, FieldDatabase.open(applicationContext), SyncApi(config),
            SessionStore(applicationContext, config.server),
        ).sync()
    }
}

internal class OutboxSynchronizer(
    private val config: SyncConfig,
    private val database: FieldDatabase,
    private val api: SyncApi,
    private val store: SessionStore,
) {
    suspend fun sync(): Result = SyncCoordinator.worker.withLock { perform() }

    private suspend fun perform(): Result {
        val dao = database.measurements()
        val choice = dao.consent() ?: return Result.success()
        if (choice.server != config.server) {
            if (choice.enabled || choice.remotePending) dao.setSyncProblem(choice.revision, "CONFIG_CHANGED")
            return Result.success()
        }
        if (choice.lastProblem in PERMANENT_ERRORS) return Result.success()
        if (!choice.remotePending && (!choice.enabled || dao.nextBatch(choice.revision).isEmpty())) {
            return Result.success()
        }

        val gate = SyncCoordinator.gate(dao, choice)
        try {
            var session = store.read()
            if (session == null) {
                if (!choice.enabled) {
                    dao.confirmConsent(choice.revision)
                    return Result.success()
                }
                // Persist rotating tokens before allowing cancellation to release
                // the worker lock or begin another session for this installation.
                session = withContext(NonCancellable) {
                    api.signIn(gate).also(store::write)
                }
            }
            var current = requireNotNull(session)
            suspend fun refresh() {
                current = withContext(NonCancellable) {
                    api.refresh(current.refreshToken, gate).also(store::write)
                }
            }
            if (current.expiresAtMs <= System.currentTimeMillis() + 60_000) refresh()
            suspend fun <T> authorized(request: suspend (String) -> T): T {
                return try {
                    request(current.accessToken)
                } catch (error: SyncFailure) {
                    if (error.status != 401) throw error
                    refresh()
                    request(current.accessToken)
                }
            }

            if (choice.remotePending) {
                // Finish an in-flight consent RPC before a replacement worker
                // can publish the next decision for the same account.
                withContext(NonCancellable) {
                    authorized { api.setConsent(choice.enabled, it, gate) }
                    dao.confirmConsent(choice.revision)
                }
            }

            if (!choice.enabled) return Result.success()
            val repository = LocalRepository(database)
            repeat(10) {
                val batch = dao.nextBatch(choice.revision)
                if (batch.isEmpty()) {
                    dao.setSyncProblem(choice.revision, null)
                    return Result.success()
                }
                val payload = PublicPayloadBuilder.build(batch)
                val receipt = authorized {
                    api.ingest(payload, it, batch.map { point -> point.id }.toSet(),
                        SyncCoordinator.gate(dao, choice, uploading = true))
                }
                repository.settleBatch(choice.revision, receipt.confirmed, receipt.rejected)
                if (receipt.retry) throw SyncFailure("SERVICE_UNAVAILABLE", retryable = true)
            }
            return if (dao.nextBatch(choice.revision).isEmpty()) Result.success() else Result.retry()
        } catch (_: ConsentChanged) {
            return Result.success()
        } catch (error: SyncFailure) {
            dao.setSyncProblem(choice.revision, error.code)
            return if (error.retryable) Result.retry() else Result.success()
        } finally {
            withContext(NonCancellable) { SyncCoordinator.consent.withLock { SyncCoordinator.cancelUpload() } }
        }
    }

    companion object {
        private val PERMANENT_ERRORS = setOf("SESSION_EXPIRED", "SESSION_STORAGE", "CONSENT_BLOCKED", "SERVER_REJECTED")
    }
}
