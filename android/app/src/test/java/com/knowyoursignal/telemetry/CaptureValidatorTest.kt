package com.knowyoursignal.telemetry

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CaptureValidatorTest {
    private val position = Position(-33.45, -70.65, 6.2, 9_000)
    private val signal = Signal(-68, "wifi_rssi", "wifi", "wifi_privada", 9_400)

    @Test fun freshAlignedReadingsAreEligible() {
        assertNull(CaptureValidator.problem(position, signal, 10_000))
    }

    @Test fun exactThresholdIsExcludedToMatchTheServerContract() {
        assertEquals("LOW_ACCURACY", CaptureValidator.problem(position.copy(accuracyM = 10.0), signal, 10_000))
    }

    @Test fun changingWallClockCannotMakeAnOldSensorReadingFresh() {
        assertEquals("STALE_READING", CaptureValidator.problem(position, signal, 14_000))
        assertEquals("STALE_READING", CaptureValidator.problem(position, signal, 8_900))
    }

    @Test fun mismatchedAndMissingSignalsNeverBecomeEligible() {
        assertEquals("OUT_OF_SYNC", CaptureValidator.problem(position.copy(elapsedMs = 6_000), signal, 10_000))
        assertEquals("NO_SIGNAL", CaptureValidator.problem(position, null, 10_000))
    }
}
