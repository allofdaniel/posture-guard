// PoseDetection HTML for WebView - MediaPipe based real pose detection
export const POSE_DETECTION_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #000; overflow: hidden; width: 100vw; height: 100vh; }
    #container { position: relative; width: 100%; height: 100%; }
    #video { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); z-index: 1; }
    #canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2; transform: scaleX(-1); }
    #status { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); padding: 8px 16px; border-radius: 20px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 14px; font-weight: 600; z-index: 100; opacity: 0.9; }
    .loading { background: rgba(255, 255, 255, 0.9); color: #333; }
    .good { background: rgba(16, 185, 129, 0.9); color: white; }
    .warning { background: rgba(245, 158, 11, 0.9); color: white; }
    .bad { background: rgba(239, 68, 68, 0.9); color: white; }
    #issues { position: absolute; bottom: 60px; left: 50%; transform: translateX(-50%); padding: 6px 12px; border-radius: 15px; background: rgba(0, 0, 0, 0.7); color: white; font-family: sans-serif; font-size: 12px; z-index: 100; display: none; text-align: center; max-width: 90%; }
    #orientation { position: absolute; top: 50px; left: 50%; transform: translateX(-50%); padding: 6px 14px; border-radius: 20px; background: rgba(25, 230, 107, 0.85); color: white; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 13px; font-weight: 500; z-index: 100; display: none; }
    #fallback-message { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: white; padding: 20px; display: none; }
    #fallback-message h3 { margin-bottom: 10px; font-size: 18px; }
    #fallback-message p { font-size: 14px; opacity: 0.8; margin-bottom: 8px; }
    #debug-log { position: absolute; bottom: 10px; left: 10px; right: 10px; max-height: 150px; overflow-y: auto; background: rgba(0, 0, 0, 0.8); color: #0f0; font-family: monospace; font-size: 10px; padding: 5px; border-radius: 5px; z-index: 200; display: none; }
  </style>
</head>
<body>
  <div id="container">
    <video id="video" playsinline autoplay muted></video>
    <canvas id="canvas"></canvas>
    <div id="status" class="loading">Loading...</div>
    <div id="issues"></div>
    <div id="orientation"></div>
    <div id="fallback-message">
      <h3>📷 Camera Setup</h3>
      <p>Camera access requires a physical device.</p>
      <p>Emulator mode: AI monitoring simulation active.</p>
    </div>
    <div id="debug-log"></div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js" crossorigin="anonymous"></script>
  <script>
    (function() {
      let pose, video, canvas, ctx, calibPose, isMonitoring = false, sens = 1.0, simMode = false, privacyMode = false;
      let retryCount = 0;
      const MAX_RETRIES = 3;
      const statusEl = document.getElementById("status");
      const issuesEl = document.getElementById("issues");
      const orientationEl = document.getElementById("orientation");
      const fallbackEl = document.getElementById("fallback-message");
      const debugEl = document.getElementById("debug-log");

      // Face orientation detection - front, side, partial
      function detectOrientation(lm) {
        // Landmarks: 0=nose, 7=leftEar, 8=rightEar, 11=leftShoulder, 12=rightShoulder
        const nose = lm[0], leftEar = lm[7], rightEar = lm[8];
        const leftShoulder = lm[11], rightShoulder = lm[12];

        // Check visibility with lower thresholds
        const noseVis = nose && nose.visibility >= 0.3;
        const leftEarVis = leftEar && leftEar.visibility >= 0.3;
        const rightEarVis = rightEar && rightEar.visibility >= 0.3;
        const leftShoulderVis = leftShoulder && leftShoulder.visibility >= 0.3;
        const rightShoulderVis = rightShoulder && rightShoulder.visibility >= 0.3;

        if (!noseVis) return { type: "unknown", text: "📷 Position yourself", icon: "📷" };

        // Calculate shoulder width ratio (to detect side view)
        let shoulderWidthRatio = 0;
        if (leftShoulderVis && rightShoulderVis) {
          shoulderWidthRatio = Math.abs(leftShoulder.x - rightShoulder.x);
        }

        // Calculate ear distance
        let earDiff = 0;
        if (leftEarVis && rightEarVis) {
          earDiff = Math.abs(leftEar.x - rightEar.x);
        }

        // Count visible ears
        const visibleEars = (leftEarVis ? 1 : 0) + (rightEarVis ? 1 : 0);

        // Debug: log values
        // console.log("SW:", shoulderWidthRatio.toFixed(3), "Ears:", visibleEars, "EarDiff:", earDiff.toFixed(3));

        // Side view detection - more lenient
        // If only one ear visible OR shoulder width is narrow
        if (visibleEars === 1 || shoulderWidthRatio < 0.18) {
          const side = leftEarVis && !rightEarVis ? "Right" : "Left";
          return { type: "side", text: "👤 Side (" + side + ")", icon: "👤" };
        }

        // Partial view - both ears but narrow shoulders or small ear gap
        if (visibleEars === 2 && (shoulderWidthRatio < 0.25 || earDiff < 0.06)) {
          return { type: "partial", text: "🔄 Diagonal", icon: "🔄" };
        }

        // Front view - both ears visible with good separation
        if (visibleEars === 2 && shoulderWidthRatio >= 0.25 && earDiff >= 0.06) {
          return { type: "front", text: "😊 Front", icon: "😊" };
        }

        // Default based on shoulder width
        if (shoulderWidthRatio >= 0.2) {
          return { type: "front", text: "😊 Front", icon: "😊" };
        }

        return { type: "partial", text: "🔄 Diagonal", icon: "🔄" };
      }

      // Debug log - disabled for production
      // debugEl.style.display = 'block';

      function sendRN(d) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify(d));
        }
      }

      function log(m) {
        sendRN({type:"log", message:m});
        if(debugEl) {
          debugEl.innerHTML += m + "<br>";
          debugEl.scrollTop = debugEl.scrollHeight;
        }
      }

      function isValid(lm) { return lm && lm.visibility >= 0.5; }

      function calibrate(lm) {
        const ls = lm[11], rs = lm[12], n = lm[0];
        const le = lm[7], re = lm[8]; // ears
        const lh = lm[23], rh = lm[24]; // hips

        // Need at least one shoulder visible
        if(!isValid(ls) && !isValid(rs)) return null;

        const shoulderWidth = (isValid(ls) && isValid(rs)) ? Math.abs(ls.x - rs.x) : 0;
        const isSideView = shoulderWidth < 0.12;

        // Get visible landmarks for side view
        const shoulder = isValid(ls) ? ls : rs;
        const ear = (le && le.visibility >= 0.4) ? le : ((re && re.visibility >= 0.4) ? re : null);
        const hip = (lh && lh.visibility >= 0.4) ? lh : ((rh && rh.visibility >= 0.4) ? rh : null);

        return {
          scY: (isValid(ls) && isValid(rs)) ? (ls.y + rs.y) / 2 : shoulder.y,
          sw: shoulderWidth || 0.2, // default for side view
          nY: isValid(n) ? n.y : null,
          isSideView: isSideView,
          // Side view specific calibration
          earX: ear ? ear.x : null,
          shoulderX: shoulder ? shoulder.x : null,
          hipX: hip ? hip.x : null
        };
      }

      function analyze(lm, cal, s) {
        const issues = [];
        const ls = lm[11], rs = lm[12], n = lm[0];
        const le = lm[7], re = lm[8]; // ears
        const lh = lm[23], rh = lm[24]; // hips

        // Detect view type
        const leftEarVis = le && le.visibility >= 0.4;
        const rightEarVis = re && re.visibility >= 0.4;
        const shoulderWidth = (isValid(ls) && isValid(rs)) ? Math.abs(ls.x - rs.x) : 0;
        const isSideView = shoulderWidth < 0.12;

        if(isSideView) {
          // Side view analysis - different metrics
          // Get visible shoulder and ear
          const shoulder = isValid(ls) ? ls : (isValid(rs) ? rs : null);
          const ear = leftEarVis ? le : (rightEarVis ? re : null);
          const hip = (lh && lh.visibility >= 0.4) ? lh : ((rh && rh.visibility >= 0.4) ? rh : null);

          if(shoulder && ear) {
            // Forward head posture: ear is too far forward relative to shoulder
            const headForward = ear.x - shoulder.x;
            if(Math.abs(headForward) > 0.08 * s) {
              issues.push("Forward Head");
            }
          }

          if(shoulder && hip) {
            // Rounded shoulders: shoulder too far forward from hip
            const shoulderForward = shoulder.x - hip.x;
            if(Math.abs(shoulderForward) > 0.1 * s) {
              issues.push("Rounded Shoulders");
            }
          }

          if(isValid(n) && cal.nY && n.y - cal.nY > 0.06 * s) {
            issues.push("Head Down");
          }
        } else {
          // Front view analysis - original logic
          if(!isValid(ls) || !isValid(rs)) return {status: "good", issues: []};
          if((ls.y + rs.y) / 2 - cal.scY > 0.04 * s) issues.push("Slouching");
          if(Math.abs(ls.x - rs.x) / cal.sw < 1 - 0.12 * s) issues.push("Leaning");
          if(isValid(n) && cal.nY && n.y - cal.nY > 0.05 * s) issues.push("Head Down");
        }

        return {
          status: issues.length >= 2 ? "bad" : issues.length === 1 ? "warning" : "good",
          issues
        };
      }

      // Segmentation mask storage
      let segMask = null;

      function drawBodyOutline(mask) {
        if(!mask) return;

        const w = mask.width, h = mask.height;
        const cw = canvas.width, ch = canvas.height;

        // Create offscreen canvas for processing
        const offCanvas = document.createElement('canvas');
        offCanvas.width = w;
        offCanvas.height = h;
        const offCtx = offCanvas.getContext('2d');

        // Draw mask
        offCtx.drawImage(mask, 0, 0);
        const imgData = offCtx.getImageData(0, 0, w, h);
        const data = imgData.data;

        // Create binary mask with blur for smoother edges
        const binaryMask = new Uint8Array(w * h);
        const threshold = 100;

        for(let i = 0; i < data.length; i += 4) {
          binaryMask[i / 4] = data[i] > threshold ? 1 : 0;
        }

        // Extract contour points by scanning rows
        const contourLeft = [];
        const contourRight = [];

        for(let y = 0; y < h; y += 2) { // Sample every 2 rows
          let leftEdge = -1, rightEdge = -1;

          // Find leftmost edge
          for(let x = 0; x < w; x++) {
            if(binaryMask[y * w + x] === 1) {
              leftEdge = x;
              break;
            }
          }

          // Find rightmost edge
          for(let x = w - 1; x >= 0; x--) {
            if(binaryMask[y * w + x] === 1) {
              rightEdge = x;
              break;
            }
          }

          if(leftEdge >= 0) contourLeft.push({x: leftEdge * cw / w, y: y * ch / h});
          if(rightEdge >= 0) contourRight.push({x: rightEdge * cw / w, y: y * ch / h});
        }

        if(contourLeft.length < 5) return;

        // Smooth the contour points
        function smoothPoints(pts, window = 3) {
          const result = [];
          for(let i = 0; i < pts.length; i++) {
            let sumX = 0, sumY = 0, count = 0;
            for(let j = Math.max(0, i - window); j <= Math.min(pts.length - 1, i + window); j++) {
              sumX += pts[j].x;
              sumY += pts[j].y;
              count++;
            }
            result.push({x: sumX / count, y: sumY / count});
          }
          return result;
        }

        const smoothLeft = smoothPoints(contourLeft, 4);
        const smoothRight = smoothPoints(contourRight, 4);

        // Draw soft glowing outline with multiple passes
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        // Helper function to draw contour
        function drawContour(points) {
          if(points.length < 3) return;
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          for(let i = 1; i < points.length - 1; i++) {
            const xc = (points[i].x + points[i + 1].x) / 2;
            const yc = (points[i].y + points[i + 1].y) / 2;
            ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
          }
          ctx.stroke();
        }

        // Draw fluorescent green dotted line outline
        // No blur to keep dots crisp and separate
        const layers = [
          { blur: 0, alpha: 0.5, width: 6, dash: [8, 20] },
          { blur: 0, alpha: 0.9, width: 3, dash: [6, 18] }
        ];

        layers.forEach(layer => {
          ctx.shadowColor = "rgba(25, 230, 107, " + layer.alpha + ")";
          ctx.shadowBlur = layer.blur;
          ctx.strokeStyle = "rgba(25, 230, 107, " + (layer.alpha * 0.8) + ")";
          ctx.lineWidth = layer.width;
          ctx.setLineDash(layer.dash);

          drawContour(smoothLeft);
          drawContour(smoothRight);

          // Connect top
          if(smoothLeft.length > 0 && smoothRight.length > 0) {
            ctx.beginPath();
            ctx.moveTo(smoothLeft[0].x, smoothLeft[0].y);
            const topCenterX = (smoothLeft[0].x + smoothRight[0].x) / 2;
            const topCenterY = Math.min(smoothLeft[0].y, smoothRight[0].y) - 10;
            ctx.quadraticCurveTo(topCenterX, topCenterY, smoothRight[0].x, smoothRight[0].y);
            ctx.stroke();
          }
        });

        // Reset line dash
        ctx.setLineDash([]);
        ctx.restore();
      }

      function drawPose(lm, mask) {
        // Sync canvas size with video
        if(video.videoWidth && video.videoHeight) {
          if(canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Privacy mode: fill background with black and show only outline
        if(privacyMode) {
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Draw body outline from segmentation mask
        if(mask) {
          drawBodyOutline(mask);
        }
      }

      function onResults(r) {
        if(r.poseLandmarks && r.poseLandmarks.length > 0) {
          const lm = r.poseLandmarks;
          const mask = r.segmentationMask || null;
          drawPose(lm, mask);

          // Always show face orientation
          const orientation = detectOrientation(lm);
          orientationEl.style.display = "block";
          orientationEl.textContent = orientation.text;
          sendRN({type: "orientation", orientation: orientation.type, text: orientation.text});

          if(isMonitoring) {
            if(!calibPose) {
              calibPose = calibrate(lm);
              if(calibPose) {
                log("Calibrated successfully");
                sendRN({type: "calibrated"});
              }
            } else {
              const res = analyze(lm, calibPose, sens);
              statusEl.textContent = res.status === "good" ? "Good" : res.status === "warning" ? "Check" : "Bad";
              statusEl.className = res.status;
              issuesEl.style.display = res.issues.length > 0 ? "block" : "none";
              issuesEl.textContent = res.issues.join(", ");
              sendRN({type: "posture", status: res.status, issues: res.issues, orientation: orientation.type});
            }
          } else {
            statusEl.textContent = "Ready";
            statusEl.className = "good";
          }
        } else {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          statusEl.textContent = "Position yourself";
          statusEl.className = "loading";
          orientationEl.style.display = "none";
        }
      }

      function startSim() {
        simMode = true;
        fallbackEl.style.display = "block";
        statusEl.textContent = "Simulation";
        log("Simulation mode activated");
        sendRN({type: "ready", simulation: true});

        let fc = 0;
        let lastSimTime = 0;
        const SIM_FPS = 15; // Also throttle simulation to 15fps
        const SIM_INTERVAL = 1000 / SIM_FPS;

        (function sf(timestamp) {
          if (timestamp - lastSimTime >= SIM_INTERVAL) {
            lastSimTime = timestamp;
            fc++;
            const w = Math.sin(fc / 30) * 0.02;
            const sl = Array(33).fill(0).map(() => ({x: 0.5, y: 0.5, z: 0, visibility: 0.9}));
            sl[0] = {x: 0.5, y: 0.15 + w, z: 0, visibility: 0.95};
            sl[11] = {x: 0.35, y: 0.35 + w, z: 0, visibility: 0.95};
            sl[12] = {x: 0.65, y: 0.35 + w, z: 0, visibility: 0.95};
            drawPose(sl);
            if(isMonitoring && !calibPose) {
              calibPose = calibrate(sl);
            }
          }
          requestAnimationFrame(sf);
        })(0);
      }

      async function tryGetUserMedia(constraints) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          return { success: true, stream };
        } catch (e) {
          return { success: false, error: e };
        }
      }

      async function startCam() {
        log("=== CAMERA INIT ===");
        log("Protocol: " + window.location.protocol);
        log("mediaDevices: " + (navigator.mediaDevices ? "OK" : "NULL"));
        log("getUserMedia: " + (navigator.mediaDevices?.getUserMedia ? "OK" : "NULL"));

        if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          log("ERROR: getUserMedia not available");
          startSim();
          return false;
        }

        // Try to enumerate devices first
        try {
          log("Enumerating devices...");
          const devs = await navigator.mediaDevices.enumerateDevices();
          const vd = devs.filter(d => d.kind === "videoinput");
          log("Found " + vd.length + " camera(s)");
          vd.forEach((d, i) => log("  [" + i + "] " + (d.label || "Camera " + i)));
        } catch(e) {
          log("Enumerate error: " + e.message);
        }

        // Try multiple constraint configurations
        const constraintsList = [
          // Most specific - front camera with resolution
          { video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } },
          // Front camera only
          { video: { facingMode: "user" } },
          // Any front camera
          { video: { facingMode: { ideal: "user" } } },
          // Just video, no constraints
          { video: true },
          // Minimal constraints
          { video: { width: { min: 320 }, height: { min: 240 } } },
        ];

        for (let i = 0; i < constraintsList.length; i++) {
          const constraints = constraintsList[i];
          log("Trying constraints [" + i + "]: " + JSON.stringify(constraints));

          const result = await tryGetUserMedia(constraints);

          if (result.success) {
            log("SUCCESS with constraints [" + i + "]");
            video.srcObject = result.stream;

            try {
              await video.play();
              log("Video playing: " + video.videoWidth + "x" + video.videoHeight);
              canvas.width = video.videoWidth || 640;
              canvas.height = video.videoHeight || 480;
              log("=== CAMERA READY ===");
              return true;
            } catch (playError) {
              log("Play error: " + playError.message);
              result.stream.getTracks().forEach(t => t.stop());
            }
          } else {
            log("Failed [" + i + "]: " + result.error.name + " - " + result.error.message);
          }
        }

        log("All camera attempts failed");

        // Retry logic
        if (retryCount < MAX_RETRIES) {
          retryCount++;
          log("Retrying... (" + retryCount + "/" + MAX_RETRIES + ")");
          await new Promise(r => setTimeout(r, 1000));
          return startCam();
        }

        startSim();
        return false;
      }

      async function init() {
        log("Initializing...");
        video = document.getElementById("video");
        canvas = document.getElementById("canvas");
        ctx = canvas.getContext("2d");
        canvas.width = 640;
        canvas.height = 480;

        const ok = await startCam();
        if(!ok) return;

        statusEl.textContent = "Loading AI...";

        try {
          pose = new Pose({
            locateFile: (f) => "https://cdn.jsdelivr.net/npm/@mediapipe/pose/" + f
          });

          pose.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            enableSegmentation: true,
            smoothSegmentation: true,
            minDetectionConfidence: 0.3,
            minTrackingConfidence: 0.3
          });

          pose.onResults(onResults);

          // Initialize model
          await pose.initialize();

          statusEl.textContent = "Ready";
          statusEl.className = "good";
          sendRN({type: "ready", simulation: false});

          let poseReady = true;
          let lastFrameTime = 0;
          const TARGET_FPS = 15; // Limit to 15fps for battery savings
          const FRAME_INTERVAL = 1000 / TARGET_FPS;

          // Start pose detection loop with FPS throttling
          (function pf(timestamp) {
            // Throttle to target FPS
            if (timestamp - lastFrameTime >= FRAME_INTERVAL) {
              if(pose && video && video.readyState === 4 && !simMode && poseReady) {
                poseReady = false;
                lastFrameTime = timestamp;
                pose.send({image: video}).then(() => {
                  poseReady = true;
                }).catch((e) => {
                  log("Pose send error: " + e.message);
                  poseReady = true;
                });
              }
            }
            requestAnimationFrame(pf);
          })(0);
        } catch (e) {
          log("AI load error: " + e.message);
          startSim();
        }
      }

      function handleMsg(e) {
        try {
          const d = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
          if(d.type === "startMonitoring") {
            isMonitoring = true;
            calibPose = null;
            sens = d.sensitivity || 1.0;
            log("Monitoring started, sensitivity: " + sens);
            sendRN({type: "started"});
          } else if(d.type === "stopMonitoring") {
            isMonitoring = false;
            calibPose = null;
            log("Monitoring stopped");
            sendRN({type: "stopped"});
          } else if(d.type === "setSensitivity") {
            sens = d.value || 1.0;
            log("Sensitivity updated: " + sens);
          } else if(d.type === "setPrivacyMode") {
            privacyMode = d.enabled === true;
            if(video) {
              video.style.opacity = privacyMode ? '0' : '1';
            }
            log("Privacy mode: " + (privacyMode ? "ON" : "OFF"));
            sendRN({type: "privacyModeChanged", enabled: privacyMode});
          }
        } catch(ex) {
          log("Message parse error: " + ex.message);
        }
      }

      window.addEventListener("message", handleMsg);
      document.addEventListener("message", handleMsg);

      if(document.readyState === "complete") {
        init();
      } else {
        window.addEventListener("load", init);
      }
    })();
  </script>
</body>
</html>
`;
