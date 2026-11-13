package com.knowyoursignal.telemetry

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.Looper
import android.os.SystemClock
import androidx.core.content.ContextCompat
import java.util.concurrent.atomic.AtomicReference
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull

internal class CaptureException(val code: String) : Exception(code)
private const val MAX_MAP_LOCATION_AGE_MS = 10 * 60 * 1_000L

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

        // Approximate location may be throttled. This only centers the map;
        // the stricter capture precision and freshness requirements are retained.
        val cacheAge = if (requirePrecise) 15_000L else MAX_MAP_LOCATION_AGE_MS
        val candidates = providers.mapNotNull { manager.getLastKnownLocation(it) }
            .filter { !it.isSimulated() && it.hasAccuracy() && SystemClock.elapsedRealtime() - it.elapsedMs in 0..cacheAge }
        val cached = if (requirePrecise) {
            candidates.filter { it.provider == gps && it.accuracy < MAX_ACCURACY_M }.minByOrNull { it.accuracy }
                ?: candidates.minByOrNull { it.accuracy }
        } else {
            candidates.maxByOrNull { it.elapsedMs }
        }
        if (cached != null && (!requirePrecise || cached.accuracy < MAX_ACCURACY_M)) {
            return cached.toFreshPosition()
        }

        val best = AtomicReference(cached)
        val fresh = withTimeoutOrNull(3_500) {
            suspendCancellableCoroutine<Location> { continuation ->
                val listener = object : LocationListener {
                    override fun onLocationChanged(location: Location) {
                        if (location.isSimulated() || !location.hasAccuracy() || !continuation.isActive) return
                        val previous = best.get()
                        if (previous == null || location.accuracy <= previous.accuracy ||
                            location.elapsedMs - previous.elapsedMs > 1_500
                        ) best.set(location)
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
                            manager.requestLocationUpdates(provider, 150L, 0f, listener, Looper.getMainLooper())
                        }
                    }
                } catch (error: SecurityException) {
                    manager.removeUpdates(listener)
                    if (continuation.isActive) continuation.resumeWithException(error)
                }
            }
        }
        val location = fresh ?: best.get() ?: throw CaptureException("LOCATION_TIMEOUT")
        return location.toFreshPosition()
    }

    private fun has(permission: String) =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    private val Location.elapsedMs get() = elapsedRealtimeNanos / 1_000_000
    private fun Location.toFreshPosition() = Position(latitude, longitude, accuracy.toDouble(), SystemClock.elapsedRealtime())
    @Suppress("DEPRECATION")
    private fun Location.isSimulated(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) isMock else isFromMockProvider
}
