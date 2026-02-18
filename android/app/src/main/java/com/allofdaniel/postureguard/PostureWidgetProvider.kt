package com.allofdaniel.postureguard

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.widget.RemoteViews
import android.graphics.Color

class PostureWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        
        if (intent.action == ACTION_UPDATE_WIDGET) {
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val appWidgetIds = intent.getIntArrayExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS)
            appWidgetIds?.forEach { appWidgetId ->
                updateWidget(context, appWidgetManager, appWidgetId)
            }
        }
    }

    companion object {
        const val ACTION_UPDATE_WIDGET = "com.allofdaniel.postureguard.UPDATE_WIDGET"
        const val PREFS_NAME = "PostureWidgetPrefs"
        const val KEY_POSTURE_SCORE = "posture_score"
        const val KEY_IS_MONITORING = "is_monitoring"
        const val KEY_LAST_UPDATE = "last_update"

        fun updateWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val score = prefs.getInt(KEY_POSTURE_SCORE, -1)
            val isMonitoring = prefs.getBoolean(KEY_IS_MONITORING, false)

            val views = RemoteViews(context.packageName, R.layout.posture_widget)

            // Update status text
            val statusText = if (isMonitoring) "Monitoring..." else "Tap to start"
            views.setTextViewText(R.id.widget_status, statusText)

            // Update score
            if (score >= 0) {
                views.setTextViewText(R.id.widget_score, score.toString())
                val scoreColor = when {
                    score >= 80 -> Color.parseColor("#4CAF50") // Green
                    score >= 60 -> Color.parseColor("#FFC107") // Yellow
                    else -> Color.parseColor("#F44336") // Red
                }
                views.setTextColor(R.id.widget_score, scoreColor)
            } else {
                views.setTextViewText(R.id.widget_score, "--")
                views.setTextColor(R.id.widget_score, Color.parseColor("#4CAF50"))
            }

            // Set click intent to open the app
            val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            launchIntent?.let {
                it.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                val pendingIntent = PendingIntent.getActivity(
                    context,
                    0,
                    it,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                views.setOnClickPendingIntent(R.id.widget_container, pendingIntent)
            }

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }

        fun updateAllWidgets(context: Context, score: Int, isMonitoring: Boolean) {
            // Use commit() instead of apply() to ensure data is written before broadcast
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit()
                .putInt(KEY_POSTURE_SCORE, score)
                .putBoolean(KEY_IS_MONITORING, isMonitoring)
                .putLong(KEY_LAST_UPDATE, System.currentTimeMillis())
                .commit()

            // Get widget IDs and include them in the broadcast
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val widgetComponent = android.content.ComponentName(context, PostureWidgetProvider::class.java)
            val appWidgetIds = appWidgetManager.getAppWidgetIds(widgetComponent)

            if (appWidgetIds.isNotEmpty()) {
                val intent = Intent(context, PostureWidgetProvider::class.java).apply {
                    action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                    putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, appWidgetIds)
                }
                context.sendBroadcast(intent)
            }
        }
    }
}
