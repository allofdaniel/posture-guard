// PoseDetection HTML for WebView - MediaPipe based real pose detection
// Uses legacy MediaPipe Pose for Android WebView compatibility
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
    #fallback-message {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      padding: 20px;
      display: none;
    }
    #fallback-message h3 {
      font-size: 18px;
      margin-bottom: 10px;
    }
    #fallback-message p {
      font-size: 14px;
      opacity: 0.8;
    }
  </style>
</head>
<body>
  <div id="container">
    <video id="video" playsinline autoplay muted></video>
    <canvas id="canvas"></canvas>
    <div id="status" class="loading">Loading AI...</div>
    <div id="issues"></div>
    <div id="fallback-message">
      <h3>📷 Camera Setup</h3>
      <p>Camera access requires a physical device.<br>Emulator mode: AI monitoring simulation active.</p>
    </div>
  </div>

  <!-- Load legacy MediaPipe libraries (works in Android WebView) -->
  <script src="https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js" crossorigin="anonymous"></script>
  <script src="https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js" crossorigin="anonymous"></script>

  <script>
    (function() {
      const LANDMARKS = {
        NOSE: 0, LEFT_EYE_INNER: 1, LEFT_EYE: 2, LEFT_EYE_OUTER: 3,
        RIGHT_EYE_INNER: 4, RIGHT_EYE: 5, RIGHT_EYE_OUTER: 6,
        LEFT_EAR: 7, RIGHT_EAR: 8,
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

      let pose = null;
      let video = null;
      let canvas = null;
      let ctx = null;
      let smoothedLandmarks = null;
      let calibratedPose = null;
      let isMonitoring = false;
      let sensitivity = 1.0;
      let isSimulationMode = false;
      let animationFrameId = null;

      const statusEl = document.getElementById('status');
      const issuesEl = document.getElementById('issues');
      const fallbackEl = document.getElementById('fallback-message');

      function sendToReactNative(data) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify(data));
        }
      }

      function log(msg) {
        console.log('[PoseDetection]', msg);
        sendToReactNative({ type: 'log', message: msg });
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

        // 1. Shoulder drop (slouching)
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

        // 4. Turtle neck
        const ear = isValid(leftEar) ? leftEar : isValid(rightEar) ? rightEar : null;
        if (ear && calibrated.earNoseX !== null && isValid(nose)) {
          const currentEarNoseX = ear.x - nose.x;
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
        if (typeof drawConnectors === 'function') {
          drawConnectors(ctx, landmarks, POSE_CONNECTIONS, {
            color: 'rgba(99, 102, 241, 0.6)',
            lineWidth: 2
          });
        }

        // Draw landmarks
        if (typeof drawLandmarks === 'function') {
          drawLandmarks(ctx, landmarks, {
            color: 'rgba(99, 102, 241, 0.8)',
            radius: 4
          });
        }

        ctx.restore();
      }

      function onResults(results) {
        if (results.poseLandmarks && results.poseLandmarks.length > 0) {
          const landmarks = smoothLandmarks(results.poseLandmarks);

          // Always draw pose skeleton
          drawPose(landmarks);

          if (isMonitoring) {
            if (!calibratedPose) {
              calibratedPose = calibrate(landmarks);
              if (calibratedPose) {
                log('Pose calibrated');
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
      }

      // Simulation mode - generates fake pose data for testing
      function startSimulationMode() {
        isSimulationMode = true;
        fallbackEl.style.display = 'block';
        statusEl.textContent = 'Simulation Mode';
        statusEl.className = 'good';

        log('Starting simulation mode (camera not available)');
        sendToReactNative({ type: 'ready', simulation: true });

        // Generate simulated pose data periodically
        let frameCount = 0;
        function simulateFrame() {
          frameCount++;

          // Create simulated landmarks
          const time = frameCount / 60;
          const wobble = Math.sin(time * 2) * 0.02;

          const simulatedLandmarks = [];
          for (let i = 0; i < 33; i++) {
            simulatedLandmarks.push({
              x: 0.5 + (i % 5) * 0.1 - 0.2,
              y: 0.3 + Math.floor(i / 5) * 0.1 + wobble,
              z: 0,
              visibility: 0.9
            });
          }

          // Override key landmarks for realistic positions
          simulatedLandmarks[LANDMARKS.NOSE] = { x: 0.5, y: 0.15 + wobble, z: 0, visibility: 0.95 };
          simulatedLandmarks[LANDMARKS.LEFT_SHOULDER] = { x: 0.35, y: 0.35 + wobble, z: 0, visibility: 0.95 };
          simulatedLandmarks[LANDMARKS.RIGHT_SHOULDER] = { x: 0.65, y: 0.35 + wobble, z: 0, visibility: 0.95 };
          simulatedLandmarks[LANDMARKS.LEFT_EAR] = { x: 0.4, y: 0.12 + wobble, z: 0, visibility: 0.9 };
          simulatedLandmarks[LANDMARKS.RIGHT_EAR] = { x: 0.6, y: 0.12 + wobble, z: 0, visibility: 0.9 };
          simulatedLandmarks[LANDMARKS.LEFT_WRIST] = { x: 0.25, y: 0.6 + wobble, z: 0, visibility: 0.85 };
          simulatedLandmarks[LANDMARKS.RIGHT_WRIST] = { x: 0.75, y: 0.6 + wobble, z: 0, visibility: 0.85 };

          // Draw simulated skeleton
          drawPose(simulatedLandmarks);

          if (isMonitoring) {
            const landmarks = smoothLandmarks(simulatedLandmarks);

            if (!calibratedPose) {
              calibratedPose = calibrate(landmarks);
              if (calibratedPose) {
                log('Pose calibrated (simulation)');
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
          }

          animationFrameId = requestAnimationFrame(simulateFrame);
        }

        simulateFrame();
      }

      async function startCamera() {
        // Check if getUserMedia is available
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          log('getUserMedia not available, using simulation mode');
          startSimulationMode();
          return false;
        }

        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: 'user',
              width: { ideal: 640 },
              height: { ideal: 480 }
            }
          });

          video.srcObject = stream;
          await video.play();

          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 480;

          log('Camera started successfully');
          return true;
        } catch (err) {
          log('Camera error: ' + err.message);
          startSimulationMode();
          return false;
        }
      }

      async function processVideoFrame() {
        if (!pose || !video || video.readyState !== 4 || isSimulationMode) return;

        try {
          await pose.send({ image: video });
        } catch (err) {
          console.error('Pose send error:', err);
        }

        requestAnimationFrame(processVideoFrame);
      }

      async function init() {
        try {
          statusEl.textContent = 'Initializing...';
          log('Starting initialization...');

          video = document.getElementById('video');
          canvas = document.getElementById('canvas');
          ctx = canvas.getContext('2d');

          canvas.width = 640;
          canvas.height = 480;

          // Try to initialize camera first
          statusEl.textContent = 'Starting Camera...';
          const cameraStarted = await startCamera();

          if (!cameraStarted) {
            // Already in simulation mode
            return;
          }

          // Initialize MediaPipe Pose only if camera is available
          statusEl.textContent = 'Loading AI Model...';

          pose = new Pose({
            locateFile: (file) => {
              return 'https://cdn.jsdelivr.net/npm/@mediapipe/pose/' + file;
            }
          });

          pose.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            enableSegmentation: false,
            smoothSegmentation: false,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
          });

          pose.onResults(onResults);

          log('Pose model initialized');
          statusEl.textContent = 'Ready';
          statusEl.className = 'good';

          sendToReactNative({ type: 'ready' });

          // Start processing video frames
          requestAnimationFrame(processVideoFrame);

        } catch (err) {
          log('Init error: ' + err.message);

          // Fall back to simulation mode on any error
          if (!isSimulationMode) {
            startSimulationMode();
          }
        }
      }

      // Handle messages from React Native
      function handleMessage(event) {
        try {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;

          if (data.type === 'startMonitoring') {
            isMonitoring = true;
            calibratedPose = null;
            smoothedLandmarks = null;
            sensitivity = data.sensitivity || 1.0;
            log('Monitoring started, sensitivity: ' + sensitivity);
            sendToReactNative({ type: 'started' });
          } else if (data.type === 'stopMonitoring') {
            isMonitoring = false;
            calibratedPose = null;
            log('Monitoring stopped');
            sendToReactNative({ type: 'stopped' });
          } else if (data.type === 'setSensitivity') {
            sensitivity = data.value || 1.0;
          }
        } catch (e) {
          log('Message parse error: ' + e.message);
        }
      }

      window.addEventListener('message', handleMessage);
      document.addEventListener('message', handleMessage);

      // Start initialization when DOM is ready
      if (document.readyState === 'complete') {
        init();
      } else {
        window.addEventListener('load', init);
      }
    })();
  </script>
</body>
</html>
`;
