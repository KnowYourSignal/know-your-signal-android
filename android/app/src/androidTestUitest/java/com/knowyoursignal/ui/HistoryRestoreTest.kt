package com.knowyoursignal.ui

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import com.knowyoursignal.data.LOCAL_ONLY
import kotlinx.coroutines.runBlocking
import org.junit.Assume.assumeTrue
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class HistoryRestoreTest {
    @Test fun personalHistoryReopensAfterProcessDeathWithoutNetwork(): Unit = runBlocking {
        assumeTrue("Run in the separate offline phase after CaptureJourneyTest",
            InstrumentationRegistry.getArguments().getString("restorePhase") == "true")
        val ui = UiTestDriver()
        assertEquals(2, ui.database.measurements().counts().total)
        assertEquals(false, ui.database.measurements().consent()?.enabled)
        assertEquals(listOf(LOCAL_ONLY, LOCAL_ONLY), ui.database.measurements().list(0, "wifi_rssi", 10).map { it.syncState })
        ui.launch()
        ui.find(By.text("Medir señal"))
        ui.find(By.descStartsWith("Mi historial")).click()
        ui.find(By.text("Plano de señal"))
        ui.action("Preparar evidencia PNG")
        ui.find(By.textStartsWith("Mediana "))
        ui.screenshot("05-offline-after-restart")
    }
}
