package com.knowyoursignal

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.knowyoursignal.data.FieldworkModule
import com.knowyoursignal.telemetry.TelemetryModule

class FieldworkPackage : BaseReactPackage() {
    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
        when (name) {
            NativeTelemetrySpec.NAME -> TelemetryModule(reactContext)
            NativeFieldworkSpec.NAME -> FieldworkModule(reactContext)
            else -> null
        }

    override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
        mapOf(
            NativeTelemetrySpec.NAME to ReactModuleInfo(
                NativeTelemetrySpec.NAME, TelemetryModule::class.java.name, false, false, false, true,
            ),
            NativeFieldworkSpec.NAME to ReactModuleInfo(
                NativeFieldworkSpec.NAME, FieldworkModule::class.java.name, false, false, false, true,
            ),
        )
    }
}
