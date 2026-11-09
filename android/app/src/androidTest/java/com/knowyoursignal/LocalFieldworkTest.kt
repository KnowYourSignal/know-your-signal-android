package com.knowyoursignal

import android.database.sqlite.SQLiteException
import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.knowyoursignal.data.ConsentRepository
import com.knowyoursignal.data.FieldDatabase
import com.knowyoursignal.data.LOCAL_ONLY
import com.knowyoursignal.data.LocalRepository
import com.knowyoursignal.data.PENDING
import com.knowyoursignal.data.SYNCED
import com.knowyoursignal.sync.BatchReceipt
import com.knowyoursignal.sync.PublicPayloadBuilder
import com.knowyoursignal.telemetry.CaptureDraft
import com.knowyoursignal.telemetry.CaptureDrafts
import com.knowyoursignal.telemetry.CaptureException
import com.knowyoursignal.telemetry.Position
import com.knowyoursignal.telemetry.Reading
import com.knowyoursignal.telemetry.Signal
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.json.JSONException
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class LocalFieldworkTest {
    private lateinit var database: FieldDatabase
    private lateinit var history: LocalRepository
    private lateinit var privacy: ConsentRepository
    private val server = "https://example.invalid"

    @Before fun open() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        database = Room.inMemoryDatabaseBuilder(context, FieldDatabase::class.java).build()
        history = LocalRepository(database)
        privacy = ConsentRepository(database)
    }

    @After fun close() = database.close()

    @Test fun offlineCaptureAndExplicitConsentNeverPublishOldHistory(): Unit = runBlocking {
        val old = capture()
        assertEquals(LOCAL_ONLY, history.save(old, 0.0, "mediano", server).measurement.syncState)
        val granted = privacy.choose(true, server)
        assertTrue(database.measurements().nextBatch(granted.revision).isEmpty())

        val new = capture(granted.revision)
        assertEquals(PENDING, history.save(new, -1.0, "grande", server).measurement.syncState)
        history.save(new, -1.0, "grande", server)
        assertEquals(listOf(new), database.measurements().nextBatch(granted.revision).map { it.id })
        assertEquals(2, database.measurements().counts().total)
        assertEquals(listOf(old), history.list(0.0, "wifi_rssi").map { it.id })
    }

    @Test fun revocationPreservesLocalRowsAndRejectsStaleReceipts(): Unit = runBlocking {
        val granted = privacy.choose(true, server)
        val accepted = capture(granted.revision)
        history.save(accepted, 0.0, "mediano", server)
        history.settleBatch(granted.revision, listOf(accepted), emptyList())
        val waiting = capture(granted.revision)
        history.save(waiting, 0.0, "mediano", server)

        val revoked = privacy.choose(false, server)
        history.settleBatch(granted.revision, listOf(waiting), emptyList())
        assertFalse(revoked.enabled)
        assertTrue(revoked.remotePending)
        assertEquals(SYNCED, database.measurements().find(accepted)?.syncState)
        assertEquals(LOCAL_ONLY, database.measurements().find(waiting)?.syncState)
        assertTrue(database.measurements().nextBatch(granted.revision).isEmpty())
    }

    @Test fun failureToQueueRollsBackTheHistoryInsert(): Unit = runBlocking {
        val granted = privacy.choose(true, server)
        database.openHelper.writableDatabase.execSQL(
            "CREATE TRIGGER fail_enqueue BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT, 'test'); END",
        )
        val id = capture(granted.revision)
        assertThrows(SQLiteException::class.java) {
            runBlocking { history.save(id, 0.0, "mediano", server) }
        }
        assertNull(database.measurements().find(id))
    }

    @Test fun payloadAndReceiptsFollowTheStrictBackendContract(): Unit = runBlocking {
        val granted = privacy.choose(true, server)
        val id = capture(granted.revision)
        history.save(id, 0.0, "mediano", server)
        val payload = PublicPayloadBuilder.build(database.measurements().nextBatch(granted.revision))
        val sample = payload.getJSONArray("mediciones").getJSONObject(0)
        assertEquals(setOf("esquema_version", "mediciones"), payload.keys().asSequence().toSet())
        assertEquals(setOf(
            "id", "latitud", "longitud", "precision_m", "potencia_dbm", "metrica", "tecnologia_radio",
            "tipo_conexion", "origen_clasificacion", "piso_nivel", "tamano_zona", "capturada_en",
            "version_config", "version_aviso",
        ), sample.keys().asSequence().toSet())
        assertEquals(0, sample.getInt("piso_nivel"))

        val duplicate = JSONObject().put("aceptadas", org.json.JSONArray())
            .put("duplicadas", org.json.JSONArray().put(id))
            .put("rechazadas", org.json.JSONArray())
        assertEquals(listOf(id), BatchReceipt.parse(duplicate, setOf(id)).confirmed)
        assertThrows(JSONException::class.java) { BatchReceipt.parse(duplicate, setOf("different")) }
    }

    @Test fun aFrozenCaptureCannotInheritALaterConsent(): Unit = runBlocking {
        val privateDraft = capture()
        val granted = privacy.choose(true, server)
        assertEquals(LOCAL_ONLY, history.save(privateDraft, 0.0, "mediano", server).measurement.syncState)

        val previousDraft = capture(granted.revision)
        privacy.choose(false, server)
        val grantedAgain = privacy.choose(true, server)
        assertEquals(LOCAL_ONLY, history.save(previousDraft, 0.0, "mediano", server).measurement.syncState)
        assertTrue(database.measurements().nextBatch(grantedAgain.revision).isEmpty())
    }

    @Test fun queueWakesOnlyWhenAnEmptyBatchGetsWork(): Unit = runBlocking {
        val granted = privacy.choose(true, server)
        val first = capture(granted.revision)
        assertEquals(granted.revision, history.save(first, 0.0, "mediano", server).wakeRevision)
        assertNull(history.save(first, 0.0, "mediano", server).wakeRevision)
        val second = capture(granted.revision)
        assertNull(history.save(second, 0.0, "mediano", server).wakeRevision)

        history.settleBatch(granted.revision, listOf(first, second), emptyList())
        val next = capture(granted.revision)
        assertEquals(granted.revision, history.save(next, 0.0, "mediano", server).wakeRevision)
    }

    @Test fun diskHistoryAndConsentSurviveClosingAndReopeningRoom(): Unit = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val name = "fieldwork-test-" + UUID.randomUUID() + ".db"
        var reopened = Room.databaseBuilder(context, FieldDatabase::class.java, name).build()
        try {
            ConsentRepository(reopened).choose(false, server)
            val id = capture()
            LocalRepository(reopened).save(id, 0.0, "mediano", server)
            reopened.close()
            reopened = Room.databaseBuilder(context, FieldDatabase::class.java, name).build()
            assertEquals(false, reopened.measurements().consent()?.enabled)
            assertEquals(listOf(id), LocalRepository(reopened).list(0.0, "wifi_rssi").map { it.id })
            assertEquals(LOCAL_ONLY, reopened.measurements().find(id)?.syncState)
        } finally {
            reopened.close()
            context.deleteDatabase(name)
        }
    }

    @Test fun manualWifiClassificationIsHonestDurableAndIdempotent(): Unit = runBlocking {
        val granted = privacy.choose(true, server)
        val id = capture(granted.revision, "wifi_desconocida")
        val saved = history.save(id, 2.0, "grande", server, "wifi_publica").measurement
        CaptureDrafts.forget(id)
        assertEquals("wifi_publica", saved.connection)
        assertEquals("manual", saved.classificationOrigin)
        assertEquals(saved, history.save(id, 2.0, "grande", server, "wifi_publica").measurement)
        val sample = PublicPayloadBuilder.build(database.measurements().nextBatch(granted.revision))
            .getJSONArray("mediciones").getJSONObject(0)
        assertEquals("manual", sample.getString("origen_clasificacion"))
        assertEquals("wifi_publica", sample.getString("tipo_conexion"))
        assertEquals(2, database.measurements().recentRoom()?.floor)
        assertEquals("grande", database.measurements().recentRoom()?.zoneSize)
        assertThrows(CaptureException::class.java) {
            runBlocking { history.save(id, 2.0, "grande", server, "wifi_privada") }
        }
        assertEquals(1, database.measurements().counts().total)
    }

    @Test fun unknownWifiStaysUnknownAndSystemReadingsCannotBeReclassified(): Unit = runBlocking {
        val id = capture(connection = "wifi_desconocida")
        val saved = history.save(id, 0.0, "mediano", server).measurement
        assertEquals("wifi_desconocida", saved.connection)
        assertEquals("desconocido", saved.classificationOrigin)
        val system = capture()
        assertThrows(CaptureException::class.java) {
            runBlocking { history.save(system, 0.0, "mediano", server, "wifi_publica") }
        }
        assertNull(database.measurements().find(system))
    }

    private fun capture(shareRevision: Long? = null, connection: String = "wifi_privada"): String {
        val id = UUID.randomUUID().toString()
        CaptureDrafts.put(CaptureDraft(
            id, Reading(Position(-33.45, -70.65, 7.1, 100),
                Signal(-68, "wifi_rssi", "wifi", connection, 100)),
            "2026-11-06T15:00:00.000Z",
            shareRevision,
        ))
        return id
    }
}
