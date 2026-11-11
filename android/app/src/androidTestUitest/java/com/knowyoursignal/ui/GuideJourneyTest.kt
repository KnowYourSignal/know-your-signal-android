package com.knowyoursignal.ui

import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.uiautomator.By
import androidx.test.uiautomator.StaleObjectException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class GuideJourneyTest {
    @Test fun anchoredToursReplayRotateAndNeverChangeConsentOrCaptureForTheUser(): Unit = runBlocking {
        val ui = UiTestDriver()
        val before = ui.database.measurements().counts().total
        val consent = ui.database.measurements().consent()
        val preferences = ui.context.getSharedPreferences("fieldwork_ui", 0)
        val technical = preferences.getBoolean("technicalMode", false)
        check(preferences.edit().remove("guide_overview_v1").remove("guide_room_v1").commit())
        val oldScale = ui.device.executeShellCommand("settings get system font_scale").trim().toFloatOrNull()?.toString() ?: "1.0"
        try {
            ui.launch(showGuides = true)
            anchoredStep(ui, "Una ubicación precisa")
            ui.screenshot("20-guide-accuracy")
            ui.action("Siguiente")
            anchoredStep(ui, "La red que estás midiendo")
            ui.action("Anterior")
            anchoredStep(ui, "Una ubicación precisa")
            ui.action("Siguiente")
            ui.action("Siguiente")
            anchoredStep(ui, "Tú inicias la medición")
            ui.screenshot("21-guide-capture")
            ui.action("Siguiente")
            anchoredStep(ui, "Tu historial, siempre contigo")
            ui.action("Siguiente")
            anchoredStep(ui, "Explora la cobertura")
            ui.screenshot("22-guide-community")
            ui.action("Siguiente")
            anchoredStep(ui, "Tú eliges qué compartir")
            ui.screenshot("23-guide-privacy")
            ui.action("Siguiente")
            anchoredStep(ui, "El detalle que necesitas", last = true)
            ui.action("Finalizar guía")
            ui.find(By.text("Medir señal"))
            assertTrue(preferences.getBoolean("guide_overview_v1", false))
            assertEquals(before, ui.database.measurements().counts().total)
            assertEquals(consent?.enabled, ui.database.measurements().consent()?.enabled)
            assertEquals(consent?.revision, ui.database.measurements().consent()?.revision)
            assertEquals(technical, preferences.getBoolean("technicalMode", false))

            ui.action("Guía")
            anchoredStep(ui, "Una ubicación precisa")
            ui.device.executeShellCommand("settings put system font_scale 1.5")
            ui.device.setOrientationLeft()
            anchoredStep(ui, "Una ubicación precisa")
            val next = ui.find(By.desc("Siguiente"))
            assertTrue("Guide controls stay inside the landscape viewport", next.visibleBounds.bottom <= ui.device.displayHeight)
            ui.screenshot("24-guide-large-text-landscape")
            ui.device.pressBack()
            ui.device.setOrientationNatural()
            ui.device.executeShellCommand("settings put system font_scale $oldScale")
            ui.find(By.text("Medir señal"))

            ui.mockGps().use {
                ui.action("Activar sensores")
                ui.action("Registrar señal", 120_000)
                anchoredStep(ui, "Indica el piso real")
                ui.screenshot("25-guide-floor-input")
                ui.action("Siguiente")
                anchoredStep(ui, "Describe el recinto")
                ui.screenshot("26-guide-room-size")
                ui.action("Siguiente")
                anchoredStep(ui, "Confirma y guarda", last = true)
                ui.action("Finalizar guía")
                ui.find(By.text("Completar captura"))
                assertFalse("The tour must not complete the form", ui.reveal(By.desc("Guardar medición")).isEnabled)
                assertEquals(before, ui.database.measurements().counts().total)
                assertEquals(consent?.enabled, ui.database.measurements().consent()?.enabled)
                assertEquals(consent?.revision, ui.database.measurements().consent()?.revision)
                assertTrue(preferences.getBoolean("guide_room_v1", false))
                ui.action("Volver a Medir")
                ui.action("Pausar lectura")
            }
            ui.find(By.descStartsWith("Ajustes")).click()
            ui.action("Repetir guía interactiva")
            anchoredStep(ui, "Una ubicación precisa")
            ui.action("Omitir")
            ui.find(By.text("Ajustes"))
        } finally {
            ui.device.setOrientationNatural()
            ui.device.unfreezeRotation()
            ui.device.executeShellCommand("settings put system font_scale $oldScale")
        }
    }

    private fun anchoredStep(ui: UiTestDriver, title: String, last: Boolean = false) {
        ui.find(By.text(title))
        val action = if (last) "Finalizar guía" else "Siguiente"
        val end = SystemClock.elapsedRealtime() + 20_000
        while (SystemClock.elapsedRealtime() < end) {
            val ready = try {
                ui.device.findObject(By.desc(action))?.isEnabled == true
            } catch (_: StaleObjectException) {
                false
            }
            if (ready) {
                ui.device.waitForIdle()
                val missing = ui.device.hasObject(By.textStartsWith("No pudimos señalar este control"))
                if (missing) ui.screenshot("guide-unresolved-target")
                assertFalse("The tour must measure and highlight the actual control: $title", missing)
                return
            }
            SystemClock.sleep(100)
        }
        ui.screenshot("guide-stalled-step")
        error("Guide controls did not become available: $title")
    }
}
