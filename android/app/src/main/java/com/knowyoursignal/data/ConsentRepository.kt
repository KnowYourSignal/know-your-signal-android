package com.knowyoursignal.data

import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.withTransaction

internal const val NOTICE_VERSION = "1.0"
internal const val CONFIG_VERSION = "mvp-1"

@Entity(tableName = "consent")
internal data class ConsentEntity(
    @PrimaryKey val id: Int = 1,
    val enabled: Boolean,
    val revision: Long,
    val remotePending: Boolean,
    val server: String,
    val lastProblem: String? = null,
)

internal class ConsentRepository(private val database: FieldDatabase) {
    suspend fun choose(enabled: Boolean, server: String): ConsentEntity = database.withTransaction {
        val dao = database.measurements()
        val previous = dao.consent()
        if (enabled && previous?.enabled == true && previous.server == server) return@withTransaction previous
        // A new decision never requeues historical captures. A revocation and
        // its local cancellation of unsent samples commit together.
        dao.privatizePending()
        dao.clearOutbox()
        val choice = ConsentEntity(
            enabled = enabled,
            revision = (previous?.revision ?: 0) + 1,
            remotePending = enabled || previous?.enabled == true || previous?.remotePending == true,
            server = if (enabled) server else previous?.server ?: server,
        )
        dao.putConsent(choice)
        choice
    }
}
