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

        // Modern color scheme - soft cyan glow
        const glowColor = "rgba(0, 220, 255, 0.8)";
        const fillColor = "rgba(0, 220, 255, 0.08)";
        const lineWidth = 2.5;

        // Landmark references
        const nose = lm[0], leye_in = lm[1], leye = lm[2], leye_out = lm[3];
        const reye_in = lm[4], reye = lm[5], reye_out = lm[6];
        const lear = lm[7], rear = lm[8];
        const mouth_l = lm[9], mouth_r = lm[10];
        const ls = lm[11], rs = lm[12]; // Shoulders
        const le = lm[13], re = lm[14]; // Elbows
        const lw = lm[15], rw = lm[16]; // Wrists
        const lh = lm[23], rh = lm[24]; // Hips

        const px = (l) => l ? {x: l.x * canvas.width, y: l.y * canvas.height, v: l.visibility} : null;

        // Helper: smooth curve through points
        function smoothCurve(points, closed = false) {
          if(points.length < 2) return;
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);

          if(points.length === 2) {
            ctx.lineTo(points[1].x, points[1].y);
          } else {
            for(let i = 0; i < points.length - 1; i++) {
              const p0 = points[i === 0 ? i : i - 1];
              const p1 = points[i];
              const p2 = points[i + 1];
              const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

              const cp1x = p1.x + (p2.x - p0.x) / 6;
              const cp1y = p1.y + (p2.y - p0.y) / 6;
              const cp2x = p2.x - (p3.x - p1.x) / 6;
              const cp2y = p2.y - (p3.y - p1.y) / 6;

              ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
            }
          }
          if(closed) ctx.closePath();
        }

        // Set glow effect
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 12;
        ctx.strokeStyle = glowColor;
        ctx.fillStyle = fillColor;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        // ===== DRAW FACE SILHOUETTE =====
        const faceValid = isValid(nose) && (isValid(leye) || isValid(reye));
        if(faceValid) {
          const np = px(nose);
          const lep = isValid(leye) ? px(leye) : null;
          const rep = isValid(reye) ? px(reye) : null;
          const leap = isValid(lear) ? px(lear) : null;
          const reap = isValid(rear) ? px(rear) : null;

          // Calculate face center and dimensions
          let centerX = np.x;
          let eyeY = np.y;
          if(lep && rep) {
            centerX = (lep.x + rep.x) / 2;
            eyeY = (lep.y + rep.y) / 2;
          }

          // Estimate face dimensions
          let faceWidth = canvas.width * 0.15;
          if(lep && rep) faceWidth = Math.abs(rep.x - lep.x) * 2.2;
          else if(leap && reap) faceWidth = Math.abs(reap.x - leap.x) * 1.1;

          const faceHeight = faceWidth * 1.35;
          const faceCenterY = eyeY + faceHeight * 0.15;

          // Draw elegant face oval
          ctx.beginPath();
          ctx.ellipse(centerX, faceCenterY, faceWidth / 2, faceHeight / 2, 0, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();
        }

        // ===== DRAW BODY SILHOUETTE =====
        if(isValid(ls) && isValid(rs)) {
          const lsp = px(ls), rsp = px(rs);
          const lep = isValid(le) ? px(le) : null;
          const rep = isValid(re) ? px(re) : null;
          const lwp = isValid(lw) ? px(lw) : null;
          const rwp = isValid(rw) ? px(rw) : null;
          const lhp = isValid(lh) ? px(lh) : null;
          const rhp = isValid(rh) ? px(rh) : null;
          const np = isValid(nose) ? px(nose) : null;

          // Calculate neck position
          const neckX = (lsp.x + rsp.x) / 2;
          const neckY = (lsp.y + rsp.y) / 2 - (rsp.x - lsp.x) * 0.15;

          // Draw connected body outline as smooth silhouette
          ctx.beginPath();

          // Start from left side, go clockwise
          // Left arm (if visible)
          if(lwp) {
            ctx.moveTo(lwp.x, lwp.y);
            if(lep) {
              ctx.quadraticCurveTo(lep.x - 10, lep.y, lsp.x, lsp.y);
            } else {
              ctx.lineTo(lsp.x, lsp.y);
            }
          } else if(lep) {
            ctx.moveTo(lep.x, lep.y);
            ctx.lineTo(lsp.x, lsp.y);
          } else {
            ctx.moveTo(lsp.x, lsp.y);
          }

          // Neck curve
          ctx.quadraticCurveTo(lsp.x + (neckX - lsp.x) * 0.3, neckY + 5, neckX, neckY);
          ctx.quadraticCurveTo(rsp.x - (rsp.x - neckX) * 0.3, neckY + 5, rsp.x, rsp.y);

          // Right arm (if visible)
          if(rep) {
            ctx.lineTo(rep.x, rep.y);
            if(rwp) {
              ctx.lineTo(rwp.x, rwp.y);
            }
          }

          ctx.stroke();

          // Draw torso separately if hips visible
          if(lhp && rhp) {
            // Torso outline with curves
            ctx.beginPath();
            ctx.moveTo(lsp.x, lsp.y);

            // Left side - curve from shoulder to hip
            const leftMidX = lsp.x - (lsp.x - lhp.x) * 0.1;
            const leftMidY = (lsp.y + lhp.y) / 2;
            ctx.quadraticCurveTo(leftMidX, leftMidY, lhp.x, lhp.y);

            // Bottom - hip to hip
            ctx.lineTo(rhp.x, rhp.y);

            // Right side - curve from hip to shoulder
            const rightMidX = rsp.x + (rsp.x - rhp.x) * 0.1;
            const rightMidY = (rsp.y + rhp.y) / 2;
            ctx.quadraticCurveTo(rightMidX, rightMidY, rsp.x, rsp.y);

            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Center line (posture reference) - subtle
            ctx.save();
            ctx.shadowBlur = 6;
            ctx.globalAlpha = 0.5;
            ctx.setLineDash([6, 6]);
            ctx.beginPath();
            const spineTop = {x: neckX, y: neckY};
            const spineBottom = {x: (lhp.x + rhp.x) / 2, y: (lhp.y + rhp.y) / 2};
            ctx.moveTo(spineTop.x, spineTop.y);
            ctx.lineTo(spineBottom.x, spineBottom.y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
          } else {
            // Just shoulder line with neck
            ctx.beginPath();
            ctx.moveTo(lsp.x, lsp.y);
            ctx.quadraticCurveTo(neckX, neckY, rsp.x, rsp.y);
            ctx.stroke();
          }

          // Draw neck to head connection
          if(np) {
            ctx.beginPath();
            ctx.moveTo(neckX, neckY);
            ctx.lineTo(np.x, np.y + canvas.height * 0.03);
            ctx.stroke();
          }

          // Small elegant joint indicators (optional, minimal)
          const jointSize = 4;
          ctx.shadowBlur = 8;

          // Shoulders only - subtle dots
          [lsp, rsp].forEach(p => {
            if(p) {
              ctx.beginPath();
              ctx.arc(p.x, p.y, jointSize, 0, 2 * Math.PI);
              ctx.fillStyle = glowColor;
              ctx.fill();
            }
          });
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
