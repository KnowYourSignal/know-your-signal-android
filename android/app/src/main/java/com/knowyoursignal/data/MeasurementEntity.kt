package com.knowyoursignal.data

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

internal const val LOCAL_ONLY = "LOCAL_ONLY"
internal const val PENDING = "PENDING"
internal const val SYNCED = "SYNCED"
internal const val FAILED = "FAILED"
internal const val DEFAULT_SESSION_ID = "session-1"
internal const val DEFAULT_SESSION_NAME = "Sesión 1"

@Entity(tableName = "sessions")
internal data class SessionEntity(
    @PrimaryKey val id: String,
    val name: String,
    val startedAt: String,
)

@Entity(
    tableName = "measurements",
    foreignKeys = [ForeignKey(
        entity = SessionEntity::class,
        parentColumns = ["id"],
        childColumns = ["sessionId"],
        onDelete = ForeignKey.CASCADE,
    )],
    indices = [
        Index(value = ["floor", "metric", "capturedAt"]),
        Index(value = ["sessionId"]),
    ],
)
internal data class MeasurementEntity(
    @PrimaryKey val id: String,
    val latitude: Double,
    val longitude: Double,
    val accuracyM: Double,
    val powerDbm: Int,
    val metric: String,
    val technology: String,
    val connection: String,
    val floor: Int,
    val zoneSize: String,
    val capturedAt: String,
    val syncState: String,
    @ColumnInfo(defaultValue = "'sistema'")
    val classificationOrigin: String = if (connection == "wifi_desconocida") "desconocido" else "sistema",
    @ColumnInfo(defaultValue = "'session-1'")
    val sessionId: String = DEFAULT_SESSION_ID,
)
