package com.knowyoursignal.ui

import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.uiautomator.By
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AccessibilityJourneyTest {
    @Test fun largerTextRotationAndTechnicalModeKeepHistoryAndExportUsable() {
        val ui = UiTestDriver()
        val oldScale = ui.device.executeShellCommand("settings get system font_scale").trim()
            .toFloatOrNull()?.toString() ?: "1.0"
        try {
            ui.device.executeShellCommand("settings put system font_scale 1.5")
            ui.launch()
            ui.find(By.text("Medir señal"))
            listOf("Medir", "Mi historial", "Comunidad", "Ajustes").forEach { label ->
                val tab = ui.find(By.descStartsWith(label))
                val bounds = tab.visibleBounds
                assertTrue("Tab must remain visible: $label", bounds.width() > 0 && bounds.height() > 0)
                assertTrue("Tab must stay inside the display: $label", bounds.bottom <= ui.device.displayHeight)
            }
            ui.screenshot("09-large-text-navigation")
            ui.find(By.descStartsWith("Mi historial")).click()
            ui.find(By.text("Plano de señal"))
            ui.action("Preparar evidencia PNG")
            ui.find(By.text("Vista previa de evidencia"))
            ui.device.setOrientationLeft()
            ui.find(By.text("Vista previa de evidencia"))
            val existing = ui.evidenceFiles()
            ui.action("Compartir PNG")
            ui.waitForShareSheet()
            ui.verifyExportedPng(existing, "evidence-large-text-landscape")
            ui.device.pressBack()
            ui.screenshot("10-large-text-landscape")
            ui.device.setOrientationNatural()
            ui.find(By.descStartsWith("Ajustes")).click()
            ui.reveal(By.desc("Modo técnico")).click()
            val end = SystemClock.elapsedRealtime() + 15_000
            val preferences = ui.context.getSharedPreferences("fieldwork_ui", 0)
            while (!preferences.getBoolean("technicalMode", false) && SystemClock.elapsedRealtime() < end) SystemClock.sleep(100)
            assertTrue("Technical mode must be saved locally", preferences.getBoolean("technicalMode", false))
            ui.find(By.descStartsWith("Mi historial")).click()
            ui.scrollToTop()
            ui.find(By.text("Plano de señal"))
            ui.reveal(By.descContains("dBm"))
            ui.screenshot("11-technical-history")
        } finally {
            ui.device.setOrientationNatural()
            ui.device.unfreezeRotation()
            ui.device.executeShellCommand("settings put system font_scale $oldScale")
        }
    }
}
