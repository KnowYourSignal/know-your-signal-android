package com.knowyoursignal.telemetry

import android.os.Build
import android.telephony.CellInfo
import android.telephony.CellInfoCdma
import android.telephony.CellInfoGsm
import android.telephony.CellInfoLte
import android.telephony.CellInfoNr
import android.telephony.CellInfoWcdma
import android.telephony.CellSignalStrengthNr

internal object SignalMetricMapper {
    @Suppress("DEPRECATION")
    fun cell(info: CellInfo): Signal? {
        val elapsedMs = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            info.timestampMillis
        } else {
            info.timeStamp / 1_000_000
        }
        return when {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && info is CellInfoNr -> {
                val strength = info.cellSignalStrength as? CellSignalStrengthNr ?: return null
                mobile(strength.ssRsrp, "nr_ss_rsrp", "nr", elapsedMs)
            }
            info is CellInfoLte -> {
                val strength = info.cellSignalStrength
                val rsrp = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) strength.rsrp else strength.dbm
                mobile(rsrp, "lte_rsrp", "lte", elapsedMs)
            }
            info is CellInfoGsm -> mobile(info.cellSignalStrength.dbm, "celular_dbm", "otra", elapsedMs)
            info is CellInfoWcdma -> mobile(info.cellSignalStrength.dbm, "celular_dbm", "otra", elapsedMs)
            info is CellInfoCdma -> mobile(info.cellSignalStrength.dbm, "celular_dbm", "otra", elapsedMs)
            else -> null
        }
    }

    private fun mobile(dbm: Int, metric: String, technology: String, elapsedMs: Long) =
        if (dbm in -160..-1) Signal(dbm, metric, technology, "datos_moviles", elapsedMs) else null
}
