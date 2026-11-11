package com.knowyoursignal.ui

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.uiautomator.By
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
            ui.find(By.text("Una ubicación precisa"))
            ui.screenshot("20-guide-accuracy")
            ui.action("Siguiente")
            ui.find(By.text("La red que estás midiendo"))
            ui.action("Anterior")
            ui.find(By.text("Una ubicación precisa"))
            ui.action("Siguiente")
            ui.action("Siguiente")
            ui.find(By.text("Tú inicias la medición"))
            ui.screenshot("21-guide-capture")
            ui.action("Siguiente")
            ui.find(By.text("Tu historial, siempre contigo"))
            ui.action("Siguiente")
            ui.find(By.text("Explora la cobertura"))
            ui.screenshot("22-guide-community")
            ui.action("Siguiente")
            ui.find(By.text("Tú eliges qué compartir"))
            ui.screenshot("23-guide-privacy")
            ui.action("Siguiente")
            ui.find(By.text("El detalle que necesitas"))
            ui.action("Finalizar guía")
            ui.find(By.text("Medir señal"))
            assertTrue(preferences.getBoolean("guide_overview_v1", false))
            assertEquals(before, ui.database.measurements().counts().total)
            assertEquals(consent?.enabled, ui.database.measurements().consent()?.enabled)
            assertEquals(consent?.revision, ui.database.measurements().consent()?.revision)
            assertEquals(technical, preferences.getBoolean("technicalMode", false))

            ui.action("Guía")
            ui.find(By.text("Una ubicación precisa"))
            ui.device.executeShellCommand("settings put system font_scale 1.5")
            ui.device.setOrientationLeft()
            ui.find(By.text("Una ubicación precisa"))
            val next = ui.find(By.desc("Siguiente"))
            assertTrue("Guide controls stay inside the landscape viewport", next.visibleBounds.bottom <= ui.device.displayHeight)
            ui.screenshot("24-guide-large-text-landscape")
            ui.action("Omitir")
            ui.device.setOrientationNatural()
            ui.device.executeShellCommand("settings put system font_scale $oldScale")
            ui.find(By.text("Medir señal"))

            ui.mockGps().use {
                ui.action("Activar sensores")
                ui.action("Registrar señal", 120_000)
                ui.find(By.text("Indica el piso real"))
                ui.screenshot("25-guide-floor-input")
                ui.action("Siguiente")
                ui.find(By.text("Describe el recinto"))
                ui.screenshot("26-guide-room-size")
                ui.action("Siguiente")
                ui.find(By.text("Confirma y guarda"))
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
            ui.find(By.text("Una ubicación precisa"))
            ui.action("Omitir")
            ui.find(By.text("Ajustes"))
        } finally {
            ui.device.setOrientationNatural()
            ui.device.unfreezeRotation()
            ui.device.executeShellCommand("settings put system font_scale $oldScale")
        }
    }
}
