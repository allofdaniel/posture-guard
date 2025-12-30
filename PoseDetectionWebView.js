// PoseDetection HTML for WebView - MediaPipe based real pose detection
export const POSE_DETECTION_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #000;
      overflow: hidden;
      width: 100vw;
      height: 100vh;
    }
    #container {
      position: relative;
      width: 100%;
      height: 100%;
    }
    #video {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      transform: scaleX(-1);
    }
    #canvas {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }
    #status {
      position: absolute;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      padding: 8px 16px;
      border-radius: 20px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 14px;
      font-weight: 600;
      z-index: 100;
      opacity: 0.9;
    }
    .loading { background: rgba(255, 255, 255, 0.9); color: #333; }
    .good { background: rgba(16, 185, 129, 0.9); color: white; }
    .warning { background: rgba(245, 158, 11, 0.9); color: white; }
    .bad { background: rgba(239, 68, 68, 0.9); color: white; }
    #issues {
      position: absolute;
      bottom: 60px;
      left: 50%;
      transform: translateX(-50%);
      padding: 6px 12px;
      border-radius: 15px;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 12px;
      z-index: 100;
      display: none;
      text-align: center;
      max-width: 90%;
    }
  </style>
</head>
<body>
  <div id="container">
    <video id="video" playsinline autoplay muted></video>
    <canvas id="canvas"></canvas>
    <div id="status" class="loading">AI Loading...</div>
    <div id="issues"></div>
  </div>

  <script type="module">
    import { PoseLandmarker, FilesetResolver, DrawingUtils } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm';

    const LANDMARKS = {
      NOSE: 0, LEFT_EYE: 2, RIGHT_EYE: 5, LEFT_EAR: 7, RIGHT_EAR: 8,
      LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12, LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
      LEFT_WRIST: 15, RIGHT_WRIST: 16, LEFT_HIP: 23, RIGHT_HIP: 24
    };

    const THRESHOLDS = {
      SHOULDER_DROP: 0.04,
      SHOULDER_WIDTH: 0.12,
      HEAD_DROP: 0.05,
      HEAD_FORWARD: 0.04,
      MIN_VISIBILITY: 0.5
    };

    const SMOOTHING_FACTOR = 0.6;
    const DETECTION_FPS = 10;
    const DETECTION_INTERVAL = 1000 / DETECTION_FPS;

    let poseLandmarker = null;
    let video = null;
    let canvas = null;
    let ctx = null;
    let drawingUtils = null;
    let lastDetectionTime = 0;
    let smoothedLandmarks = null;
    let calibratedPose = null;
    let isMonitoring = false;
    let sensitivity = 1.0;

    const statusEl = document.getElementById('status');
    const issuesEl = document.getElementById('issues');

    function sendToReactNative(data) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(data));
      }
    }

    async function init() {
      try {
        statusEl.textContent = 'Initializing...';

        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
        );

        statusEl.textContent = 'Loading AI Model...';

        poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
            delegate: 'GPU'
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        statusEl.textContent = 'Starting Camera...';

        video = document.getElementById('video');
        canvas = document.getElementById('canvas');
        ctx = canvas.getContext('2d');
        drawingUtils = new DrawingUtils(ctx);

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
        });

        video.srcObject = stream;
        await video.play();

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        statusEl.textContent = 'Ready';
        statusEl.className = 'good';

        sendToReactNative({ type: 'ready' });

        requestAnimationFrame(detect);
      } catch (err) {
        console.error('Init failed:', err);
        statusEl.textContent = 'Error: ' + err.message;
        sendToReactNative({ type: 'error', message: err.message });
      }
    }

    function smoothLandmarks(newLandmarks) {
      if (!smoothedLandmarks) {
        smoothedLandmarks = newLandmarks.map(lm => ({ ...lm }));
        return smoothedLandmarks;
      }

      const smoothed = newLandmarks.map((lm, i) => {
        const prev = smoothedLandmarks[i];
        return {
          x: prev.x * SMOOTHING_FACTOR + lm.x * (1 - SMOOTHING_FACTOR),
          y: prev.y * SMOOTHING_FACTOR + lm.y * (1 - SMOOTHING_FACTOR),
          z: prev.z * SMOOTHING_FACTOR + lm.z * (1 - SMOOTHING_FACTOR),
          visibility: lm.visibility
        };
      });

      smoothedLandmarks = smoothed;
      return smoothed;
    }

    function isValid(lm) {
      return lm && lm.visibility >= THRESHOLDS.MIN_VISIBILITY;
    }

    function calibrate(landmarks) {
      const leftShoulder = landmarks[LANDMARKS.LEFT_SHOULDER];
      const rightShoulder = landmarks[LANDMARKS.RIGHT_SHOULDER];
      const nose = landmarks[LANDMARKS.NOSE];
      const leftEar = landmarks[LANDMARKS.LEFT_EAR];
      const rightEar = landmarks[LANDMARKS.RIGHT_EAR];

      if (!isValid(leftShoulder) || !isValid(rightShoulder)) {
        return null;
      }

      const shoulderCenterY = (leftShoulder.y + rightShoulder.y) / 2;
      const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
      const ear = isValid(leftEar) ? leftEar : isValid(rightEar) ? rightEar : null;

      return {
        shoulderCenterY,
        shoulderWidth,
        shoulderTilt: Math.abs(leftShoulder.y - rightShoulder.y),
        noseY: isValid(nose) ? nose.y : null,
        earY: ear ? ear.y : null,
        earShoulderX: ear && leftShoulder ? ear.x - leftShoulder.x : null,
        earNoseX: ear && isValid(nose) ? ear.x - nose.x : null,
        noseEarYDiff: isValid(nose) && ear ? nose.y - ear.y : null
      };
    }

    function analyzePosture(landmarks, calibrated, sens) {
      const issues = [];

      const leftShoulder = landmarks[LANDMARKS.LEFT_SHOULDER];
      const rightShoulder = landmarks[LANDMARKS.RIGHT_SHOULDER];
      const nose = landmarks[LANDMARKS.NOSE];
      const leftEar = landmarks[LANDMARKS.LEFT_EAR];
      const rightEar = landmarks[LANDMARKS.RIGHT_EAR];

      if (!isValid(leftShoulder) || !isValid(rightShoulder)) {
        return { status: 'good', issues: [] };
      }

      const currentShoulderCenterY = (leftShoulder.y + rightShoulder.y) / 2;
      const currentShoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);

      // 1. Shoulder drop
      const shoulderYDiff = currentShoulderCenterY - calibrated.shoulderCenterY;
      if (shoulderYDiff > THRESHOLDS.SHOULDER_DROP * sens) {
        issues.push('Slouching');
      }

      // 2. Leaning forward (shoulder width decrease)
      const widthRatio = currentShoulderWidth / calibrated.shoulderWidth;
      if (widthRatio < 1 - (THRESHOLDS.SHOULDER_WIDTH * sens)) {
        issues.push('Leaning Forward');
      }

      // 3. Head drop
      if (isValid(nose) && calibrated.noseY !== null) {
        const headDrop = nose.y - calibrated.noseY;
        if (headDrop > THRESHOLDS.HEAD_DROP * sens) {
          issues.push('Head Down');
        }
      }

      // 4. Turtle neck (ear-shoulder X relationship)
      const ear = isValid(leftEar) ? leftEar : isValid(rightEar) ? rightEar : null;
      if (ear && calibrated.earNoseX !== null) {
        const currentEarNoseX = ear.x - (isValid(nose) ? nose.x : leftShoulder.x);
        const xDiff = currentEarNoseX - calibrated.earNoseX;
        if (Math.abs(xDiff) > THRESHOLDS.HEAD_FORWARD * sens) {
          issues.push('Turtle Neck');
        }
      }

      // 5. Chin resting
      const leftWrist = landmarks[LANDMARKS.LEFT_WRIST];
      const rightWrist = landmarks[LANDMARKS.RIGHT_WRIST];
      if (isValid(nose)) {
        const chinRestThreshold = 0.12;
        let chinResting = false;

        if (isValid(leftWrist)) {
          const dist = Math.sqrt(Math.pow(leftWrist.x - nose.x, 2) + Math.pow(leftWrist.y - nose.y, 2));
          if (dist < chinRestThreshold) chinResting = true;
        }
        if (isValid(rightWrist)) {
          const dist = Math.sqrt(Math.pow(rightWrist.x - nose.x, 2) + Math.pow(rightWrist.y - nose.y, 2));
          if (dist < chinRestThreshold) chinResting = true;
        }
        if (chinResting) issues.push('Chin Resting');
      }

      let status = 'good';
      if (issues.length >= 2) status = 'bad';
      else if (issues.length === 1) status = 'warning';

      return { status, issues };
    }

    function drawPose(landmarks) {
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);

      // Draw connections
      drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
        color: 'rgba(99, 102, 241, 0.6)',
        lineWidth: 2
      });

      // Draw landmarks
      drawingUtils.drawLandmarks(landmarks, {
        color: 'rgba(99, 102, 241, 0.8)',
        radius: 4
      });

      ctx.restore();
    }

    function detect() {
      requestAnimationFrame(detect);

      const now = performance.now();
      if (now - lastDetectionTime < DETECTION_INTERVAL) return;
      if (!poseLandmarker || !video || video.readyState !== 4) return;

      lastDetectionTime = now;

      try {
        const results = poseLandmarker.detectForVideo(video, now);

        if (results.landmarks && results.landmarks.length > 0) {
          const landmarks = smoothLandmarks(results.landmarks[0]);

          // Always draw pose
          drawPose(landmarks);

          if (isMonitoring) {
            if (!calibratedPose) {
              calibratedPose = calibrate(landmarks);
              if (calibratedPose) {
                sendToReactNative({ type: 'calibrated' });
              }
            } else {
              const result = analyzePosture(landmarks, calibratedPose, sensitivity);

              statusEl.textContent = result.status === 'good' ? 'Good Posture' :
                                     result.status === 'warning' ? 'Check Posture' : 'Bad Posture';
              statusEl.className = result.status;

              if (result.issues.length > 0) {
                issuesEl.textContent = result.issues.join(', ');
                issuesEl.style.display = 'block';
              } else {
                issuesEl.style.display = 'none';
              }

              sendToReactNative({
                type: 'posture',
                status: result.status,
                issues: result.issues
              });
            }
          } else {
            statusEl.textContent = 'Ready';
            statusEl.className = 'good';
            issuesEl.style.display = 'none';
          }
        } else {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          statusEl.textContent = 'Position yourself in frame';
          statusEl.className = 'loading';
          issuesEl.style.display = 'none';
        }
      } catch (err) {
        console.error('Detection error:', err);
      }
    }

    // Handle messages from React Native
    window.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'startMonitoring') {
          isMonitoring = true;
          calibratedPose = null;
          smoothedLandmarks = null;
          sensitivity = data.sensitivity || 1.0;
          sendToReactNative({ type: 'started' });
        } else if (data.type === 'stopMonitoring') {
          isMonitoring = false;
          calibratedPose = null;
          sendToReactNative({ type: 'stopped' });
        } else if (data.type === 'setSensitivity') {
          sensitivity = data.value || 1.0;
        }
      } catch (e) {}
    });

    // Also handle document message for Android
    document.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'startMonitoring') {
          isMonitoring = true;
          calibratedPose = null;
          smoothedLandmarks = null;
          sensitivity = data.sensitivity || 1.0;
          sendToReactNative({ type: 'started' });
        } else if (data.type === 'stopMonitoring') {
          isMonitoring = false;
          calibratedPose = null;
          sendToReactNative({ type: 'stopped' });
        } else if (data.type === 'setSensitivity') {
          sensitivity = data.value || 1.0;
        }
      } catch (e) {}
    });

    init();
  <\/script>
</body>
</html>
`;
