package com.knowyoursignal.ui

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.uiautomator.By
import java.util.regex.Pattern
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MapPermissionJourneyTest {
    @Test fun grantingApproximateLocationCentersTheMapFromTheFirstRequest(): Unit = runBlocking {
        val ui = UiTestDriver()
        val before = ui.database.measurements().counts().total
        ui.launch()
        ui.find(By.text("Medir señal"))
        ui.find(By.descStartsWith("Comunidad")).click()
        ui.find(By.text("Mapa comunitario"))
        ui.mockApproximatePosition().use {
            ui.action("Mi zona")
            ui.find(By.res(Pattern.compile(".*:id/permission_allow_(foreground_only_)?button"))).click()
            ui.find(By.textStartsWith("-18."))
            assertEquals(before, ui.database.measurements().counts().total)
            ui.screenshot("15-map-approximate-permission")
        }
    }
}
