package com.knowyoursignal

import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.work.ListenableWorker.Result
import com.knowyoursignal.data.ConsentRepository
import com.knowyoursignal.data.FieldDatabase
import com.knowyoursignal.data.LOCAL_ONLY
import com.knowyoursignal.data.LocalRepository
import com.knowyoursignal.sync.AuthSession
import com.knowyoursignal.sync.OutboxSynchronizer
import com.knowyoursignal.sync.SessionStore
import com.knowyoursignal.sync.SyncApi
import com.knowyoursignal.sync.SyncConfig
import com.knowyoursignal.sync.SyncCoordinator
import com.knowyoursignal.telemetry.CaptureDraft
import com.knowyoursignal.telemetry.CaptureDrafts
import com.knowyoursignal.telemetry.Position
import com.knowyoursignal.telemetry.Reading
import com.knowyoursignal.telemetry.Signal
import java.time.Instant
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/** HTTPS requests hit only a local test server. No hosted credentials or measurements are used. */
@RunWith(AndroidJUnit4::class)
class SyncIntegrationTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private lateinit var server: MockWebServer
    private lateinit var database: FieldDatabase
    private lateinit var config: SyncConfig
    private lateinit var store: SessionStore
    private lateinit var synchronizer: OutboxSynchronizer
    private lateinit var history: LocalRepository
    private lateinit var privacy: ConsentRepository

    @Before fun open() {
        val certificate = HeldCertificate.Builder().commonName("localhost")
            .addSubjectAlternativeName("localhost").build()
        val serverTls = HandshakeCertificates.Builder().heldCertificate(certificate).build()
        val clientTls = HandshakeCertificates.Builder().addTrustedCertificate(certificate.certificate).build()
        server = MockWebServer().apply { useHttps(serverTls.sslSocketFactory(), false); start() }
        config = SyncConfig(server.url("/"), "sb_publishable_local_test_only")
        clearTestSession()
        store = SessionStore(context, config.server)
        val client = OkHttpClient.Builder()
            .sslSocketFactory(clientTls.sslSocketFactory(), clientTls.trustManager)
            .callTimeout(5, TimeUnit.SECONDS).followRedirects(false)
            .followSslRedirects(false).retryOnConnectionFailure(false).build()
        database = Room.inMemoryDatabaseBuilder(context, FieldDatabase::class.java).build()
        history = LocalRepository(database)
        privacy = ConsentRepository(database)
        synchronizer = OutboxSynchronizer(config, database, SyncApi(config, client), store)
    }

    @After fun close() {
        server.shutdown()
        database.close()
        clearTestSession()
    }

    @Test fun expiredAccessRefreshesRotatingTokensAndDuplicateReceiptSettlesOnce(): Unit = runBlocking {
        val consent = privacy.choose(true, config.server)
        val id = queue(consent.revision)
        respond(session("access-old", "refresh-old"))
        respond("{}")
        respond("{}", 401)
        respond(session("access-new", "refresh-new"))
        respond(receipt(duplicates = listOf(id)))

        assertEquals(Result.success(), synchronizer.sync())
        assertEquals(1, database.measurements().counts().synced)
        assertEquals(0, database.measurements().counts().pending)
        assertEquals(false, database.measurements().consent()?.remotePending)
        assertEquals("refresh-new", store.read()?.refreshToken)
        val signup = takeRequest()
        assertEquals("/auth/v1/signup", signup.path)
        assertNull(signup.getHeader("Authorization"))
        assertEquals(config.publishableKey, signup.getHeader("apikey"))
        assertEquals("/rest/v1/rpc/set_consent", takeRequest().path)
        assertEquals("Bearer access-old", takeRequest().getHeader("Authorization"))
        val refresh = takeRequest()
        assertEquals("/auth/v1/token?grant_type=refresh_token", refresh.path)
        assertEquals("refresh-old", JSONObject(refresh.body.readUtf8()).getString("refresh_token"))
        assertEquals("Bearer access-new", takeRequest().getHeader("Authorization"))
    }

    @Test fun rateLimitRetainsQueueAndRetryUsesTheSameMeasurementId(): Unit = runBlocking {
        seedSession()
        val consent = privacy.choose(true, config.server)
        val id = queue(consent.revision)
        respond("{}")
        respond("{}", 429)
        assertEquals(Result.retry(), synchronizer.sync())
        assertEquals("RATE_LIMITED", database.measurements().consent()?.lastProblem)
        assertEquals(listOf(id), database.measurements().nextBatch(consent.revision).map { it.id })
        respond(receipt(duplicates = listOf(id)))
        assertEquals(Result.success(), synchronizer.sync())
        assertEquals(1, database.measurements().counts().synced)
        assertNull(database.measurements().consent()?.lastProblem)
        takeRequest() // consent
        val initial = JSONObject(takeRequest().body.readUtf8()).getJSONArray("mediciones").getJSONObject(0)
        val retry = JSONObject(takeRequest().body.readUtf8()).getJSONArray("mediciones").getJSONObject(0)
        assertEquals(id, initial.getString("id"))
        assertEquals(initial.toString(), retry.toString())
    }

    @Test fun partialReceiptAndServerFailurePreserveOnlyRetryableRows(): Unit = runBlocking {
        seedSession()
        val consent = privacy.choose(true, config.server)
        val accepted = queue(consent.revision)
        val rejected = queue(consent.revision)
        val waiting = queue(consent.revision)
        respond("{}")
        respond(JSONObject().put("aceptadas", JSONArray().put(accepted))
            .put("duplicadas", JSONArray()).put("rechazadas", JSONArray()
                .put(JSONObject().put("id", rejected).put("reintentable", false))
                .put(JSONObject().put("id", waiting).put("reintentable", true))).toString())
        assertEquals(Result.retry(), synchronizer.sync())
        assertEquals(1, database.measurements().counts().synced)
        assertEquals(1, database.measurements().counts().failed)
        assertEquals(listOf(waiting), database.measurements().nextBatch(consent.revision).map { it.id })
        respond("{}", 503)
        assertEquals(Result.retry(), synchronizer.sync())
        assertEquals("SERVICE_UNAVAILABLE", database.measurements().consent()?.lastProblem)
        assertEquals(1, database.measurements().counts().pending)
        respond(receipt(accepted = listOf(waiting)))
        assertEquals(Result.success(), synchronizer.sync())
        assertEquals(2, database.measurements().counts().synced)
    }

    @Test fun incompleteReceiptNeverDiscardsAPendingCapture(): Unit = runBlocking {
        seedSession()
        val consent = privacy.choose(true, config.server)
        val id = queue(consent.revision)
        respond("{}")
        respond(receipt())
        assertEquals(Result.retry(), synchronizer.sync())
        assertEquals("INVALID_RESPONSE", database.measurements().consent()?.lastProblem)
        assertEquals(listOf(id), database.measurements().nextBatch(consent.revision).map { it.id })
    }

    @Test fun revocationDuringUploadCancelsAndKeepsHistoryPrivate(): Unit = runBlocking {
        seedSession()
        val consent = privacy.choose(true, config.server)
        val id = queue(consent.revision)
        val enteredUpload = CountDownLatch(1)
        val release = CountDownLatch(1)
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                if (request.path == "/functions/v1/ingest-measurements") {
                    enteredUpload.countDown()
                    release.await(5, TimeUnit.SECONDS)
                    return MockResponse().setBody(receipt(accepted = listOf(id)))
                }
                return MockResponse().setBody("{}")
            }
        }
        val work = async(Dispatchers.IO) { synchronizer.sync() }
        try {
            withContext(Dispatchers.IO) { assertTrue(enteredUpload.await(10, TimeUnit.SECONDS)) }
            SyncCoordinator.consent.withLock {
                privacy.choose(false, config.server)
                SyncCoordinator.cancelUpload()
            }
        } finally { release.countDown() }
        work.await()
        assertEquals(LOCAL_ONLY, database.measurements().find(id)?.syncState)
        assertEquals(0, database.measurements().counts().synced)
        assertFalse(database.measurements().hasQueued(consent.revision))
        assertEquals(Result.success(), synchronizer.sync())
        assertEquals(false, database.measurements().consent()?.remotePending)
        assertEquals(3, server.requestCount) // grant, cancelled upload, revoke
    }

    private fun seedSession() = store.write(AuthSession("access-current", "refresh-current", System.currentTimeMillis() + 3_600_000))
    private fun session(access: String, refresh: String) = JSONObject()
        .put("access_token", access).put("refresh_token", refresh).put("expires_in", 3600).toString()
    private fun receipt(accepted: List<String> = emptyList(), duplicates: List<String> = emptyList()) =
        JSONObject().put("aceptadas", JSONArray(accepted)).put("duplicadas", JSONArray(duplicates))
            .put("rechazadas", JSONArray()).toString()
    private fun respond(body: String, code: Int = 200) { server.enqueue(MockResponse().setResponseCode(code).setBody(body)) }
    private fun takeRequest() = requireNotNull(server.takeRequest(5, TimeUnit.SECONDS))
    private fun clearTestSession() {
        context.getSharedPreferences("fieldwork_sessions", 0).edit().remove("session:${config.server}").commit()
    }
    private suspend fun queue(revision: Long): String {
        val id = UUID.randomUUID().toString()
        CaptureDrafts.put(CaptureDraft(id,
            Reading(Position(-33.45, -70.65, 5.0, 100), Signal(-65, "wifi_rssi", "wifi", "wifi_privada", 100)),
            Instant.now().toString(), revision))
        history.save(id, 0.0, "mediano", config.server)
        CaptureDrafts.forget(id)
        return id
    }
}
