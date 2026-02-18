package com.allofdaniel.postureguard

import android.app.Activity
import android.app.PictureInPictureParams
import android.content.pm.PackageManager
import android.os.Build
import android.util.Rational
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class PipModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName(): String = "PipModule"

    @ReactMethod
    fun isPipSupported(promise: Promise) {
        try {
            val activity = reactContext.currentActivity
            if (activity == null) {
                promise.resolve(false)
                return
            }

            val supported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                activity.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)
            promise.resolve(supported)
        } catch (e: Exception) {
            promise.reject("PIP_ERROR", e.message)
        }
    }

    @ReactMethod
    fun enterPipMode(aspectRatioWidth: Int, aspectRatioHeight: Int, promise: Promise) {
        try {
            val activity = reactContext.currentActivity
            if (activity == null) {
                promise.reject("PIP_ERROR", "Activity not found")
                return
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val aspectRatio = Rational(aspectRatioWidth, aspectRatioHeight)
                val params = PictureInPictureParams.Builder()
                    .setAspectRatio(aspectRatio)
                    .build()

                val result = activity.enterPictureInPictureMode(params)
                promise.resolve(result)
            } else {
                promise.reject("PIP_ERROR", "PiP not supported on this device")
            }
        } catch (e: Exception) {
            promise.reject("PIP_ERROR", e.message)
        }
    }

    @ReactMethod
    fun isInPipMode(promise: Promise) {
        try {
            val activity = reactContext.currentActivity
            if (activity == null) {
                promise.resolve(false)
                return
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                promise.resolve(activity.isInPictureInPictureMode)
            } else {
                promise.resolve(false)
            }
        } catch (e: Exception) {
            promise.reject("PIP_ERROR", e.message)
        }
    }

    @ReactMethod
    fun setAutoEnterPip(enabled: Boolean, promise: Promise) {
        try {
            val activity = reactContext.currentActivity as? MainActivity
            if (activity == null) {
                promise.reject("PIP_ERROR", "Activity not found")
                return
            }
            activity.setAutoEnterPip(enabled)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("PIP_ERROR", e.message)
        }
    }

    @ReactMethod
    fun updatePipStatus(
        warnings: Int,
        alerts: Int,
        time: String,
        achievementRate: Int,
        status: String,
        isGoodPosture: Boolean
    ) {
        try {
            val activity = reactContext.currentActivity as? MainActivity
            activity?.updatePipStatus(warnings, alerts, time, achievementRate, status, isGoodPosture)
        } catch (e: Exception) {
            // Silently ignore errors - this is called frequently
        }
    }
}
