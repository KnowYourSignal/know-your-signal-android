package com.knowyoursignal.sync

import com.knowyoursignal.data.CONFIG_VERSION
import com.knowyoursignal.data.MeasurementEntity
import com.knowyoursignal.data.NOTICE_VERSION
import org.json.JSONArray
import org.json.JSONObject

internal object PublicPayloadBuilder {
    fun build(batch: List<MeasurementEntity>): JSONObject {
        require(batch.size in 1..100)
        val measurements = JSONArray()
        batch.forEach { point ->
            measurements.put(JSONObject()
                .put("id", point.id)
                .put("latitud", point.latitude)
                .put("longitud", point.longitude)
                .put("precision_m", point.accuracyM)
                .put("potencia_dbm", point.powerDbm)
                .put("metrica", point.metric)
                .put("tecnologia_radio", point.technology)
                .put("tipo_conexion", point.connection)
                .put("origen_clasificacion", if (point.connection == "wifi_desconocida") "desconocido" else "sistema")
                .put("piso_nivel", point.floor)
                .put("tamano_zona", point.zoneSize)
                .put("capturada_en", point.capturedAt)
                .put("version_config", CONFIG_VERSION)
                .put("version_aviso", NOTICE_VERSION))
        }
        return JSONObject().put("esquema_version", "1.0").put("mediciones", measurements)
    }
}
