package com.knowyoursignal.sync

import android.app.Activity
import android.content.ClipData
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import com.knowyoursignal.telemetry.CaptureException
import java.io.File
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

internal object ShareAdapter {
    suspend fun share(activity: Activity, path: String) {
        val uri = withContext(Dispatchers.IO) {
            val parsed = Uri.parse(path)
            if (parsed.scheme != "file" && parsed.scheme != null) throw CaptureException("EXPORT_FAILED")
            val source = File(parsed.path ?: throw CaptureException("EXPORT_FAILED")).canonicalFile
            val parent = source.parentFile ?: throw CaptureException("EXPORT_FAILED")
            val caches = listOfNotNull(activity.cacheDir, activity.externalCacheDir).map { it.canonicalFile }
            if (parent !in caches || !source.name.startsWith("ReactNative-snapshot-image") ||
                source.extension != "png" || !source.isFile || source.length() !in 8..(20 * 1024 * 1024L)
            ) throw CaptureException("EXPORT_FAILED")

            val evidence = File(activity.cacheDir, "evidence").apply { mkdirs() }
            val cutoff = System.currentTimeMillis() - 24 * 60 * 60 * 1000L
            evidence.listFiles()?.filter { it.extension == "png" && it.lastModified() < cutoff }
                ?.forEach { it.delete() }
            val target = File(evidence, "KnowYourSignal-" + UUID.randomUUID() + ".png")
            source.copyTo(target)
            FileProvider.getUriForFile(activity, activity.packageName + ".evidence", target)
        }
        withContext(Dispatchers.Main.immediate) {
            val send = Intent(Intent.ACTION_SEND).apply {
                type = "image/png"
                putExtra(Intent.EXTRA_STREAM, uri)
                clipData = ClipData.newRawUri("Evidencia Know Your Signal", uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            activity.startActivity(Intent.createChooser(send, "Compartir evidencia"))
        }
    }
}
