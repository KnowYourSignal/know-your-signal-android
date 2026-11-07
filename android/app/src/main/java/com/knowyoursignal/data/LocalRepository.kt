package com.knowyoursignal.data

import androidx.room.withTransaction
import com.knowyoursignal.telemetry.CaptureDraft
import com.knowyoursignal.telemetry.CaptureDrafts
import com.knowyoursignal.telemetry.CaptureException

internal const val MAX_HISTORY_POINTS = 750
internal val METRICS = setOf("wifi_rssi", "lte_rsrp", "nr_ss_rsrp", "celular_dbm")
internal val ZONE_SIZES = setOf("pequeno", "mediano", "grande", "muy_grande")

internal class LocalRepository(private val database: FieldDatabase) {
    private val dao = database.measurements()

    suspend fun save(captureId: String, floor: Double, zoneSize: String, server: String): MeasurementEntity =
        database.withTransaction {
            val level = floorLevel(floor)
            if (zoneSize !in ZONE_SIZES) throw CaptureException("INVALID_ZONE")
            dao.find(captureId)?.let { previous ->
                if (previous.floor != level || previous.zoneSize != zoneSize) {
                    throw CaptureException("CAPTURE_ALREADY_SAVED")
                }
                return@withTransaction previous
            }
            val draft = CaptureDrafts.find(captureId) ?: throw CaptureException("CAPTURE_EXPIRED")
            val consent = dao.consent()
            val canQueue = consent?.enabled == true && consent.server == server && server.isNotEmpty()
            val measurement = draft.toMeasurement(level, zoneSize, if (canQueue) PENDING else LOCAL_ONLY)
            dao.insert(measurement)
            if (canQueue && consent != null) {
                dao.enqueue(OutboxEntity(measurement.id, consent.revision, System.currentTimeMillis()))
            }
            measurement
        }

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

    private fun CaptureDraft.toMeasurement(floor: Int, zoneSize: String, state: String) =
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
        )
}
