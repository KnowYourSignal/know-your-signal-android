package com.knowyoursignal.telemetry

import kotlin.math.abs

internal const val MAX_ACCURACY_M = 10.0
internal const val MAX_READING_AGE_MS = 5_000L
internal const val MAX_READING_SKEW_MS = 2_000L

internal data class Position(
    val latitude: Double,
    val longitude: Double,
    val accuracyM: Double,
    val elapsedMs: Long,
)

internal data class Signal(
    val powerDbm: Int,
    val metric: String,
    val technology: String,
    val connection: String,
    val elapsedMs: Long,
)

internal data class Reading(val position: Position, val signal: Signal) {
    fun validForMs(now: Long): Long =
        (MAX_READING_AGE_MS - (now - minOf(position.elapsedMs, signal.elapsedMs))).coerceAtLeast(0)
}

internal object CaptureValidator {
    fun problem(position: Position?, signal: Signal?, now: Long): String? {
        if (position == null) return "LOCATION_TIMEOUT"
        if (!position.latitude.isFinite() || position.latitude !in -90.0..90.0 ||
            !position.longitude.isFinite() || position.longitude !in -180.0..180.0
        ) return "LOCATION_TIMEOUT"
        if (!position.accuracyM.isFinite() || position.accuracyM <= 0 ||
            position.accuracyM >= MAX_ACCURACY_M
        ) return "LOW_ACCURACY"
        if (signal == null) return "NO_SIGNAL"
        if (now - position.elapsedMs !in 0 until MAX_READING_AGE_MS ||
            now - signal.elapsedMs !in 0 until MAX_READING_AGE_MS
        ) return "STALE_READING"
        if (abs(position.elapsedMs - signal.elapsedMs) > MAX_READING_SKEW_MS) return "OUT_OF_SYNC"
        return null
    }
}
