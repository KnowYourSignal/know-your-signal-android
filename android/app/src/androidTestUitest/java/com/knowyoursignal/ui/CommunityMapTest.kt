package com.knowyoursignal.ui

import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.uiautomator.By
import com.knowyoursignal.R
import java.net.InetAddress
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CommunityMapTest {
    @Test fun denseMapRendersFiltersAndRetainsItsLastViewAfterServerFailure() {
        val ui = UiTestDriver()
        val certificate = ui.context.resources.openRawResource(R.raw.ui_test_ca).bufferedReader().use { it.readText() }
        val privateKey = ui.instrumentation.context.assets.open("ui-test-key.pem").bufferedReader().use { it.readText() }
        val held = HeldCertificate.decode(certificate + "\n" + privateKey)
        val tls = HandshakeCertificates.Builder().heldCertificate(held).build()
        val nextFailure = AtomicInteger(0)
        val requests = AtomicInteger(0)
        val lastMetric = AtomicReference("")
        val server = MockWebServer().apply {
            useHttps(tls.sslSocketFactory(), false)
            dispatcher = object : Dispatcher() {
                override fun dispatch(request: RecordedRequest): MockResponse {
                    if (request.path != "/rest/v1/rpc/public_map_cells") return MockResponse().setResponseCode(404)
                    requests.incrementAndGet()
                    val body = JSONObject(request.body.readUtf8())
                    lastMetric.set(body.getString("metrica_filtro"))
                    val failure = nextFailure.getAndSet(0)
                    if (failure != 0) return MockResponse().setResponseCode(failure).setBody("{}")
                    return MockResponse().setHeader("Content-Type", "application/json").setBody(cells(body))
                }
            }
            start(InetAddress.getByName("127.0.0.1"), 8443)
        }
        try {
            ui.launch()
            ui.find(By.text("Medir señal"))
            val started = SystemClock.elapsedRealtime()
            ui.find(By.descStartsWith("Comunidad")).click()
            ui.find(By.text("50 m por celda"), 120_000)
            val accessibleAt = SystemClock.elapsedRealtime()
            ui.device.waitForIdle(2_000)
            ui.screenshot("06-community-1000-cells")
            val renderedAt = SystemClock.elapsedRealtime()
            assertEquals("wifi_rssi", lastMetric.get())
            assertTrue(requests.get() >= 1)
            java.io.File(ui.output, "map-render-benchmark.json").writeText(JSONObject()
                .put("synthetic", true).put("cells", 1000)
                .put("tap_to_accessible_result_ms", accessibleAt - started)
                .put("tap_to_screenshot_ms", renderedAt - started)
                .put("device", android.os.Build.MODEL)
                .put("api", android.os.Build.VERSION.SDK_INT)
                .put("physical_network_sla_verified", false).toString(2))

            nextFailure.set(503)
            ui.action("Actualizar zona")
            ui.find(By.text("Última consulta"))
            ui.screenshot("07-community-retained-after-error")
            ui.action("Reintentar")
            ui.find(By.text("50 m por celda"))
            ui.scrollToTop()
            ui.action("4G LTE")
            ui.find(By.text("50 m por celda"))
            // Wait for the actual filter request, rather than accepting the previous status label.
            val deadline = SystemClock.elapsedRealtime() + 30_000
            while (lastMetric.get() != "lte_rsrp" && SystemClock.elapsedRealtime() < deadline) SystemClock.sleep(100)
            assertEquals("lte_rsrp", lastMetric.get())
            ui.find(By.text("50 m por celda"))
            ui.screenshot("08-community-mobile-layer")
        } finally { server.shutdown() }
    }

    private fun cells(filters: JSONObject): String {
        val minLat = filters.getDouble("min_lat")
        val minLon = filters.getDouble("min_lon")
        val latSpan = filters.getDouble("max_lat") - minLat
        val lonSpan = filters.getDouble("max_lon") - minLon
        val metric = filters.getString("metrica_filtro")
        return JSONArray().apply {
            repeat(1000) { index ->
                put(JSONObject().put("celda_id", "synthetic-$metric-$index")
                    .put("latitud_centro", minLat + latSpan * ((index / 40) + 0.5) / 25)
                    .put("longitud_centro", minLon + lonSpan * ((index % 40) + 0.5) / 40)
                    .put("mediana_potencia", if (metric == "wifi_rssi") -45 - index % 50 else -80 - index % 45)
                    .put("total_contribuyentes", 5 + index % 7)
                    .put("resolucion_m", 50)
                    .put("metrica", metric)
                    .put("tipo_conexion", if (metric == "wifi_rssi") "wifi_publica" else "datos_moviles"))
            }
        }.toString()
    }
}
