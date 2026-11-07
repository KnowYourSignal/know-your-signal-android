package com.knowyoursignal.data

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "outbox",
    foreignKeys = [ForeignKey(
        entity = MeasurementEntity::class,
        parentColumns = ["id"],
        childColumns = ["measurementId"],
        onDelete = ForeignKey.CASCADE,
    )],
    indices = [Index(value = ["consentRevision", "queuedAtMs"])],
)
internal data class OutboxEntity(
    @PrimaryKey val measurementId: String,
    val consentRevision: Long,
    val queuedAtMs: Long,
)
