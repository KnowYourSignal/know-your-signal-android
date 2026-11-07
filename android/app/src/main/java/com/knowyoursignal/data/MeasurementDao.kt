package com.knowyoursignal.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

internal data class HistoryLayer(val floor: Int, val metric: String, val count: Int)
internal data class HistoryCounts(val total: Int, val pending: Int, val synced: Int, val failed: Int)

@Dao
internal interface MeasurementDao {
    @Insert
    suspend fun insert(measurement: MeasurementEntity)

    @Insert
    suspend fun enqueue(entry: OutboxEntity)

    @Query("SELECT * FROM measurements WHERE id = :id")
    suspend fun find(id: String): MeasurementEntity?

    @Query("SELECT floor, metric, COUNT(*) AS count FROM measurements GROUP BY floor, metric ORDER BY floor, metric")
    suspend fun layers(): List<HistoryLayer>

    @Query("SELECT * FROM measurements WHERE floor = :floor AND metric = :metric ORDER BY capturedAt DESC, id LIMIT :limit")
    suspend fun list(floor: Int, metric: String, limit: Int): List<MeasurementEntity>

    @Query("""
        SELECT COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN syncState = 'PENDING' THEN 1 ELSE 0 END), 0) AS pending,
        COALESCE(SUM(CASE WHEN syncState = 'SYNCED' THEN 1 ELSE 0 END), 0) AS synced,
        COALESCE(SUM(CASE WHEN syncState = 'FAILED' THEN 1 ELSE 0 END), 0) AS failed
        FROM measurements
    """)
    suspend fun counts(): HistoryCounts

    @Query("""
        SELECT m.* FROM measurements m JOIN outbox o ON o.measurementId = m.id
        WHERE o.consentRevision = :revision AND m.syncState = 'PENDING'
        ORDER BY o.queuedAtMs, m.id LIMIT 100
    """)
    suspend fun nextBatch(revision: Long): List<MeasurementEntity>

    @Query("UPDATE measurements SET syncState = :state WHERE syncState = 'PENDING' AND id IN (:ids)")
    suspend fun setBatchState(ids: List<String>, state: String)

    @Query("DELETE FROM outbox WHERE measurementId IN (:ids)")
    suspend fun removeFromOutbox(ids: List<String>)

    @Query("UPDATE measurements SET syncState = 'LOCAL_ONLY' WHERE syncState = 'PENDING'")
    suspend fun privatizePending()

    @Query("DELETE FROM outbox")
    suspend fun clearOutbox()

    @Query("SELECT * FROM consent WHERE id = 1")
    suspend fun consent(): ConsentEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putConsent(consent: ConsentEntity)

    @Query("UPDATE consent SET remotePending = 0, lastProblem = NULL WHERE id = 1 AND revision = :revision")
    suspend fun confirmConsent(revision: Long)

    @Query("UPDATE consent SET lastProblem = :problem WHERE id = 1 AND revision = :revision")
    suspend fun setSyncProblem(revision: Long, problem: String?)
}
