package com.knowyoursignal.telemetry

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Looper
import android.os.SystemClock
import androidx.core.content.ContextCompat
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull

internal class CaptureException(val code: String) : Exception(code)

internal class LocationReader(private val context: Context) {
    private val manager = context.getSystemService(LocationManager::class.java)

    @Suppress("MissingPermission")
    suspend fun read(requirePrecise: Boolean): Position {
        val fine = has(Manifest.permission.ACCESS_FINE_LOCATION)
        if (!fine && (requirePrecise || !has(Manifest.permission.ACCESS_COARSE_LOCATION))) {
            throw CaptureException("PERMISSION_DENIED")
        }
        val gps = LocationManager.GPS_PROVIDER
        val network = LocationManager.NETWORK_PROVIDER
        val providers = (if (fine) listOf(gps, network) else listOf(network))
            .filter { manager.isProviderEnabled(it) }
        if (providers.isEmpty()) throw CaptureException("LOCATION_DISABLED")

        val cached = providers.mapNotNull { manager.getLastKnownLocation(it) }
            .filter { it.hasAccuracy() && SystemClock.elapsedRealtime() - it.elapsedMs in 0..1_500 }
            .minByOrNull { it.accuracy }
        if (cached != null && (!requirePrecise || cached.accuracy < MAX_ACCURACY_M)) {
            return cached.toPosition()
        }

        var best = cached
        val fresh = withTimeoutOrNull(5_000) {
            suspendCancellableCoroutine<Location> { continuation ->
                val listener = object : LocationListener {
                    override fun onLocationChanged(location: Location) {
                        if (!location.hasAccuracy() || !continuation.isActive) return
                        if (best == null || location.accuracy <= best!!.accuracy ||
                            location.elapsedMs - best!!.elapsedMs > 1_500
                        ) best = location
                        if (!requirePrecise || location.accuracy < MAX_ACCURACY_M) {
                            manager.removeUpdates(this)
                            continuation.resume(location)
                        }
                    }

                    override fun onProviderEnabled(provider: String) = Unit
                    override fun onProviderDisabled(provider: String) = Unit
                    @Deprecated("Legacy Android callback")
                    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
                }
                continuation.invokeOnCancellation { manager.removeUpdates(listener) }
                try {
                    providers.forEach { provider ->
                        if (continuation.isActive) {
                            manager.requestLocationUpdates(provider, 500L, 0f, listener, Looper.getMainLooper())
                        }
                    }
                } catch (error: SecurityException) {
                    manager.removeUpdates(listener)
                    if (continuation.isActive) continuation.resumeWithException(error)
                }
            }
        }
        val location = fresh ?: best ?: throw CaptureException("LOCATION_TIMEOUT")
        if (SystemClock.elapsedRealtime() - location.elapsedMs !in 0 until MAX_READING_AGE_MS) {
            throw CaptureException("STALE_READING")
        }
        return location.toPosition()
    }

    private fun has(permission: String) =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    private val Location.elapsedMs get() = elapsedRealtimeNanos / 1_000_000
    private fun Location.toPosition() = Position(latitude, longitude, accuracy.toDouble(), elapsedMs)
}
