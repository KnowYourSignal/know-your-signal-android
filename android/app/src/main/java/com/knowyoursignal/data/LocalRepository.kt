package com.knowyoursignal.data

import androidx.room.withTransaction
import com.knowyoursignal.telemetry.CaptureDraft
import com.knowyoursignal.telemetry.CaptureDrafts
import com.knowyoursignal.telemetry.CaptureException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

internal const val MAX_HISTORY_POINTS = 750
internal val METRICS = setOf("wifi_rssi", "lte_rsrp", "nr_ss_rsrp", "celular_dbm")
internal val ZONE_SIZES = setOf("pequeno", "mediano", "grande", "muy_grande")

internal data class SavedCapture(val measurement: MeasurementEntity, val wakeRevision: Long?)

internal class LocalRepository(private val database: FieldDatabase) {
    private val dao = database.measurements()

    suspend fun save(
        captureId: String,
        floor: Double,
        zoneSize: String,
        server: String,
        connectionChoice: String? = null,
    ): SavedCapture =
        database.withTransaction {
            val level = floorLevel(floor)
            if (zoneSize !in ZONE_SIZES) throw CaptureException("INVALID_ZONE")
            if (connectionChoice != null && connectionChoice !in WIFI_CHOICES) {
                throw CaptureException("INVALID_CLASSIFICATION")
            }
            dao.find(captureId)?.let { previous ->
                if (previous.floor != level || previous.zoneSize != zoneSize ||
                    (connectionChoice != null && (previous.connection != connectionChoice ||
                        previous.classificationOrigin != originForChoice(connectionChoice)))) {
                    throw CaptureException("CAPTURE_ALREADY_SAVED")
                }
                return@withTransaction SavedCapture(previous, null)
            }
            val draft = CaptureDrafts.find(captureId) ?: throw CaptureException("CAPTURE_EXPIRED")
            if (connectionChoice != null && draft.reading.signal.connection != "wifi_desconocida") {
                throw CaptureException("INVALID_CLASSIFICATION")
            }
            val session = dao.latestSession() ?: SessionEntity(
                id = DEFAULT_SESSION_ID,
                name = DEFAULT_SESSION_NAME,
                startedAt = draft.capturedAt,
            ).also { dao.insertSession(it) }
            val consent = dao.consent()?.takeIf {
                it.enabled && it.server == server && server.isNotEmpty() && draft.shareRevision == it.revision
            }
            val wake = if (consent != null && !dao.hasQueued(consent.revision)) consent.revision else null
            val measurement = draft.toMeasurement(level, zoneSize, if (consent != null) PENDING else LOCAL_ONLY, session.id)
                .let { original ->
                    if (connectionChoice == null) original else original.copy(
                        connection = connectionChoice,
                        classificationOrigin = originForChoice(connectionChoice),
                    )
                }
            dao.insert(measurement)
            if (consent != null) {
                dao.enqueue(OutboxEntity(measurement.id, consent.revision, System.currentTimeMillis()))
            }
            SavedCapture(measurement, wake)
        }

    suspend fun startSession(name: String? = null): SessionEntity =
        database.withTransaction {
            val now = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }.format(Date())
            if (dao.sessionCount() == 0) {
                dao.insertSession(SessionEntity(DEFAULT_SESSION_ID, DEFAULT_SESSION_NAME, now))
            }
            val nextNumber = dao.sessionCount() + 1
            val label = name?.trim()?.takeIf { it.isNotEmpty() }?.take(60) ?: "Sesión $nextNumber"
            val created = SessionEntity(UUID.randomUUID().toString(), label, now)
            dao.insertSession(created)
            created
        }

    suspend fun listSessions(): List<SessionEntity> = dao.sessions()

    suspend fun list(floor: Double, metric: String): List<MeasurementEntity> {
        if (metric !in METRICS) throw CaptureException("INVALID_METRIC")
        return dao.list(floorLevel(floor), metric, MAX_HISTORY_POINTS)
    }

    suspend fun settleBatch(revision: Long, confirmed: List<String>, rejected: List<String>) =
        database.withTransaction {
            val current = dao.consent()
            if (current?.enabled != true || current.revision != revision) return@withTransaction
            if (confirmed.isNotEmpty()) dao.setBatchState(confirmed, SYNCED)
            if (rejected.isNotEmpty()) dao.setBatchState(rejected, FAILED)
            val settled = confirmed + rejected
            if (settled.isNotEmpty()) dao.removeFromOutbox(settled)
        }

    private fun floorLevel(floor: Double): Int {
        if (floor !in -10.0..150.0 || floor != floor.toInt().toDouble()) {
            throw CaptureException("INVALID_FLOOR")
        }
        return floor.toInt()
    }

    private fun CaptureDraft.toMeasurement(floor: Int, zoneSize: String, state: String, sessionId: String) =
        MeasurementEntity(
            id = id,
            latitude = reading.position.latitude,
            longitude = reading.position.longitude,
            accuracyM = reading.position.accuracyM,
            powerDbm = reading.signal.powerDbm,
            metric = reading.signal.metric,
            technology = reading.signal.technology,
            connection = reading.signal.connection,
            floor = floor,
            zoneSize = zoneSize,
            capturedAt = capturedAt,
            syncState = state,
            sessionId = sessionId,
        )
}

private val WIFI_CHOICES = setOf("wifi_publica", "wifi_privada", "wifi_desconocida")
private fun originForChoice(connection: String) =
    if (connection == "wifi_desconocida") "desconocido" else "manual"
