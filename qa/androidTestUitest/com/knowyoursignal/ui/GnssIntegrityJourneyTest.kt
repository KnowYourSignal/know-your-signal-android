package com.knowyoursignal.ui

import android.Manifest
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.Looper
import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.uiautomator.By
import java.io.File
import org.json.JSONObject
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Compare actual console GNSS metadata with the production UI, without mocks. */
@RunWith(AndroidJUnit4::class)
class GnssIntegrityJourneyTest {
    @Suppress("MissingPermission", "DEPRECATION")
    @Test fun poorConsoleAccuracyIsPreservedAndCaptureStaysBlocked() {
        val ui = UiTestDriver()
        assumeTrue("[QA_CAPABILITY_BLOCKED] Emulator-only GNSS integrity fixture",
            Build.FINGERPRINT.contains("generic") || Build.MODEL.contains("Android SDK"))
        listOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION).forEach {
            ui.instrumentation.uiAutomation.grantRuntimePermission(ui.context.packageName, it)
        }
        ui.resetFixtures()
        ui.launch()
        repeat(3) { ui.action("Continuar") }
        ui.find(By.descStartsWith("Solo uso personal.")).click()
        ui.action("Comenzar")
        ui.find(By.text("Medir señal"))
        ui.action("Activar sensores")

        val manager = ui.context.getSystemService(LocationManager::class.java)
        val listener = object : LocationListener {
            override fun onLocationChanged(location: Location) = Unit
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
            override fun onProviderEnabled(provider: String) = Unit
            override fun onProviderDisabled(provider: String) = Unit
        }
        manager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 0L, 0f, listener, Looper.getMainLooper())
        try {
            val deadline = SystemClock.elapsedRealtime() + 30_000
            var fix = manager.getLastKnownLocation(LocationManager.GPS_PROVIDER)
            while ((fix == null || fix.latitude !in -33.451..-33.449 ||
                    SystemClock.elapsedRealtime() - fix.elapsedRealtimeNanos / 1_000_000 > 5_000) &&
                SystemClock.elapsedRealtime() < deadline) {
                SystemClock.sleep(250)
                fix = manager.getLastKnownLocation(LocationManager.GPS_PROVIDER)
            }
            val raw = fix
            val mock = raw?.let { if (Build.VERSION.SDK_INT >= 31) it.isMock else it.isFromMockProvider }
            val proof = JSONObject().put("synthetic", true).put("api", Build.VERSION.SDK_INT)
                .put("production_anti_mock_unchanged", true)
                .put("raw_accuracy_m", raw?.accuracy).put("raw_mock_flag", mock)
                .put("capture_threshold_m", 10).put("completed", false)
            val file = File(ui.output, "gnss-integrity.json")
            file.writeText(proof.toString(2))
            assumeTrue("[QA_CAPABILITY_BLOCKED] Fresh console GNSS fix unavailable", raw != null &&
                raw.latitude in -33.451..-33.449 &&
                SystemClock.elapsedRealtime() - raw.elapsedRealtimeNanos / 1_000_000 in 0L..5_000L)
            assumeTrue("[QA_CAPABILITY_BLOCKED] Console GNSS marked mock; guard is not bypassed", mock == false)
            val actual = requireNotNull(raw)
            assumeTrue("[QA_CAPABILITY_BLOCKED] Negative fixture requires actual GPS accuracy >=10 m", actual.accuracy >= 10)
            val text = ui.find(By.textStartsWith("±"), 30_000).text ?: ""
            val shown = Regex("±([0-9]+(?:[.,][0-9]+)?)\\s*m").find(text)
                ?.groupValues?.get(1)?.replace(',', '.')?.toDoubleOrNull()
            val capture = ui.reveal(By.desc("Registrar señal"))
            val captureEnabled = capture.isEnabled
            proof.put("display_text", text).put("display_accuracy_m", shown)
                .put("capture_button_enabled", captureEnabled).put("completed", true)
                .put("raw_fix_age_ms", SystemClock.elapsedRealtime() - actual.elapsedRealtimeNanos / 1_000_000)
            file.writeText(proof.toString(2))
            ui.scrollToTop()
            ui.screenshot("28-console-accuracy-integrity")
            assertTrue("GPS accuracy must remain truthful: raw=${actual.accuracy} m, UI=$text", shown != null &&
                kotlin.math.abs(shown - actual.accuracy.toDouble()) <= .11)
            assertFalse("GPS accuracy >=10 m must keep registration blocked; raw=${actual.accuracy} m", captureEnabled)
        } finally {
            manager.removeUpdates(listener)
        }
    }
}
