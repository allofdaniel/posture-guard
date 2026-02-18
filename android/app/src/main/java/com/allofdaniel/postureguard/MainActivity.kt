package com.allofdaniel.postureguard

import android.app.PictureInPictureParams
import android.content.Context
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.ImageFormat
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CaptureRequest
import android.hardware.camera2.params.StreamConfigurationMap
import android.media.ImageReader
import android.util.Size
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.util.Log
import android.util.Rational
import android.graphics.SurfaceTexture
import android.view.Surface
import android.view.TextureView
import android.view.View
import android.view.ViewGroup
import android.view.Gravity
import android.view.WindowManager
import android.webkit.WebView
import android.widget.FrameLayout

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.bridge.ReactContext
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.uimanager.util.ReactFindViewUtil

import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.pose.PoseDetection
import com.google.mlkit.vision.pose.PoseDetector
import com.google.mlkit.vision.pose.defaults.PoseDetectorOptions
import com.google.mlkit.vision.pose.PoseLandmark

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  private var autoEnterPip = false
  private val mainHandler = Handler(Looper.getMainLooper())

  // Camera2 PiP overlay (TextureView - renders in View hierarchy, overlay works)
  private var pipTextureView: TextureView? = null
  private var pipCameraDevice: CameraDevice? = null
  private var pipCaptureSession: CameraCaptureSession? = null
  private var cameraThread: HandlerThread? = null
  private var cameraHandler: Handler? = null
  @Volatile private var pipCameraActive = false

  // ML Kit Pose Detection
  private var poseDetector: PoseDetector? = null
  private var imageReader: ImageReader? = null
  private var pipOverlayView: PipOverlayView? = null
  @Volatile private var isProcessingFrame = false

  // Status data from WebView
  private var pipWarningCount = 0
  private var pipAlertCount = 0
  private var pipSessionTime = "00:00"
  private var pipAchievementRate = 0
  private var pipStatusText = "Ready"
  private var pipIsGoodPosture = true

  override fun onCreate(savedInstanceState: Bundle?) {
    setTheme(R.style.AppTheme);
    super.onCreate(null)
  }

  override fun onDestroy() {
    super.onDestroy()
    // Clean up resources to prevent memory leaks
    closePipCamera()
    cameraThread?.quitSafely()
    cameraThread = null
    cameraHandler = null
    poseDetector?.close()
    poseDetector = null
    Log.d("PipDebug", "Activity destroyed, resources cleaned up")
  }

  fun setAutoEnterPip(enabled: Boolean) {
    autoEnterPip = enabled
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && enabled) {
      mainHandler.post {
        val params = PictureInPictureParams.Builder()
          .setAspectRatio(Rational(9, 16))
          .build()
        setPictureInPictureParams(params)

        // Initialize ML Kit Pose Detector for PiP mode
        initPoseDetector()

        // Pre-create TextureView for PiP camera
        preparePipSurfaceView()
      }
    }
  }

  private fun initPoseDetector() {
    if (poseDetector != null) return

    val options = PoseDetectorOptions.Builder()
      .setDetectorMode(PoseDetectorOptions.STREAM_MODE)
      .build()
    poseDetector = PoseDetection.getClient(options)
    Log.d("PipDebug", "ML Kit Pose Detector initialized")
  }

  // Called from JavaScript to update status info for PiP display
  fun updatePipStatus(warnings: Int, alerts: Int, time: String, rate: Int, status: String, goodPosture: Boolean) {
    pipWarningCount = warnings
    pipAlertCount = alerts
    pipSessionTime = time
    pipAchievementRate = rate
    pipStatusText = status
    pipIsGoodPosture = goodPosture

    mainHandler.post {
      pipOverlayView?.updateStatus(warnings, alerts, time, rate, status, goodPosture)
    }
  }

  private var pipSurfaceReady = false
  private var pipSurface: Surface? = null

  private fun preparePipSurfaceView() {
    if (pipTextureView != null) return
    if (checkSelfPermission(android.Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
      Log.d("PipDebug", "Camera permission not granted, skipping TextureView preparation")
      return
    }

    Log.d("PipDebug", "Creating TextureView with MATCH_PARENT")

    val contentRoot = findViewById<FrameLayout>(android.R.id.content)

    // Create TextureView that fills its parent - renders in View hierarchy so overlay works
    // Start as GONE - only visible when in PiP mode
    pipTextureView = TextureView(this).apply {
      visibility = View.GONE  // Hidden until PiP mode
      isClickable = false
      isFocusable = false
    }

    // Add TextureView
    val textureLp = FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.MATCH_PARENT
    )
    contentRoot.addView(pipTextureView, textureLp)

    // Create and add overlay view on top
    // Start as GONE - only visible when in PiP mode
    pipOverlayView = PipOverlayView(this).apply {
      visibility = View.GONE  // Hidden until PiP mode
      isClickable = false
      isFocusable = false
    }
    val overlayLp = FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.MATCH_PARENT
    )
    contentRoot.addView(pipOverlayView, overlayLp)

    Log.d("PipDebug", "TextureView and OverlayView added to content root")

    // Force layout immediately
    pipTextureView!!.post {
      pipTextureView?.requestLayout()
      pipOverlayView?.requestLayout()
      Log.d("PipDebug", "TextureView layout requested, dimensions: ${pipTextureView?.width}x${pipTextureView?.height}")
    }

    pipTextureView!!.surfaceTextureListener = object : TextureView.SurfaceTextureListener {
      override fun onSurfaceTextureAvailable(surfaceTexture: SurfaceTexture, width: Int, height: Int) {
        Log.d("PipDebug", "TextureView surface available! pipCameraActive=$pipCameraActive, size=${width}x${height}")
        pipSurfaceReady = true
        pipSurface = Surface(surfaceTexture)
        // Only open camera if we're actively in PiP mode and camera isn't already open
        if (pipCameraActive && pipCameraDevice == null) {
          openPipCamera(pipSurface!!)
        }
      }
      override fun onSurfaceTextureSizeChanged(surfaceTexture: SurfaceTexture, width: Int, height: Int) {
        Log.d("PipDebug", "TextureView surface size changed: ${width}x${height}")
        // Don't restart camera on surface size changes - it causes crashes during PiP transition
      }
      override fun onSurfaceTextureDestroyed(surfaceTexture: SurfaceTexture): Boolean {
        Log.d("PipDebug", "TextureView surface destroyed")
        pipSurfaceReady = false
        closePipCamera()
        pipSurface?.release()
        pipSurface = null
        return true
      }
      override fun onSurfaceTextureUpdated(surfaceTexture: SurfaceTexture) {
        // Called when the content of the surface texture is updated
      }
    }
  }

  // ── Bottom panel hide/show (alpha + translationY) ──

  private fun hidePipPanel(hide: Boolean) {
    val rootView = window.decorView
    val bottomPanel = ReactFindViewUtil.findView(rootView, "pip-hide")
    if (bottomPanel != null) {
      if (hide) {
        bottomPanel.alpha = 0f
        bottomPanel.translationY = bottomPanel.height.toFloat()
      } else {
        bottomPanel.alpha = 1f
        bottomPanel.translationY = 0f
      }
    }
  }

  // ── WebView helpers ──

  private fun findWebView(view: View): WebView? {
    if (view is WebView) return view
    if (view is ViewGroup) {
      for (i in 0 until view.childCount) {
        val found = findWebView(view.getChildAt(i))
        if (found != null) return found
      }
    }
    return null
  }

  private fun stopWebViewCamera() {
    val webView = findWebView(window.decorView) ?: return
    val js = """
      (function() {
        var video = document.getElementById('video');
        if (video && video.srcObject) {
          video.srcObject.getTracks().forEach(function(t) { t.stop(); });
          video.srcObject = null;
        }
      })();
    """.trimIndent()
    webView.evaluateJavascript(js, null)
    Log.d("PipDebug", "WebView camera stopped via JS")
  }

  private fun restartWebViewCamera() {
    try {
      val webView = findWebView(window.decorView)
      if (webView == null) {
        Log.d("PipDebug", "restartWebViewCamera: WebView not found")
        return
      }
      webView.onResume()
      webView.resumeTimers()
      val js = """
        (function() {
          try {
            if (typeof window.restartCam === 'function') {
              window.restartCam();
              return 'restartCam called';
            }
            return 'restartCam not found';
          } catch(e) {
            return 'error: ' + e.message;
          }
        })();
      """.trimIndent()
      webView.evaluateJavascript(js) { result ->
        Log.d("PipDebug", "WebView restartCam result: $result")
      }
      Log.d("PipDebug", "WebView camera restart initiated")
    } catch (e: Exception) {
      Log.e("PipDebug", "restartWebViewCamera error", e)
    }
  }

  // ── Camera2 PiP overlay ──

  private fun findFrontCameraId(): String? {
    val cameraManager = getSystemService(Context.CAMERA_SERVICE) as CameraManager
    for (id in cameraManager.cameraIdList) {
      val characteristics = cameraManager.getCameraCharacteristics(id)
      val facing = characteristics.get(CameraCharacteristics.LENS_FACING)
      if (facing == CameraCharacteristics.LENS_FACING_FRONT) {
        return id
      }
    }
    return null
  }

  private fun startPipCamera() {
    if (pipCameraActive) return
    if (pipCameraDevice != null) {
      Log.d("PipDebug", "startPipCamera: camera already open, skipping")
      return
    }

    // Ensure TextureView is prepared
    if (pipTextureView == null) {
      preparePipSurfaceView()
    }

    if (pipTextureView == null) {
      Log.d("PipDebug", "startPipCamera: TextureView not available")
      return
    }

    // Start camera background thread
    if (cameraThread == null) {
      cameraThread = HandlerThread("PipCameraThread").also { it.start() }
      cameraHandler = Handler(cameraThread!!.looper)
    }

    pipCameraActive = true

    // Bring TextureView and Overlay visible for PiP mode
    pipTextureView!!.visibility = View.VISIBLE
    pipOverlayView?.visibility = View.VISIBLE
    pipOverlayView?.bringToFront()  // Ensure overlay is on top
    Log.d("PipDebug", "TextureView and Overlay visible, pipSurfaceReady=$pipSurfaceReady")

    // If surface already exists, open camera immediately
    if (pipSurfaceReady && pipSurface != null && pipSurface!!.isValid) {
      Log.d("PipDebug", "Surface ready, opening camera immediately")
      openPipCamera(pipSurface!!)
    }
  }

  private var selectedPreviewSize: Size? = null

  private fun openPipCamera(surface: Surface) {
    val cameraManager = getSystemService(Context.CAMERA_SERVICE) as CameraManager
    val frontCameraId = findFrontCameraId()
    if (frontCameraId == null) {
      Log.d("PipDebug", "No front camera found")
      return
    }

    try {
      val characteristics = cameraManager.getCameraCharacteristics(frontCameraId)
      val configMap = characteristics.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
      val outputSizes = configMap?.getOutputSizes(SurfaceTexture::class.java)

      if (outputSizes != null) {
        // For PiP we need portrait output. Camera sizes are typically landscape.
        // Select a 16:9 landscape size, then we'll use it rotated for portrait display.
        val targetRatio = 16.0 / 9.0
        selectedPreviewSize = outputSizes
          .filter { it.width >= 480 && it.width <= 1280 }
          .minByOrNull {
            val ratio = it.width.toDouble() / it.height.toDouble()
            Math.abs(ratio - targetRatio)
          } ?: outputSizes.firstOrNull { it.width <= 1280 } ?: outputSizes.firstOrNull()

        Log.d("PipDebug", "Available sizes: ${outputSizes.map { "${it.width}x${it.height}" }}")
        Log.d("PipDebug", "Selected preview size: ${selectedPreviewSize?.width}x${selectedPreviewSize?.height}")
      }

      // Create ImageReader for ML Kit pose detection
      val previewSize = selectedPreviewSize ?: Size(640, 480)
      imageReader?.close()
      imageReader = ImageReader.newInstance(
        previewSize.width,
        previewSize.height,
        ImageFormat.YUV_420_888,
        2
      ).apply {
        setOnImageAvailableListener({ reader ->
          processImageForPose(reader)
        }, cameraHandler)
      }
      Log.d("PipDebug", "ImageReader created: ${previewSize.width}x${previewSize.height}")

      cameraManager.openCamera(frontCameraId, object : CameraDevice.StateCallback() {
        override fun onOpened(camera: CameraDevice) {
          Log.d("PipDebug", "PiP Camera2 opened")
          pipCameraDevice = camera
          startPipPreview(camera, surface)
        }
        override fun onDisconnected(camera: CameraDevice) {
          Log.d("PipDebug", "PiP Camera2 disconnected")
          camera.close()
          pipCameraDevice = null
        }
        override fun onError(camera: CameraDevice, error: Int) {
          Log.d("PipDebug", "PiP Camera2 error: $error")
          camera.close()
          pipCameraDevice = null
        }
      }, cameraHandler)
    } catch (e: SecurityException) {
      Log.e("PipDebug", "Camera permission error", e)
    } catch (e: Exception) {
      Log.e("PipDebug", "Camera open error", e)
    }
  }

  private var frameCount = 0

  private fun processImageForPose(reader: ImageReader) {
    if (isProcessingFrame || poseDetector == null) {
      reader.acquireLatestImage()?.close()
      return
    }

    val image = reader.acquireLatestImage() ?: return
    isProcessingFrame = true
    frameCount++

    // Log every 30 frames to avoid spam
    if (frameCount % 30 == 1) {
      Log.d("PipDebug", "Processing frame #$frameCount, size=${image.width}x${image.height}")
    }

    // Store dimensions before async processing (image may be closed later)
    val imgWidth = image.width
    val imgHeight = image.height

    try {
      val inputImage = InputImage.fromMediaImage(image, 270) // Front camera rotation

      poseDetector?.process(inputImage)
        ?.addOnSuccessListener { pose ->
          // Check posture and update overlay
          val isGood = checkPosture(pose)
          val landmarkCount = pose.allPoseLandmarks.size
          if (frameCount % 30 == 1) {
            Log.d("PipDebug", "Pose detected: $landmarkCount landmarks, isGood=$isGood")
          }
          mainHandler.post {
            // For 270 degree rotation, swap width and height for coordinate mapping
            pipOverlayView?.updatePose(pose, imgHeight, imgWidth, true)
            pipOverlayView?.updateStatus(
              pipWarningCount,
              pipAlertCount,
              pipSessionTime,
              pipAchievementRate,
              if (isGood) "Good" else "Fix Posture",
              isGood
            )
          }
        }
        ?.addOnFailureListener { e ->
          Log.e("PipDebug", "Pose detection failed", e)
        }
        ?.addOnCompleteListener {
          image.close()
          isProcessingFrame = false
        }
    } catch (e: Exception) {
      Log.e("PipDebug", "Error processing image", e)
      image.close()
      isProcessingFrame = false
    }
  }

  private fun checkPosture(pose: com.google.mlkit.vision.pose.Pose): Boolean {
    // Simple posture check based on shoulder and ear alignment
    val leftShoulder = pose.getPoseLandmark(PoseLandmark.LEFT_SHOULDER)
    val rightShoulder = pose.getPoseLandmark(PoseLandmark.RIGHT_SHOULDER)
    val leftEar = pose.getPoseLandmark(PoseLandmark.LEFT_EAR)
    val rightEar = pose.getPoseLandmark(PoseLandmark.RIGHT_EAR)
    val nose = pose.getPoseLandmark(PoseLandmark.NOSE)

    if (leftShoulder == null || rightShoulder == null || nose == null) {
      return true // Can't determine, assume good
    }

    // Check if head is too far forward (turtle neck)
    val shoulderMidX = (leftShoulder.position.x + rightShoulder.position.x) / 2
    val shoulderMidY = (leftShoulder.position.y + rightShoulder.position.y) / 2

    // If nose is significantly below shoulder line, might be looking down too much
    val noseToShoulderY = nose.position.y - shoulderMidY

    // Check ear-shoulder alignment for forward head posture
    if (leftEar != null && rightEar != null) {
      val earMidX = (leftEar.position.x + rightEar.position.x) / 2
      val earMidY = (leftEar.position.y + rightEar.position.y) / 2

      // Ear should be roughly above shoulder
      // If ear is too far forward (larger X difference in mirrored view), bad posture
      val forwardOffset = Math.abs(earMidY - shoulderMidY)
      val threshold = 100f // Adjust based on testing

      if (forwardOffset > threshold) {
        return false
      }
    }

    return true
  }

  private fun startPipPreview(camera: CameraDevice, surface: Surface) {
    try {
      val captureRequestBuilder = camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW)
      captureRequestBuilder.addTarget(surface)
      captureRequestBuilder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_VIDEO)

      // Build list of surfaces (preview + optional ImageReader for ML Kit)
      val surfaces = mutableListOf(surface)
      imageReader?.surface?.let {
        captureRequestBuilder.addTarget(it)
        surfaces.add(it)
        Log.d("PipDebug", "Added ImageReader surface for pose detection")
      }

      camera.createCaptureSession(surfaces, object : CameraCaptureSession.StateCallback() {
        override fun onConfigured(session: CameraCaptureSession) {
          Log.d("PipDebug", "PiP Camera2 preview configured with ${surfaces.size} surfaces")
          pipCaptureSession = session
          try {
            session.setRepeatingRequest(captureRequestBuilder.build(), null, cameraHandler)
          } catch (e: Exception) {
            Log.e("PipDebug", "Preview request error", e)
          }
        }
        override fun onConfigureFailed(session: CameraCaptureSession) {
          Log.e("PipDebug", "PiP Camera2 configure failed")
        }
      }, cameraHandler)
    } catch (e: Exception) {
      Log.e("PipDebug", "startPipPreview error", e)
    }
  }

  private fun closePipCamera() {
    try {
      pipCaptureSession?.close()
      pipCaptureSession = null
      pipCameraDevice?.close()
      pipCameraDevice = null
      imageReader?.close()
      imageReader = null
      isProcessingFrame = false
      // Keep camera thread alive for reuse on next PiP entry
    } catch (e: Exception) {
      Log.e("PipDebug", "closePipCamera error", e)
    }
    Log.d("PipDebug", "PiP Camera2 closed")
  }

  private fun stopPipCamera() {
    if (!pipCameraActive) return
    pipCameraActive = false
    closePipCamera()
    // Hide TextureView and Overlay completely when returning from PiP
    pipTextureView?.visibility = View.GONE
    pipOverlayView?.visibility = View.GONE
    Log.d("PipDebug", "PiP camera stopped, TextureView and Overlay hidden")
  }

  // ── Activity lifecycle ──

  override fun onPause() {
    super.onPause()
    if (autoEnterPip) {
      hidePipPanel(true)
    }
  }

  private var wasInPipMode = false

  override fun onResume() {
    super.onResume()
    Log.d("PipDebug", "onResume: isInPip=$isInPictureInPictureMode, wasInPip=$wasInPipMode")

    if (!isInPictureInPictureMode) {
      hidePipPanel(false)

      if (wasInPipMode) {
        wasInPipMode = false
        Log.d("PipDebug", "onResume: returning from PiP, ensuring WebView camera is restarted")
        // Make sure native PiP camera is stopped and WebView camera is running
        stopPipCamera()
        restartWebViewCamera()
      }
    }
  }

  override fun onUserLeaveHint() {
    super.onUserLeaveHint()
    Log.d("PipDebug", "onUserLeaveHint: autoEnterPip=$autoEnterPip, SDK=${Build.VERSION.SDK_INT}")
    if (autoEnterPip && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      // Stop WebView camera and switch to native Camera2 for PiP mode
      stopWebViewCamera()
      hidePipPanel(true)

      // Start native camera for PiP
      startPipCamera()

      val params = PictureInPictureParams.Builder()
        .setAspectRatio(Rational(9, 16))
        .build()
      enterPictureInPictureMode(params)
    }
  }

  override fun onPictureInPictureModeChanged(isInPipMode: Boolean, newConfig: Configuration) {
    super.onPictureInPictureModeChanged(isInPipMode, newConfig)
    Log.d("PipDebug", "onPictureInPictureModeChanged: isInPipMode=$isInPipMode")
    hidePipPanel(isInPipMode)

    if (isInPipMode) {
      wasInPipMode = true
      // Ensure native camera is running for PiP mode
      if (!pipCameraActive) {
        startPipCamera()
      }
    } else {
      // Exiting PiP mode - stop native camera and restart WebView camera
      Log.d("PipDebug", "Exiting PiP mode - switching back to WebView camera")
      stopPipCamera()
      restartWebViewCamera()
    }

    emitPipEvent(isInPipMode, 0)
  }

  private fun emitPipEvent(isInPipMode: Boolean, attempt: Int) {
    val reactContext = reactNativeHost.reactInstanceManager.currentReactContext
    if (reactContext != null && reactContext.hasActiveReactInstance()) {
      try {
        reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          ?.emit("onPipModeChanged", isInPipMode)
      } catch (e: Exception) {
        if (attempt < 5) {
          mainHandler.postDelayed({ emitPipEvent(isInPipMode, attempt + 1) }, 200L)
        }
      }
    } else if (attempt < 5) {
      mainHandler.postDelayed({ emitPipEvent(isInPipMode, attempt + 1) }, 200L)
    }
  }

  // ── React Native boilerplate ──

  override fun getMainComponentName(): String = "main"

  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              super.invokeDefaultOnBackPressed()
          }
          return
      }
      super.invokeDefaultOnBackPressed()
  }
}
