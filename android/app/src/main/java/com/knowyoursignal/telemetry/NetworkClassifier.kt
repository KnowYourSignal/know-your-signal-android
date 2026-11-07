package com.knowyoursignal.telemetry

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.wifi.WifiInfo
import android.os.Build

internal enum class RadioTransport { WIFI, CELLULAR }

internal class NetworkClassifier(context: Context) {
    private val connectivity = context.getSystemService(ConnectivityManager::class.java)

    @Suppress("DEPRECATION")
    fun currentNetwork(): Network? {
        connectivity.activeNetwork?.takeIf { transport(it) != null }?.let { return it }
        // A connected Wi-Fi network can still be measured without an internet route.
        return connectivity.allNetworks.firstOrNull { transport(it) == RadioTransport.WIFI }
    }

    fun wifiInfo(network: Network): WifiInfo? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        connectivity.getNetworkCapabilities(network)?.transportInfo as? WifiInfo
    } else null

    fun transport(network: Network): RadioTransport? {
        val capabilities = connectivity.getNetworkCapabilities(network) ?: return null
        return when {
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> RadioTransport.WIFI
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> RadioTransport.CELLULAR
            else -> null
        }
    }

    fun wifiConnection(info: WifiInfo): String {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return "wifi_desconocida"
        return when (info.currentSecurityType) {
            WifiInfo.SECURITY_TYPE_UNKNOWN -> "wifi_desconocida"
            WifiInfo.SECURITY_TYPE_OPEN, WifiInfo.SECURITY_TYPE_OWE -> "wifi_publica"
            else -> "wifi_privada"
        }
    }
}
