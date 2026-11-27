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
    private val trackingLock = Any()
    private val latestTracked = AtomicReference<Location?>()
    private var trackingListener: LocationListener? = null

    @Suppress("MissingPermission")
    fun startContinuousTracking() {
        val fine = has(Manifest.permission.ACCESS_FINE_LOCATION)
        if (!fine) return
        val providers = activeProviders(fine = true, requirePrecise = true)
        if (providers.isEmpty()) return
        synchronized(trackingLock) {
            if (trackingListener != null) return
            val listener = object : LocationListener {
                override fun onLocationChanged(location: Location) {
                    if (location.isSimulated() || !location.hasAccuracy() || location.accuracy <= 0f) return
                    val now = SystemClock.elapsedRealtime()
                    val previous = latestTracked.get()
                    if (isBetterFix(location, previous, now)) {
                        latestTracked.set(location)
                    }
                }

                override fun onProviderEnabled(provider: String) = Unit
                override fun onProviderDisabled(provider: String) = Unit
                @Deprecated("Legacy Android callback")
                override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
            }
            try {
                providers.forEach { provider ->
                    manager.requestLocationUpdates(provider, 500L, 0f, listener, Looper.getMainLooper())
                }
                trackingListener = listener
            } catch (_: SecurityException) {
                runCatching { manager.removeUpdates(listener) }
            }
        }
    }

    fun stopContinuousTracking() {
        val listener = synchronized(trackingLock) {
            latestTracked.set(null)
            trackingListener.also { trackingListener = null }
        }
        if (listener != null) {
            runCatching { manager.removeUpdates(listener) }
        }
    }

    private fun activeProviders(fine: Boolean, requirePrecise: Boolean): List<String> {
        val gps = LocationManager.GPS_PROVIDER
        val network = LocationManager.NETWORK_PROVIDER
        val isUiTest = com.knowyoursignal.BuildConfig.BUILD_TYPE == "uitest"
        if (isUiTest) {
            val primary = (if (fine) listOf(gps, network) else listOf(network))
                .filter { manager.isProviderEnabled(it) }
            return primary.ifEmpty {
                if (!requirePrecise && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
                    manager.isProviderEnabled(LocationManager.FUSED_PROVIDER)
                ) {
                    listOf(LocationManager.FUSED_PROVIDER)
                } else {
                    emptyList()
                }
            }
        }
        return buildList {
            if (fine) add(gps)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                add(LocationManager.FUSED_PROVIDER)
            }
            add(network)
        }.distinct().filter { manager.isProviderEnabled(it) }
    }

    private fun isBetterFix(candidate: Location, previous: Location?, now: Long): Boolean {
        if (previous == null) return true
        val previousAge = now - previous.elapsedMs
        if (previousAge !in 0..MAX_READING_AGE_MS) return true
        if (candidate.accuracy < MAX_ACCURACY_M) {
            return candidate.accuracy <= previous.accuracy ||
                candidate.elapsedMs - previous.elapsedMs >= 500L
        }
        // Never allow a coarse network fix (>=10 m) to overwrite a fresh precise fix (<10 m).
        if (previous.accuracy < MAX_ACCURACY_M) return false
        return candidate.accuracy <= previous.accuracy ||
            candidate.elapsedMs - previous.elapsedMs > 1_500L
    }

    @Suppress("MissingPermission")
    suspend fun read(requirePrecise: Boolean): Position {
        val fine = has(Manifest.permission.ACCESS_FINE_LOCATION)
        if (!fine && (requirePrecise || !has(Manifest.permission.ACCESS_COARSE_LOCATION))) {
            throw CaptureException("PERMISSION_DENIED")
        }
        val providers = activeProviders(fine = fine, requirePrecise = requirePrecise)
        if (providers.isEmpty()) throw CaptureException("LOCATION_DISABLED")

        // Approximate location may be throttled. This only centers the map;
        // the stricter capture precision and freshness requirements are retained.
        val now = SystemClock.elapsedRealtime()
        val cacheAge = if (requirePrecise) MAX_READING_SKEW_MS else MAX_MAP_LOCATION_AGE_MS
        val tracked = latestTracked.get()
        val candidates = (listOfNotNull(tracked) + providers.mapNotNull { manager.getLastKnownLocation(it) })
            .filter { !it.isSimulated() && it.hasAccuracy() && it.accuracy > 0f && now - it.elapsedMs in 0..cacheAge }
        val cached = if (requirePrecise) {
            candidates.filter { it.accuracy < MAX_ACCURACY_M }.minByOrNull { it.accuracy }
                ?: candidates.minByOrNull { it.accuracy }
        } else {
            candidates.maxByOrNull { it.elapsedMs }
        }
        if (cached != null && (!requirePrecise || cached.accuracy < MAX_ACCURACY_M)) {
            return cached.toFreshPosition()
        }

        val best = AtomicReference(cached)
        val timeoutMs = if (requirePrecise) 3_500L else 8_000L
        val fresh = withTimeoutOrNull(timeoutMs) {
            suspendCancellableCoroutine<Location> { continuation ->
                val listener = object : LocationListener {
                    override fun onLocationChanged(location: Location) {
                        if (location.isSimulated() || !location.hasAccuracy() || location.accuracy <= 0f || !continuation.isActive) return
                        val nowInner = SystemClock.elapsedRealtime()
                        val previous = best.get()
                        if (isBetterFix(location, previous, nowInner)) {
                            best.set(location)
                        }
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
    private fun Location.toFreshPosition() = Position(
        latitude,
        longitude,
        accuracy.toDouble(),
        elapsedMs.coerceAtLeast(1L),
    )
    @Suppress("DEPRECATION")
    private fun Location.isSimulated(): Boolean {
        if (com.knowyoursignal.BuildConfig.BUILD_TYPE == "uitest" &&
            System.getProperty("kys.uitest.mock_provider_allowed") == "true"
        ) {
            return false
        }
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) isMock else isFromMockProvider
    }
}
