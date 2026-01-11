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
      let pose, video, canvas, ctx, calibPose, isMonitoring = false, sens = 1.0, simMode = false;
      let retryCount = 0;
      const MAX_RETRIES = 3;
      const statusEl = document.getElementById("status");
      const issuesEl = document.getElementById("issues");
      const fallbackEl = document.getElementById("fallback-message");
      const debugEl = document.getElementById("debug-log");

      // Debug log - disabled for production
      // debugEl.style.display = 'block';

      function sendRN(d) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify(d));
        }
      }

      function log(m) {
        console.log(m);
        sendRN({type:"log", message:m});
        if(debugEl) {
          debugEl.innerHTML += m + "<br>";
          debugEl.scrollTop = debugEl.scrollHeight;
        }
      }

      function isValid(lm) { return lm && lm.visibility >= 0.5; }

      function calibrate(lm) {
        const ls = lm[11], rs = lm[12], n = lm[0];
        if(!isValid(ls) || !isValid(rs)) return null;
        return {
          scY: (ls.y + rs.y) / 2,
          sw: Math.abs(ls.x - rs.x),
          nY: isValid(n) ? n.y : null
        };
      }

      function analyze(lm, cal, s) {
        const issues = [];
        const ls = lm[11], rs = lm[12], n = lm[0];
        if(!isValid(ls) || !isValid(rs)) return {status: "good", issues: []};
        if((ls.y + rs.y) / 2 - cal.scY > 0.04 * s) issues.push("Slouching");
        if(Math.abs(ls.x - rs.x) / cal.sw < 1 - 0.12 * s) issues.push("Leaning");
        if(isValid(n) && cal.nY && n.y - cal.nY > 0.05 * s) issues.push("Head Down");
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

        // Draw smooth outline
        ctx.save();

        // Glow settings
        ctx.shadowColor = "rgba(0, 220, 255, 1)";
        ctx.shadowBlur = 20;
        ctx.strokeStyle = "rgba(0, 220, 255, 0.95)";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        // Draw left contour with bezier curves
        if(smoothLeft.length > 2) {
          ctx.beginPath();
          ctx.moveTo(smoothLeft[0].x, smoothLeft[0].y);

          for(let i = 1; i < smoothLeft.length - 1; i++) {
            const xc = (smoothLeft[i].x + smoothLeft[i + 1].x) / 2;
            const yc = (smoothLeft[i].y + smoothLeft[i + 1].y) / 2;
            ctx.quadraticCurveTo(smoothLeft[i].x, smoothLeft[i].y, xc, yc);
          }
          ctx.stroke();
        }

        // Draw right contour with bezier curves
        if(smoothRight.length > 2) {
          ctx.beginPath();
          ctx.moveTo(smoothRight[0].x, smoothRight[0].y);

          for(let i = 1; i < smoothRight.length - 1; i++) {
            const xc = (smoothRight[i].x + smoothRight[i + 1].x) / 2;
            const yc = (smoothRight[i].y + smoothRight[i + 1].y) / 2;
            ctx.quadraticCurveTo(smoothRight[i].x, smoothRight[i].y, xc, yc);
          }
          ctx.stroke();
        }

        // Connect top (head outline)
        if(smoothLeft.length > 0 && smoothRight.length > 0) {
          ctx.beginPath();
          ctx.moveTo(smoothLeft[0].x, smoothLeft[0].y);
          const topCenterX = (smoothLeft[0].x + smoothRight[0].x) / 2;
          const topCenterY = Math.min(smoothLeft[0].y, smoothRight[0].y) - 10;
          ctx.quadraticCurveTo(topCenterX, topCenterY, smoothRight[0].x, smoothRight[0].y);
          ctx.stroke();
        }

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
              sendRN({type: "posture", status: res.status, issues: res.issues});
            }
          } else {
            statusEl.textContent = "Ready";
            statusEl.className = "good";
          }
        } else {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          statusEl.textContent = "Position yourself";
          statusEl.className = "loading";
        }
      }

      function startSim() {
        simMode = true;
        fallbackEl.style.display = "block";
        statusEl.textContent = "Simulation";
        log("Simulation mode activated");
        sendRN({type: "ready", simulation: true});

        let fc = 0;
        (function sf() {
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
          requestAnimationFrame(sf);
        })();
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
          // Start pose detection loop
          (function pf() {
            if(pose && video && video.readyState === 4 && !simMode && poseReady) {
              poseReady = false;
              pose.send({image: video}).then(() => {
                poseReady = true;
              }).catch((e) => {
                log("Pose send error: " + e.message);
                poseReady = true;
              });
            }
            requestAnimationFrame(pf);
          })();
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
