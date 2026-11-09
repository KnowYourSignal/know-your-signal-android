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
class CaptureQualityTest {
    @Test fun poorLocationBlocksCaptureAndAValidReadingRecoversWithoutSaving(): Unit = runBlocking {
        val ui = UiTestDriver()
        val before = ui.database.measurements().counts().total
        ui.launch()
        ui.find(By.text("Medir señal"))
        ui.mockGps(15f).use {
            ui.action("Activar sensores")
            ui.scrollToTop()
            ui.find(By.text("±15.0 m"))
            assertFalse("Inaccurate GPS must never enable capture", ui.reveal(By.desc("Registrar señal")).isEnabled)
            assertEquals(before, ui.database.measurements().counts().total)
            ui.scrollToTop()
            ui.screenshot("12-low-accuracy-blocked")
        }
        ui.mockGps(5f).use {
            ui.find(By.text("Tu señal está lista"))
            assertTrue(ui.reveal(By.desc("Registrar señal")).isEnabled)
            assertEquals(before, ui.database.measurements().counts().total)
            ui.action("Pausar lectura")
        }
    }
}
