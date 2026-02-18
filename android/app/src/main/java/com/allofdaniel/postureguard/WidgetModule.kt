package com.allofdaniel.postureguard

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class WidgetModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName(): String = "WidgetModule"

    @ReactMethod
    fun updateWidget(score: Int, isMonitoring: Boolean, promise: Promise) {
        try {
            val context = reactContext.applicationContext
            PostureWidgetProvider.updateAllWidgets(context, score, isMonitoring)
            
            // Also trigger a direct update to all widgets
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val widgetComponent = ComponentName(context, PostureWidgetProvider::class.java)
            val appWidgetIds = appWidgetManager.getAppWidgetIds(widgetComponent)
            
            for (appWidgetId in appWidgetIds) {
                PostureWidgetProvider.updateWidget(context, appWidgetManager, appWidgetId)
            }
            
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("WIDGET_ERROR", e.message)
        }
    }

    @ReactMethod
    fun hasWidgets(promise: Promise) {
        try {
            val context = reactContext.applicationContext
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val widgetComponent = ComponentName(context, PostureWidgetProvider::class.java)
            val appWidgetIds = appWidgetManager.getAppWidgetIds(widgetComponent)
            promise.resolve(appWidgetIds.isNotEmpty())
        } catch (e: Exception) {
            promise.reject("WIDGET_ERROR", e.message)
        }
    }
}
