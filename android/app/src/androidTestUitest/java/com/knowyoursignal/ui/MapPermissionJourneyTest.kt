package com.knowyoursignal.ui

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.uiautomator.By
import com.knowyoursignal.data.ConsentRepository
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
        // Independent synthetic setup; CaptureJourneyTest checks the actual opt-in UI.
        ui.database.measurements().consent() ?: ConsentRepository(ui.database)
            .choose(false, "https://127.0.0.1:8443")
        ui.launch()
        ui.find(By.text("Medir señal"))
        ui.find(By.descStartsWith("Comunidad")).click()
        ui.find(By.text("Mapa comunitario"))
        ui.mockApproximatePosition().use {
            ui.action("Mi zona")
            ui.screenshot("15-before-approximate-permission")
            ui.find(By.res(Pattern.compile(".*:id/permission_allow_(foreground_only_)?button"))).click()
            ui.screenshot("16-after-approximate-permission")
            assertEquals(android.content.pm.PackageManager.PERMISSION_GRANTED,
                androidx.core.content.ContextCompat.checkSelfPermission(ui.context, android.Manifest.permission.ACCESS_COARSE_LOCATION))
            if (android.os.Build.VERSION.SDK_INT >= 31) {
                assertEquals(android.content.pm.PackageManager.PERMISSION_DENIED,
                    androidx.core.content.ContextCompat.checkSelfPermission(ui.context, android.Manifest.permission.ACCESS_FINE_LOCATION))
            }
            val manager = ui.context.getSystemService(android.location.LocationManager::class.java)
            val cached = runCatching { manager.getLastKnownLocation(android.location.LocationManager.NETWORK_PROVIDER) }.getOrNull()
            java.io.File(ui.output, "map-permission-state.json").writeText(org.json.JSONObject()
                .put("synthetic", true)
                .put("coarse", androidx.core.content.ContextCompat.checkSelfPermission(ui.context, android.Manifest.permission.ACCESS_COARSE_LOCATION))
                .put("fine", androidx.core.content.ContextCompat.checkSelfPermission(ui.context, android.Manifest.permission.ACCESS_FINE_LOCATION))
                .put("provider_enabled", manager.isProviderEnabled(android.location.LocationManager.NETWORK_PROVIDER))
                .put("cached_latitude", cached?.latitude)
                .put("cached_age_ms", cached?.let { android.os.SystemClock.elapsedRealtime() - it.elapsedRealtimeNanos / 1_000_000 })
                .toString(2))
            ui.find(By.textStartsWith("-18."))
            assertEquals(before, ui.database.measurements().counts().total)
            ui.screenshot("15-map-approximate-permission")
        }
    }
}
