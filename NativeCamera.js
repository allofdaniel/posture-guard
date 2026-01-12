import React, { useEffect, useRef, useCallback, useState } from 'react';
import { StyleSheet, View, Text, Platform, AppState } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission, useFrameProcessor } from 'react-native-vision-camera';
import { usePoseDetection } from '@scottjgilroy/react-native-vision-camera-v4-pose-detection';
import { Worklets } from 'react-native-worklets-core';

// Pose landmark indices for key body parts
const POSE_LANDMARKS = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
};

// Minimum confidence threshold
const MIN_CONFIDENCE = 0.5;

// Posture thresholds
const POSTURE_THRESHOLDS = {
  HEAD_TILT: 15,
  SHOULDER_TILT: 10,
  HEAD_FORWARD: 0.15,
};

const NativeCamera = ({
  isMonitoring,
  sensitivity,
  onPostureChange,
  onReady,
  style
}) => {
  const device = useCameraDevice('front');
  const { hasPermission, requestPermission } = useCameraPermission();
  const [isReady, setIsReady] = useState(false);
  const [postureStatus, setPostureStatus] = useState('good');
  const [issues, setIssues] = useState([]);
  const appState = useRef(AppState.currentState);
  const cameraRef = useRef(null);
  const lastAnalysisTime = useRef(0);

  // Pose detection hook
  const { detectPose } = usePoseDetection();

  // Worklet callback to handle pose results
  const handlePoseResults = Worklets.createRunOnJS((poses) => {
    if (!isMonitoring) return;

    const now = Date.now();
    if (now - lastAnalysisTime.current < 500) return; // Throttle to 2 FPS
    lastAnalysisTime.current = now;

    if (poses && poses.length > 0) {
      const pose = poses[0];
      if (pose && pose.landmarks) {
        const analysis = analyzePosture(pose.landmarks, sensitivity);
        setPostureStatus(analysis.status);
        setIssues(analysis.issues);
        if (onPostureChange) {
          onPostureChange(analysis);
        }
      }
    }
  });

  // Analyze posture from landmarks
  const analyzePosture = (landmarks, sens) => {
    if (!landmarks || landmarks.length < 13) {
      return { status: 'unknown', issues: [] };
    }

    const resultIssues = [];
    let status = 'good';

    const nose = landmarks[POSE_LANDMARKS.NOSE];
    const leftEye = landmarks[POSE_LANDMARKS.LEFT_EYE];
    const rightEye = landmarks[POSE_LANDMARKS.RIGHT_EYE];
    const leftShoulder = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
    const rightShoulder = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];

    // Check if key landmarks are detected
    if (!nose || !leftShoulder || !rightShoulder) {
      return { status: 'unknown', issues: ['Face not detected'] };
    }

    const sensitivityMult = sens <= 0.1 ? 1.5 : sens <= 0.3 ? 1.0 : 0.7;

    // 1. Check head tilt
    if (leftEye && rightEye) {
      const eyeAngle = Math.abs(Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * (180 / Math.PI));
      if (eyeAngle > POSTURE_THRESHOLDS.HEAD_TILT * sensitivityMult) {
        resultIssues.push('Head tilt');
        status = 'warning';
      }
    }

    // 2. Check shoulder alignment
    const shoulderAngle = Math.abs(Math.atan2(rightShoulder.y - leftShoulder.y, rightShoulder.x - leftShoulder.x) * (180 / Math.PI));
    if (shoulderAngle > POSTURE_THRESHOLDS.SHOULDER_TILT * sensitivityMult) {
      resultIssues.push('Uneven shoulders');
      status = status === 'warning' ? 'bad' : 'warning';
    }

    // 3. Check forward head posture
    const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
    const shoulderWidth = Math.abs(rightShoulder.x - leftShoulder.x);
    const headOffset = Math.abs(nose.x - shoulderMidX);
    const headForwardRatio = headOffset / (shoulderWidth || 1);

    if (headForwardRatio > POSTURE_THRESHOLDS.HEAD_FORWARD * sensitivityMult) {
      resultIssues.push('Head forward');
      status = 'bad';
    }

    return { status, issues: resultIssues };
  };

  // Frame processor
  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    try {
      const poses = detectPose(frame);
      if (poses && poses.length > 0) {
        handlePoseResults(poses);
      }
    } catch (e) {
      // Ignore frame processing errors
    }
  }, [detectPose, handlePoseResults]);

  // Request camera permission
  useEffect(() => {
    const requestCameraPermission = async () => {
      if (!hasPermission) {
        await requestPermission();
      }
    };
    requestCameraPermission();
  }, [hasPermission, requestPermission]);

  // Handle app state changes
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      appState.current = nextAppState;
    });
    return () => subscription.remove();
  }, []);

  // Notify when ready
  useEffect(() => {
    if (device && hasPermission && !isReady) {
      setIsReady(true);
      if (onReady) {
        onReady();
      }
    }
  }, [device, hasPermission, isReady, onReady]);

  // Get status color
  const getStatusColor = () => {
    switch (postureStatus) {
      case 'bad': return '#EF4444';
      case 'warning': return '#F59E0B';
      default: return '#10B981';
    }
  };

  if (!device || !hasPermission) {
    return (
      <View style={[styles.container, style]}>
        <Text style={styles.loadingText}>
          {!hasPermission ? 'Camera permission required' : 'Loading camera...'}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        frameProcessor={isMonitoring ? frameProcessor : undefined}
        frameProcessorFps={5}
        pixelFormat="yuv"
      />

      {/* Posture status border */}
      {isMonitoring && (
        <View style={[styles.statusBorder, { borderColor: getStatusColor() }]} pointerEvents="none" />
      )}

      {/* Status badge */}
      {isMonitoring && issues.length > 0 && (
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor() }]}>
          <Text style={styles.statusText}>{issues.join(', ')}</Text>
        </View>
      )}

      {/* Background mode indicator */}
      {isMonitoring && (
        <View style={styles.modeIndicator}>
          <Text style={styles.modeText}>Native Camera + ML Kit</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 100,
  },
  statusBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 4,
    borderRadius: 8,
  },
  statusBadge: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  modeIndicator: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(99, 102, 241, 0.9)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  modeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
});

export default NativeCamera;
