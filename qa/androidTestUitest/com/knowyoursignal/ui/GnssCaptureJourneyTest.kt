package com.knowyoursignal.ui

import android.Manifest
import android.location.LocationManager
import android.os.Build
import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.uiautomator.By
import com.knowyoursignal.data.LOCAL_ONLY
import java.io.File
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Alternative POSITIVE fixture: emulator console GNSS, never addTestProvider.
 * The production anti-mock check remains active. If this emulator marks the
 * console fix as mock, the capability is blocked; it is never forced to pass.
 * All positions/signal data are still synthetic and not physical field evidence.
 */
@RunWith(AndroidJUnit4::class)
class GnssCaptureJourneyTest {
    @Suppress("MissingPermission", "DEPRECATION")
    @Test fun consoleGnssCompletesTheActualCaptureAndPngFlow(): Unit = runBlocking {
        val ui = UiTestDriver()
        assumeTrue("[QA_CAPABILITY_BLOCKED] This fixture is emulator-only",
            Build.FINGERPRINT.contains("generic") || Build.MODEL.contains("Android SDK"))
        listOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION).forEach {
            ui.instrumentation.uiAutomation.grantRuntimePermission(ui.context.packageName, it)
        }
        val manager = ui.context.getSystemService(LocationManager::class.java)
        val deadline = SystemClock.elapsedRealtime() + 30_000
        var fix = manager.getLastKnownLocation(LocationManager.GPS_PROVIDER)
        while ((fix == null || fix.latitude !in -33.451..-33.449) && SystemClock.elapsedRealtime() < deadline) {
            SystemClock.sleep(250)
            fix = manager.getLastKnownLocation(LocationManager.GPS_PROVIDER)
        }
        val actual = fix
        val mock = actual?.let { if (Build.VERSION.SDK_INT >= 31) it.isMock else it.isFromMockProvider }
        File(ui.output, "console-gnss-fixture.json").writeText(JSONObject()
            .put("synthetic", true).put("provider", actual?.provider)
            .put("mock_flag", mock).put("accuracy_m", actual?.accuracy)
            .put("api", Build.VERSION.SDK_INT)
            .put("production_anti_mock_unchanged", true).toString(2))
        assumeTrue("[QA_CAPABILITY_BLOCKED] Console GNSS fix unavailable", actual != null)
        assumeTrue("[QA_CAPABILITY_BLOCKED] Emulator console fix is marked mock; anti-mock is not bypassed", mock == false)
        val validFix = requireNotNull(actual)
        assumeTrue("[QA_CAPABILITY_BLOCKED] Console GNSS accuracy cannot establish a valid positive fixture", validFix.accuracy > 0 && validFix.accuracy < 10)

        ui.resetFixtures()
        ui.launch()
        repeat(3) { ui.action("Continuar") }
        ui.find(By.descStartsWith("Solo uso personal.")).click()
        ui.action("Comenzar")
        ui.find(By.text("Medir señal"))
        ui.screenshot("29-console-wizard")
        ui.action("Activar sensores")
        ui.action("Registrar señal", 120_000)
        ui.find(By.text("Promediando dBm y GPS"), 20_000)
        ui.screenshot("30-stationary-sampling")
        ui.find(By.text("Completar captura"), 150_000)
        assertFalse(ui.reveal(By.desc("Guardar medición")).isEnabled)
        ui.scrollToTop()
        ui.screenshot("31-tethered-pin-drop")
        if (Build.VERSION.SDK_INT < 31) ui.action("No · abierta")
        ui.action("0")
        ui.reveal(By.descStartsWith("Mediano.")).click()
        ui.action("Guardar medición")
        ui.find(By.text("Medición guardada"))
        assertEquals(1, ui.database.measurements().counts().total)
        assertEquals(0, ui.database.measurements().counts().pending)
        assertEquals(false, ui.database.measurements().consent()?.enabled)
        assertEquals(LOCAL_ONLY, ui.database.measurements().list(0, "wifi_rssi", 10).single().syncState)
        ui.action("Ver mi historial")
        ui.find(By.text("Plano de señal"))
        ui.screenshot("32-console-personal-map")
        ui.action("Preparar evidencia PNG")
        ui.find(By.text("Vista previa de evidencia"))
        ui.screenshot("33-console-export-preview")
        val existing = ui.evidenceFiles()
        ui.action("Compartir PNG")
        ui.waitForShareSheet()
        ui.verifyExportedPng(existing, "evidence-current-console-synthetic")
        ui.device.pressBack()
        ui.find(By.descStartsWith("Medir")).click()
        ui.action("Registrar señal", 120_000)
        ui.find(By.text("Completar captura"), 150_000)
        ui.scrollToTop()
        ui.action("Confirmar y guardar aquí")
        ui.find(By.text("Medición guardada"))
        assertEquals(2, ui.database.measurements().counts().total)
        assertEquals(0, ui.database.measurements().counts().pending)
        assertEquals(listOf(LOCAL_ONLY, LOCAL_ONLY), ui.database.measurements().list(0, "wifi_rssi", 10).map { it.syncState })
        ui.action("Ver mi historial")
    }
}
