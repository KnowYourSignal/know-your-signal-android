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

    @Test fun offlineCaptureAndExplicitConsentNeverPublishOldHistory() = runBlocking {
        val old = capture()
        assertEquals(LOCAL_ONLY, history.save(old, 0.0, "mediano", server).syncState)
        val granted = privacy.choose(true, server)
        assertTrue(database.measurements().nextBatch(granted.revision).isEmpty())

        val new = capture()
        assertEquals(PENDING, history.save(new, -1.0, "grande", server).syncState)
        history.save(new, -1.0, "grande", server)
        assertEquals(listOf(new), database.measurements().nextBatch(granted.revision).map { it.id })
        assertEquals(2, database.measurements().counts().total)
        assertEquals(listOf(old), history.list(0.0, "wifi_rssi").map { it.id })
    }

    @Test fun revocationPreservesLocalRowsAndRejectsStaleReceipts() = runBlocking {
        val granted = privacy.choose(true, server)
        val accepted = capture()
        history.save(accepted, 0.0, "mediano", server)
        history.settleBatch(granted.revision, listOf(accepted), emptyList())
        val waiting = capture()
        history.save(waiting, 0.0, "mediano", server)

        val revoked = privacy.choose(false, server)
        history.settleBatch(granted.revision, listOf(waiting), emptyList())
        assertFalse(revoked.enabled)
        assertTrue(revoked.remotePending)
        assertEquals(SYNCED, database.measurements().find(accepted)?.syncState)
        assertEquals(LOCAL_ONLY, database.measurements().find(waiting)?.syncState)
        assertTrue(database.measurements().nextBatch(granted.revision).isEmpty())
    }

    @Test fun failureToQueueRollsBackTheHistoryInsert() = runBlocking {
        privacy.choose(true, server)
        database.openHelper.writableDatabase.execSQL(
            "CREATE TRIGGER fail_enqueue BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT, 'test'); END",
        )
        val id = capture()
        assertThrows(SQLiteException::class.java) {
            runBlocking { history.save(id, 0.0, "mediano", server) }
        }
        assertNull(database.measurements().find(id))
    }

    @Test fun payloadAndReceiptsFollowTheStrictBackendContract() = runBlocking {
        val granted = privacy.choose(true, server)
        val id = capture()
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

    private fun capture(): String {
        val id = UUID.randomUUID().toString()
        CaptureDrafts.put(CaptureDraft(
            id, Reading(Position(-33.45, -70.65, 7.1, 100),
                Signal(-68, "wifi_rssi", "wifi", "wifi_privada", 100)),
            "2026-11-06T15:00:00.000Z",
        ))
        return id
    }
}
