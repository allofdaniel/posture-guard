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

      function drawPose(lm) {
        // Sync canvas size with video
        if(video.videoWidth && video.videoHeight) {
          if(canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }
        }

        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Color scheme
        const mainColor = "#00FF00";
        const fillColor = "rgba(0,255,0,0.15)";
        const accentColor = "#00DDFF";
        const jointRadius = 8;
        const lineWidth = 3;

        // Landmark references
        const nose = lm[0], leye = lm[2], reye = lm[5], lear = lm[7], rear = lm[8];
        const mouth_l = lm[9], mouth_r = lm[10];
        const ls = lm[11], rs = lm[12]; // Shoulders
        const le = lm[13], re = lm[14]; // Elbows
        const lw = lm[15], rw = lm[16]; // Wrists
        const lh = lm[23], rh = lm[24]; // Hips

        const px = (l) => ({x: l.x * canvas.width, y: l.y * canvas.height});

        ctx.strokeStyle = mainColor;
        ctx.fillStyle = mainColor;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        // ===== DRAW FACE OUTLINE =====
        const facePoints = [leye, reye, lear, rear, nose, mouth_l, mouth_r].filter(p => isValid(p));
        if(facePoints.length >= 3) {
          // Calculate face bounds
          const facePts = facePoints.map(px);
          const minX = Math.min(...facePts.map(p => p.x));
          const maxX = Math.max(...facePts.map(p => p.x));
          const minY = Math.min(...facePts.map(p => p.y));
          const maxY = Math.max(...facePts.map(p => p.y));

          // Calculate face center and size
          const centerX = (minX + maxX) / 2;
          const centerY = (minY + maxY) / 2;
          const faceWidth = (maxX - minX) * 1.4;
          const faceHeight = (maxY - minY) * 1.8;

          // Draw oval face shape
          ctx.beginPath();
          ctx.ellipse(centerX, centerY + faceHeight * 0.1, faceWidth / 2, faceHeight / 2, 0, 0, 2 * Math.PI);
          ctx.fillStyle = fillColor;
          ctx.fill();
          ctx.strokeStyle = mainColor;
          ctx.lineWidth = 3;
          ctx.stroke();

          // Draw eyes
          if(isValid(leye) && isValid(reye)) {
            const lep = px(leye), rep = px(reye);
            ctx.fillStyle = accentColor;
            ctx.beginPath();
            ctx.arc(lep.x, lep.y, 5, 0, 2 * Math.PI);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(rep.x, rep.y, 5, 0, 2 * Math.PI);
            ctx.fill();
          }

          // Draw ears (important for posture)
          ctx.fillStyle = mainColor;
          if(isValid(lear)) {
            const p = px(lear);
            ctx.beginPath();
            ctx.arc(p.x, p.y, 6, 0, 2 * Math.PI);
            ctx.fill();
          }
          if(isValid(rear)) {
            const p = px(rear);
            ctx.beginPath();
            ctx.arc(p.x, p.y, 6, 0, 2 * Math.PI);
            ctx.fill();
          }
        } else if(isValid(nose)) {
          // Fallback: simple head circle
          const np = px(nose);
          const headRadius = canvas.width * 0.08;
          ctx.beginPath();
          ctx.arc(np.x, np.y - headRadius * 0.3, headRadius, 0, 2 * Math.PI);
          ctx.fillStyle = fillColor;
          ctx.fill();
          ctx.strokeStyle = mainColor;
          ctx.lineWidth = 3;
          ctx.stroke();
        }

        // ===== DRAW BODY =====
        if(isValid(ls) && isValid(rs)) {
          const lsp = px(ls), rsp = px(rs);

          // Draw torso if hips visible
          if(isValid(lh) && isValid(rh)) {
            const lhp = px(lh), rhp = px(rh);

            // Fill torso area
            ctx.beginPath();
            ctx.moveTo(lsp.x, lsp.y);
            ctx.lineTo(rsp.x, rsp.y);
            ctx.lineTo(rhp.x, rhp.y);
            ctx.lineTo(lhp.x, lhp.y);
            ctx.closePath();
            ctx.fillStyle = fillColor;
            ctx.fill();
            ctx.strokeStyle = mainColor;
            ctx.lineWidth = lineWidth;
            ctx.stroke();

            // Draw hip points
            ctx.fillStyle = mainColor;
            ctx.beginPath();
            ctx.arc(lhp.x, lhp.y, jointRadius, 0, 2 * Math.PI);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(rhp.x, rhp.y, jointRadius, 0, 2 * Math.PI);
            ctx.fill();

            // Draw spine (center line)
            const spineTopX = (lsp.x + rsp.x) / 2;
            const spineTopY = (lsp.y + rsp.y) / 2;
            const spineBottomX = (lhp.x + rhp.x) / 2;
            const spineBottomY = (lhp.y + rhp.y) / 2;

            ctx.beginPath();
            ctx.setLineDash([8, 4]);
            ctx.moveTo(spineTopX, spineTopY);
            ctx.lineTo(spineBottomX, spineBottomY);
            ctx.strokeStyle = accentColor;
            ctx.stroke();
            ctx.setLineDash([]);

            // Connect neck to face
            if(isValid(nose)) {
              const np = px(nose);
              ctx.beginPath();
              ctx.moveTo(spineTopX, spineTopY);
              ctx.lineTo(np.x, np.y);
              ctx.strokeStyle = mainColor;
              ctx.stroke();
            }
          } else {
            // No hips - just draw shoulder line and neck
            ctx.beginPath();
            ctx.moveTo(lsp.x, lsp.y);
            ctx.lineTo(rsp.x, rsp.y);
            ctx.strokeStyle = mainColor;
            ctx.lineWidth = lineWidth;
            ctx.stroke();

            if(isValid(nose)) {
              const np = px(nose);
              const midX = (lsp.x + rsp.x) / 2;
              const midY = (lsp.y + rsp.y) / 2;
              ctx.beginPath();
              ctx.moveTo(midX, midY);
              ctx.lineTo(np.x, np.y);
              ctx.stroke();
            }
          }

          // Draw shoulder points
          ctx.fillStyle = mainColor;
          ctx.beginPath();
          ctx.arc(lsp.x, lsp.y, jointRadius + 2, 0, 2 * Math.PI);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(rsp.x, rsp.y, jointRadius + 2, 0, 2 * Math.PI);
          ctx.fill();

          // ===== DRAW ARMS =====
          // Left arm
          if(isValid(le)) {
            const lep = px(le);
            ctx.strokeStyle = mainColor;
            ctx.beginPath();
            ctx.moveTo(lsp.x, lsp.y);
            ctx.lineTo(lep.x, lep.y);
            ctx.stroke();
            ctx.fillStyle = mainColor;
            ctx.beginPath();
            ctx.arc(lep.x, lep.y, jointRadius, 0, 2 * Math.PI);
            ctx.fill();

            if(isValid(lw)) {
              const lwp = px(lw);
              ctx.beginPath();
              ctx.moveTo(lep.x, lep.y);
              ctx.lineTo(lwp.x, lwp.y);
              ctx.stroke();
              ctx.beginPath();
              ctx.arc(lwp.x, lwp.y, jointRadius - 2, 0, 2 * Math.PI);
              ctx.fill();
            }
          }

          // Right arm
          if(isValid(re)) {
            const rep = px(re);
            ctx.strokeStyle = mainColor;
            ctx.beginPath();
            ctx.moveTo(rsp.x, rsp.y);
            ctx.lineTo(rep.x, rep.y);
            ctx.stroke();
            ctx.fillStyle = mainColor;
            ctx.beginPath();
            ctx.arc(rep.x, rep.y, jointRadius, 0, 2 * Math.PI);
            ctx.fill();

            if(isValid(rw)) {
              const rwp = px(rw);
              ctx.beginPath();
              ctx.moveTo(rep.x, rep.y);
              ctx.lineTo(rwp.x, rwp.y);
              ctx.stroke();
              ctx.beginPath();
              ctx.arc(rwp.x, rwp.y, jointRadius - 2, 0, 2 * Math.PI);
              ctx.fill();
            }
          }
        }

        ctx.restore();
      }

      function onResults(r) {
        if(r.poseLandmarks && r.poseLandmarks.length > 0) {
          const lm = r.poseLandmarks;
          drawPose(lm);
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
            modelComplexity: 1, // Full model for better detection
            smoothLandmarks: true,
            enableSegmentation: false,
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
