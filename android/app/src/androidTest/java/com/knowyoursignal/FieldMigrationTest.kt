package com.knowyoursignal

import androidx.room.Room
import androidx.room.testing.MigrationTestHelper
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.knowyoursignal.data.FieldDatabase
import com.knowyoursignal.data.LOCAL_ONLY
import com.knowyoursignal.data.PENDING
import com.knowyoursignal.sync.PublicPayloadBuilder
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class FieldMigrationTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    @get:Rule val helper = MigrationTestHelper(instrumentation, FieldDatabase::class.java)

    @Test fun upgradePreservesHistoryConsentQueueAndPayloadOrigins(): Unit = runBlocking {
        val name = "migration-" + UUID.randomUUID() + ".db"
        val context = instrumentation.targetContext
        try {
            helper.createDatabase(name, 1).apply {
                listOf("known" to "wifi_privada", "unknown" to "wifi_desconocida", "private" to "wifi_publica")
                    .forEach { (id, connection) ->
                        execSQL("INSERT INTO measurements VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", arrayOf(
                            id, -33.45, -70.65, 6.0, -68, "wifi_rssi", "wifi", connection,
                            -1, "mediano", "2026-11-09T17:00:00.000Z", if (id == "private") LOCAL_ONLY else PENDING,
                        ))
                    }
                execSQL("INSERT INTO consent VALUES (1, 1, 7, 1, 'https://example.invalid', NULL)")
                execSQL("INSERT INTO outbox VALUES ('known', 7, 100)")
                execSQL("INSERT INTO outbox VALUES ('unknown', 7, 200)")
                close()
            }
            helper.runMigrationsAndValidate(
                name, 3, true, FieldDatabase.MIGRATION_1_2, FieldDatabase.MIGRATION_2_3,
            ).close()
            val migrated = Room.databaseBuilder(context, FieldDatabase::class.java, name)
                .addMigrations(FieldDatabase.MIGRATION_1_2, FieldDatabase.MIGRATION_2_3).build()
            try {
                val dao = migrated.measurements()
                assertEquals(3, dao.counts().total)
                assertEquals(2, dao.counts().pending)
                assertEquals(7L, dao.consent()?.revision)
                assertEquals(true, dao.consent()?.remotePending)
                assertEquals(LOCAL_ONLY, dao.find("private")?.syncState)
                assertEquals("desconocido", dao.find("unknown")?.classificationOrigin)
                assertEquals("sistema", dao.find("known")?.classificationOrigin)
                assertEquals("session-1", dao.find("known")?.sessionId)
                assertEquals("Sesión 1", dao.latestSession()?.name)
                val queue = dao.nextBatch(7)
                assertEquals(listOf("known", "unknown"), queue.map { it.id })
                val payload = PublicPayloadBuilder.build(queue).getJSONArray("mediciones")
                assertEquals("sistema", payload.getJSONObject(0).getString("origen_clasificacion"))
                assertEquals("desconocido", payload.getJSONObject(1).getString("origen_clasificacion"))
                assertEquals(-1, queue[0].floor)
                assertEquals(6.0, queue[0].accuracyM, 0.0)
                assertEquals("2026-11-09T17:00:00.000Z", queue[0].capturedAt)
            } finally { migrated.close() }
        } finally { context.deleteDatabase(name) }
    }
}
