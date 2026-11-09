package com.knowyoursignal.data

import androidx.room.Entity
import androidx.room.ColumnInfo
import androidx.room.Index
import androidx.room.PrimaryKey

internal const val LOCAL_ONLY = "LOCAL_ONLY"
internal const val PENDING = "PENDING"
internal const val SYNCED = "SYNCED"
internal const val FAILED = "FAILED"

@Entity(tableName = "measurements", indices = [Index(value = ["floor", "metric", "capturedAt"])])
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
)
