package com.allofdaniel.postureguard

import android.content.Context
import android.hardware.camera2.CameraAccessException
import android.hardware.camera2.CameraManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

class TorchModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private val cameraManager: CameraManager = reactContext.getSystemService(Context.CAMERA_SERVICE) as CameraManager
    private var cameraId: String? = null

    init {
        try {
            cameraId = cameraManager.cameraIdList.firstOrNull()
        } catch (e: CameraAccessException) {
            e.printStackTrace()
        }
    }

    override fun getName(): String = "TorchModule"

    @ReactMethod
    fun switchState(state: Boolean, promise: Promise) {
        try {
            cameraId?.let {
                cameraManager.setTorchMode(it, state)
                promise.resolve(true)
            } ?: promise.reject("NO_CAMERA", "No camera available")
        } catch (e: CameraAccessException) {
            promise.reject("TORCH_ERROR", e.message)
        } catch (e: Exception) {
            promise.reject("TORCH_ERROR", e.message)
        }
    }
}
