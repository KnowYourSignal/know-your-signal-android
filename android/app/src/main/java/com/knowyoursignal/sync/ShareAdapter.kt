package com.knowyoursignal.sync

import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

class ShareAdapter(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "ShareModule"

    @ReactMethod
    fun sharePng(fileUri: String, title: String, message: String, promise: Promise) {
        try {
            val cleanPath = if (fileUri.startsWith("file://")) {
                Uri.parse(fileUri).path ?: fileUri.removePrefix("file://")
            } else {
                fileUri
            }

            val sourceFile = File(cleanPath)
            if (!sourceFile.exists() || sourceFile.length() == 0L) {
                promise.reject("E_FILE_NOT_FOUND", "El archivo PNG de evidencia no existe o está vacío.")
                return
            }

            val evidenceDir = File(reactContext.cacheDir, "evidence").apply {
                if (!exists()) mkdirs()
            }
            val targetFile = File(evidenceDir, "evidencia_senal_${System.currentTimeMillis()}.png")

            FileInputStream(sourceFile).use { input ->
                FileOutputStream(targetFile).use { output ->
                    input.copyTo(output)
                }
            }

            val authority = "${reactContext.packageName}.fileprovider"
            val contentUri = FileProvider.getUriForFile(reactContext, authority, targetFile)

            val shareIntent = Intent(Intent.ACTION_SEND).apply {
                type = "image/png"
                putExtra(Intent.EXTRA_STREAM, contentUri)
                putExtra(Intent.EXTRA_SUBJECT, title)
                putExtra(Intent.EXTRA_TEXT, message)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }

            val chooserIntent = Intent.createChooser(shareIntent, title).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }

            reactContext.startActivity(chooserIntent)
            promise.resolve(contentUri.toString())
        } catch (e: Exception) {
            promise.reject("E_SHARE_PNG_FAILED", e.message ?: "Error al abrir selector de compartir PNG", e)
        }
    }
}