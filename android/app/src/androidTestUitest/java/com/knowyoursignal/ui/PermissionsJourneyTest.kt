package com.knowyoursignal.ui

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.uiautomator.By
import java.util.regex.Pattern
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PermissionsJourneyTest {
    @Test fun denyingLocationKeepsCaptureStoppedAndPersonalHistoryAvailable(): Unit = runBlocking {
        val ui = UiTestDriver()
        val before = ui.database.measurements().counts().total
        ui.launch()
        ui.find(By.text("Medir señal"))
        ui.action("Activar sensores")
        ui.find(By.res(Pattern.compile(".*:id/permission_deny_button"))).click()
        ui.find(By.desc("Activar sensores"))
        ui.reveal(By.desc("Permisos de la app"))
        assertEquals(before, ui.database.measurements().counts().total)
        ui.screenshot("13-location-denied")
        ui.find(By.descStartsWith("Mi historial")).click()
        ui.find(By.text("Plano de señal"))
        ui.action("Preparar evidencia PNG")
        ui.find(By.textStartsWith("Mediana "))
        ui.screenshot("14-history-without-location-permission")
    }
}
