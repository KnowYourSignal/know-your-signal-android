package com.knowyoursignal.ui

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.uiautomator.By
import com.knowyoursignal.data.LOCAL_ONLY
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CaptureJourneyTest {
    @Test fun explicitPrivacyCaptureRoomHistoryAndActualPng(): Unit = runBlocking {
        val ui = UiTestDriver()
        ui.resetFixtures()
        ui.launch()
        repeat(3) { ui.action("Continuar") }
        val local = ui.find(By.descStartsWith("Solo uso personal."))
        val community = ui.find(By.descStartsWith("Aportar a la comunidad."))
        assertFalse("Personal choice starts unchecked", local.isChecked)
        assertFalse("Sharing must never be preselected", community.isChecked)
        assertFalse("Continue requires an explicit decision", ui.find(By.desc("Comenzar")).isEnabled)
        ui.screenshot("01-explicit-choice")
        local.click()
        ui.action("Comenzar")
        ui.find(By.text("Medir señal"))
        ui.mockGps().use {
            ui.action("Activar sensores")
            ui.action("Registrar señal", 120_000)
            ui.find(By.text("Completar captura"))
            assertFalse(ui.reveal(By.desc("Guardar medición")).isEnabled)
            ui.scrollToTop()
            // API 29 cannot read the Wi-Fi security type; the declaration is explicit.
            if (android.os.Build.VERSION.SDK_INT < 31) ui.action("No · abierta")
            ui.action("0")
            ui.reveal(By.descStartsWith("Mediano.")).click()
            ui.action("Guardar medición")
            ui.find(By.text("Medición guardada"))
            assertEquals(1, ui.database.measurements().counts().total)
            assertEquals(0, ui.database.measurements().counts().pending)
            assertEquals(false, ui.database.measurements().consent()?.enabled)
            val point = ui.database.measurements().list(0, "wifi_rssi", 10).single()
            assertEquals(LOCAL_ONLY, point.syncState)
            ui.action("Ver mi historial")
            ui.find(By.text("Plano de señal"))
            ui.screenshot("02-personal-history")
            ui.action("Preparar evidencia PNG")
            ui.find(By.text("Vista previa de evidencia"))
            ui.find(By.textStartsWith("Mediana "))
            ui.screenshot("03-export-preview")
            val existing = ui.evidenceFiles()
            ui.action("Compartir PNG")
            ui.verifyExportedPng(existing)
            ui.waitForShareSheet()
            ui.screenshot("04-android-share")
            ui.device.pressBack()

            // Repeating a room still requires a visible, explicit confirmation.
            ui.find(By.descStartsWith("Medir")).click()
            ui.action("Activar sensores")
            ui.action("Registrar señal", 120_000)
            ui.reveal(By.text("¿Sigues en el mismo recinto?"))
            ui.action("Confirmar y guardar aquí")
            ui.find(By.text("Medición guardada"))
            assertEquals(2, ui.database.measurements().counts().total)
            assertEquals(0, ui.database.measurements().counts().pending)
            assertEquals(listOf("mediano", "mediano"), ui.database.measurements().list(0, "wifi_rssi", 10).map { it.zoneSize })
            ui.action("Ver mi historial")
        }
    }
}
