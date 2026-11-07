package com.knowyoursignal.telemetry

import android.content.Context
import android.net.wifi.SupplicantState
import android.net.wifi.WifiManager
import android.os.Build
import android.os.SystemClock
import android.telephony.CellInfo
import android.telephony.SubscriptionManager
import android.telephony.TelephonyManager
import androidx.core.content.ContextCompat
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull

internal class SignalReader(private val context: Context) {
    private val classifier = NetworkClassifier(context)

    suspend fun read(): Signal? = when (classifier.activeTransport()) {
        RadioTransport.WIFI -> readWifi()
        RadioTransport.CELLULAR -> readCellular()
        null -> null
    }

    @Suppress("DEPRECATION")
    private fun readWifi(): Signal? {
        val info = context.getSystemService(WifiManager::class.java)?.connectionInfo ?: return null
        if (info.supplicantState != SupplicantState.COMPLETED || info.rssi !in -126..-1) return null
        // WifiInfo has no sample timestamp. This is the elapsed time of the current read.
        return Signal(info.rssi, "wifi_rssi", "wifi", classifier.wifiConnection(info), SystemClock.elapsedRealtime())
    }

    @Suppress("MissingPermission")
    private suspend fun readCellular(): Signal? {
        var manager = context.getSystemService(TelephonyManager::class.java) ?: return null
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            val dataSubscription = SubscriptionManager.getDefaultDataSubscriptionId()
            if (dataSubscription != SubscriptionManager.INVALID_SUBSCRIPTION_ID) {
                manager = manager.createForSubscriptionId(dataSubscription)
            }
        }
        bestFreshSignal(manager.allCellInfo.orEmpty(), 1_500)?.let { return it }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            return bestFreshSignal(manager.allCellInfo.orEmpty(), MAX_READING_SKEW_MS)
        }
        val cells = withTimeoutOrNull(1_750) {
            suspendCancellableCoroutine<List<CellInfo>> { continuation ->
                try {
                    manager.requestCellInfoUpdate(ContextCompat.getMainExecutor(context),
                        object : TelephonyManager.CellInfoCallback() {
                            override fun onCellInfo(cellInfo: MutableList<CellInfo>) {
                                if (continuation.isActive) continuation.resume(cellInfo)
                            }

                            override fun onError(errorCode: Int, detail: Throwable?) {
                                if (continuation.isActive) continuation.resume(emptyList())
                            }
                        },
                    )
                } catch (error: SecurityException) {
                    if (continuation.isActive) continuation.resumeWithException(error)
                } catch (_: UnsupportedOperationException) {
                    if (continuation.isActive) continuation.resume(emptyList())
                }
            }
        }.orEmpty()
        return bestFreshSignal(cells, MAX_READING_SKEW_MS)
    }

    private fun bestFreshSignal(cells: List<CellInfo>, maxAgeMs: Long): Signal? {
        val now = SystemClock.elapsedRealtime()
        return cells.asSequence().filter { it.isRegistered }
            .mapNotNull(SignalMetricMapper::cell)
            .filter { now - it.elapsedMs in 0..maxAgeMs }
            .maxByOrNull { it.elapsedMs }
    }
}
