package com.knowyoursignal.ui

import android.Manifest
import android.content.Intent
import android.graphics.BitmapFactory
import android.location.Location
import android.location.LocationManager
import android.os.SystemClock
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.BySelector
import androidx.test.uiautomator.Configurator
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.UiObject2
import androidx.test.uiautomator.Until
import com.knowyoursignal.MainActivity
import com.knowyoursignal.data.FieldDatabase
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean
import org.junit.Assert.assertTrue

/** Runs only against a separate application ID; all fixtures stay on the emulator. */
internal class UiTestDriver {
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    val context = instrumentation.targetContext.also {
        check(it.packageName == "com.knowyoursignal.uitest") {
            "UI fixtures must never run in an installation containing personal history"
        }
    }
    val device = UiDevice.getInstance(instrumentation)
    val database = FieldDatabase.open(context)
    val output = File(context.getExternalFilesDir(null), "verification")

    init {
        Configurator.getInstance().setWaitForIdleTimeout(500)
        output.mkdirs()
    }

    fun launch() {
        context.startActivity(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    fun find(selector: BySelector, timeout: Long = 60_000): UiObject2 =
        device.wait(Until.findObject(selector), timeout) ?: missing("Missing UI element: $selector")

    private fun missing(message: String): Nothing {
        runCatching { device.takeScreenshot(File(output, "failure-during-test.png")) }
        runCatching { device.dumpWindowHierarchy(File(output, "failure-during-test.xml")) }
        error(message)
    }

    fun action(label: String, timeout: Long = 60_000) {
        val end = SystemClock.elapsedRealtime() + timeout
        while (SystemClock.elapsedRealtime() < end) {
            val node = device.findObject(By.desc(label))
            if (node != null && node.isEnabled) {
                node.click()
                return
            }
            // Reveal actions below the fold on compact screens and at larger font sizes.
            if (node == null) scrollDown()
            SystemClock.sleep(150)
        }
        missing("Missing or disabled action: $label")
    }

    fun scrollToTop() {
        repeat(3) { scroll(down = false) }
    }

    fun reveal(selector: BySelector): UiObject2 {
        repeat(7) {
            device.findObject(selector)?.let { return it }
            scrollDown()
        }
        return find(selector, 5_000)
    }

    private fun scrollDown() = scroll(down = true)

    private fun scroll(down: Boolean) {
        val bounds = device.findObjects(By.pkg(context.packageName).clazz("android.widget.ScrollView").scrollable(true))
            .map { it.visibleBounds }.filter { it.height() > 150 }
            .minByOrNull { it.width().toLong() * it.height() } ?: return
        val x = bounds.right - 3
        val upper = bounds.top + bounds.height() / 3
        val lower = bounds.top + bounds.height() * 3 / 4
        device.swipe(x, if (down) lower else upper, x, if (down) upper else lower, 12)
    }

    fun screenshot(name: String) {
        check(device.takeScreenshot(File(output, "$name.png")))
    }

    fun resetFixtures() {
        database.clearAllTables()
        context.getSharedPreferences("fieldwork_ui", 0).edit().clear().commit()
        output.listFiles()?.forEach { it.delete() }
    }

    fun mockGps(accuracy: Float = 5f): AutoCloseable =
        mockPosition(LocationManager.GPS_PROVIDER, accuracy, true, -33.45012, -70.65012)

    fun mockApproximatePosition(): AutoCloseable =
        mockPosition(LocationManager.NETWORK_PROVIDER, 150f, false, -18.4783, -70.3126)

    @Suppress("DEPRECATION")
    private fun mockPosition(
        provider: String, accuracyM: Float, grantPrecise: Boolean, latitudeValue: Double, longitudeValue: Double,
    ): AutoCloseable {
        if (grantPrecise) {
            listOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION).forEach {
                instrumentation.uiAutomation.grantRuntimePermission(context.packageName, it)
            }
        }
        device.executeShellCommand("appops set ${context.packageName} android:mock_location allow")
        val manager = context.getSystemService(LocationManager::class.java)
        manager.addTestProvider(provider, false, false, false, false, true, true, true, 1, 1)
        manager.setTestProviderEnabled(provider, true)
        val running = AtomicBoolean(true)
        val thread = Thread {
            while (running.get()) {
                manager.setTestProviderLocation(provider, Location(provider).apply {
                    latitude = latitudeValue
                    longitude = longitudeValue
                    accuracy = accuracyM
                    time = System.currentTimeMillis()
                    elapsedRealtimeNanos = SystemClock.elapsedRealtimeNanos()
                })
                SystemClock.sleep(250)
            }
        }.apply { isDaemon = true; start() }
        return AutoCloseable {
            running.set(false)
            thread.join(2_000)
            manager.removeTestProvider(provider)
        }
    }

    fun evidenceFiles(): Set<String> = File(context.cacheDir, "evidence").listFiles()?.map { it.name }?.toSet().orEmpty()

    fun waitForShareSheet() {
        val end = SystemClock.elapsedRealtime() + 15_000
        while (device.currentPackageName == context.packageName && SystemClock.elapsedRealtime() < end) SystemClock.sleep(100)
        assertTrue("The PNG must open the Android share sheet", device.currentPackageName != context.packageName)
    }

    fun verifyExportedPng(existing: Set<String>, name: String = "evidence-synthetic"): File {
        val end = SystemClock.elapsedRealtime() + 60_000
        var exported: File? = null
        while (exported == null && SystemClock.elapsedRealtime() < end) {
            exported = File(context.cacheDir, "evidence").listFiles()
                ?.filter { it.extension == "png" && it.name !in existing }?.maxByOrNull { it.lastModified() }
            if (exported == null) SystemClock.sleep(200)
        }
        val source = requireNotNull(exported) { "No PNG produced by the share flow" }
        val target = source.copyTo(File(output, "$name.png"), overwrite = true)
        val bitmap = requireNotNull(BitmapFactory.decodeFile(source.path))
        assertTrue("Export must include the complete evidence card", bitmap.width >= 200 && bitmap.height >= 350)
        // All three categories must remain readable in the exported legend.
        val colors = intArrayOf(0xFF22754D.toInt(), 0xFF986313.toInt(), 0xFFB13B45.toInt())
        colors.forEach { expected ->
            var matches = 0
            for (y in 0 until bitmap.height step 2) {
                for (x in 0 until bitmap.width step 2) {
                    if (bitmap.getPixel(x, y) == expected) matches++
                }
            }
            assertTrue("Missing legend color: ${expected.toUInt().toString(16)}", matches >= 2)
        }
        var planeTop = bitmap.height
        var planeBottom = 0
        var gridPixels = 0
        for (y in 0 until bitmap.height step 2) {
            for (x in 0 until bitmap.width step 2) {
                if (bitmap.getPixel(x, y) == 0xFFEAF1FD.toInt()) {
                    planeTop = minOf(planeTop, y)
                    planeBottom = maxOf(planeBottom, y)
                }
                if (bitmap.getPixel(x, y) == 0xFFCCDBF4.toInt()) gridPixels++
            }
        }
        assertTrue("The exported plane must contain its grid", gridPixels >= 20 && planeBottom > planeTop + 100)
        var signalPixels = 0
        for (y in planeTop until planeBottom) {
            for (x in 0 until bitmap.width) {
                if (bitmap.getPixel(x, y) in colors) signalPixels++
            }
        }
        assertTrue("The actual SVG signal must be present inside the exported map", signalPixels >= 8)
        File(output, "$name-metadata.json").writeText(
            "{\"width\":${bitmap.width},\"height\":${bitmap.height},\"bytes\":${source.length()},\"synthetic\":true}",
        )
        bitmap.recycle()
        return target
    }
}
