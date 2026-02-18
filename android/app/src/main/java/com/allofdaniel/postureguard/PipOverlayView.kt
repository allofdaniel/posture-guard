package com.allofdaniel.postureguard

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.DashPathEffect
import android.graphics.RectF
import android.util.AttributeSet
import android.view.View
import com.google.mlkit.vision.pose.Pose
import com.google.mlkit.vision.pose.PoseLandmark

/**
 * Overlay view for PiP mode that draws:
 * 1. Skeleton with dotted green lines (like the web version)
 * 2. Status bar at top showing posture metrics
 */
class PipOverlayView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    // Pose data
    private var currentPose: Pose? = null
    private var imageWidth: Int = 1
    private var imageHeight: Int = 1
    private var isFrontCamera: Boolean = true

    // Status data
    private var warningCount: Int = 0
    private var alertCount: Int = 0
    private var sessionTime: String = "00:00"
    private var achievementRate: Int = 0
    private var statusText: String = "Ready"
    private var isGoodPosture: Boolean = true

    // Paints
    private val skeletonPaint = Paint().apply {
        color = Color.parseColor("#4ADE80")  // Green color like web version
        strokeWidth = 4f
        style = Paint.Style.STROKE
        pathEffect = DashPathEffect(floatArrayOf(10f, 10f), 0f)  // Dotted line
        isAntiAlias = true
    }

    private val pointPaint = Paint().apply {
        color = Color.parseColor("#4ADE80")
        style = Paint.Style.FILL
        isAntiAlias = true
    }

    private val statusBgPaint = Paint().apply {
        color = Color.parseColor("#CC1a1a2e")  // Semi-transparent dark background
        style = Paint.Style.FILL
    }

    private val statusTextPaint = Paint().apply {
        color = Color.WHITE
        textSize = 24f
        isAntiAlias = true
        textAlign = Paint.Align.CENTER
    }

    private val warningPaint = Paint().apply {
        color = Color.parseColor("#FBBF24")  // Yellow/warning color
        textSize = 20f
        isAntiAlias = true
    }

    private val alertPaint = Paint().apply {
        color = Color.parseColor("#EF4444")  // Red/alert color
        textSize = 20f
        isAntiAlias = true
    }

    private val goodPaint = Paint().apply {
        color = Color.parseColor("#4ADE80")  // Green/good color
        textSize = 20f
        isAntiAlias = true
    }

    // Skeleton connections (pairs of landmarks to connect)
    private val skeletonConnections = listOf(
        // Face
        Pair(PoseLandmark.NOSE, PoseLandmark.LEFT_EYE),
        Pair(PoseLandmark.NOSE, PoseLandmark.RIGHT_EYE),
        Pair(PoseLandmark.LEFT_EYE, PoseLandmark.LEFT_EAR),
        Pair(PoseLandmark.RIGHT_EYE, PoseLandmark.RIGHT_EAR),
        // Upper body
        Pair(PoseLandmark.LEFT_SHOULDER, PoseLandmark.RIGHT_SHOULDER),
        Pair(PoseLandmark.LEFT_SHOULDER, PoseLandmark.LEFT_ELBOW),
        Pair(PoseLandmark.RIGHT_SHOULDER, PoseLandmark.RIGHT_ELBOW),
        Pair(PoseLandmark.LEFT_ELBOW, PoseLandmark.LEFT_WRIST),
        Pair(PoseLandmark.RIGHT_ELBOW, PoseLandmark.RIGHT_WRIST),
        // Torso
        Pair(PoseLandmark.LEFT_SHOULDER, PoseLandmark.LEFT_HIP),
        Pair(PoseLandmark.RIGHT_SHOULDER, PoseLandmark.RIGHT_HIP),
        Pair(PoseLandmark.LEFT_HIP, PoseLandmark.RIGHT_HIP),
        // Head to shoulder
        Pair(PoseLandmark.NOSE, PoseLandmark.LEFT_SHOULDER),
        Pair(PoseLandmark.NOSE, PoseLandmark.RIGHT_SHOULDER),
    )

    fun updatePose(pose: Pose?, imgWidth: Int, imgHeight: Int, frontCamera: Boolean) {
        currentPose = pose
        imageWidth = imgWidth
        imageHeight = imgHeight
        isFrontCamera = frontCamera
        invalidate()
    }

    fun updateStatus(warnings: Int, alerts: Int, time: String, rate: Int, status: String, goodPosture: Boolean) {
        warningCount = warnings
        alertCount = alerts
        sessionTime = time
        achievementRate = rate
        statusText = status
        isGoodPosture = goodPosture
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        drawStatusBar(canvas)
        drawSkeleton(canvas)
    }

    private fun drawStatusBar(canvas: Canvas) {
        val statusBarHeight = 50f

        // Draw background
        canvas.drawRect(0f, 0f, width.toFloat(), statusBarHeight, statusBgPaint)

        // Use larger text for small PiP window
        val fontSize = 16f
        warningPaint.textSize = fontSize
        alertPaint.textSize = fontSize
        goodPaint.textSize = fontSize
        statusTextPaint.textSize = fontSize

        // Draw status items - use text labels instead of emojis for performance
        val itemWidth = width / 5f
        var x = itemWidth / 2
        val textY = statusBarHeight / 2 + fontSize / 3

        // Warning count (yellow)
        warningPaint.textAlign = Paint.Align.CENTER
        canvas.drawText("W:$warningCount", x, textY, warningPaint)
        x += itemWidth

        // Alert count (red)
        alertPaint.textAlign = Paint.Align.CENTER
        canvas.drawText("A:$alertCount", x, textY, alertPaint)
        x += itemWidth

        // Session time (white)
        statusTextPaint.textAlign = Paint.Align.CENTER
        canvas.drawText(sessionTime, x, textY, statusTextPaint)
        x += itemWidth

        // Achievement rate (green)
        goodPaint.textAlign = Paint.Align.CENTER
        canvas.drawText("$achievementRate%", x, textY, goodPaint)
        x += itemWidth

        // Status indicator
        val statusPaint = if (isGoodPosture) goodPaint else alertPaint
        statusPaint.textAlign = Paint.Align.CENTER
        canvas.drawText(if (isGoodPosture) "OK" else "BAD", x, textY, statusPaint)
    }

    private fun drawSkeleton(canvas: Canvas) {
        val pose = currentPose ?: return

        val scaleX = width.toFloat() / imageWidth
        val scaleY = height.toFloat() / imageHeight

        // Draw connections
        for ((startLandmarkType, endLandmarkType) in skeletonConnections) {
            val startLandmark = pose.getPoseLandmark(startLandmarkType)
            val endLandmark = pose.getPoseLandmark(endLandmarkType)

            if (startLandmark != null && endLandmark != null) {
                // Only draw if confidence is reasonable
                if (startLandmark.inFrameLikelihood > 0.5f && endLandmark.inFrameLikelihood > 0.5f) {
                    val startX = translateX(startLandmark.position.x, scaleX)
                    val startY = startLandmark.position.y * scaleY
                    val endX = translateX(endLandmark.position.x, scaleX)
                    val endY = endLandmark.position.y * scaleY

                    canvas.drawLine(startX, startY, endX, endY, skeletonPaint)
                }
            }
        }

        // Draw key points
        val keyLandmarks = listOf(
            PoseLandmark.NOSE,
            PoseLandmark.LEFT_SHOULDER, PoseLandmark.RIGHT_SHOULDER,
            PoseLandmark.LEFT_ELBOW, PoseLandmark.RIGHT_ELBOW,
            PoseLandmark.LEFT_WRIST, PoseLandmark.RIGHT_WRIST,
            PoseLandmark.LEFT_HIP, PoseLandmark.RIGHT_HIP
        )

        for (landmarkType in keyLandmarks) {
            val landmark = pose.getPoseLandmark(landmarkType)
            if (landmark != null && landmark.inFrameLikelihood > 0.5f) {
                val x = translateX(landmark.position.x, scaleX)
                val y = landmark.position.y * scaleY
                canvas.drawCircle(x, y, 6f, pointPaint)
            }
        }
    }

    private fun translateX(x: Float, scaleX: Float): Float {
        // Mirror for front camera
        return if (isFrontCamera) {
            width - (x * scaleX)
        } else {
            x * scaleX
        }
    }
}
