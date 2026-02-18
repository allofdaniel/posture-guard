// App-wide constants and configuration

export const CONFIG = {
  SENSITIVITY_LEVELS: { LOW: 0.1, MEDIUM: 0.3, HIGH: 0.5 },
  MONITORING_INTERVAL: 3000,  // 3 seconds
  SESSION_INTERVAL: 1000,     // 1 second
  GOOD_POSTURE_INCREMENT: 3,  // seconds
  BAD_POSTURE_THRESHOLD: 2,   // count before alert
  BUTTON_DEBOUNCE: 500,       // ms
  POSTURE_THRESHOLD: {
    BAD_BASE: 0.15,
    BAD_MULTIPLIER: 0.1,
    WARNING_BASE: 0.3,
    WARNING_MULTIPLIER: 0.15,
  },
  VALIDATION_LIMITS: {
    TOTAL_ALERTS: 1000000,
    SESSION_TIME: 86400 * 365,  // 1 year in seconds
    SESSIONS_COUNT: 100000,
  },
  // Vibration intensity levels (duration in ms)
  VIBRATION_INTENSITY: {
    MIN: 100,      // 0.1 sec
    MAX: 2000,     // 2 sec
    DEFAULT: 800,  // 0.8 sec
    STEP: 100,     // 0.1 sec step
  },
  // Vibration patterns: [wait, vibrate, wait, vibrate, ...]
  VIBRATION_PATTERNS: {
    single: (intensity) => [0, intensity],
    double: (intensity) => [0, intensity, 150, intensity],
    triple: (intensity) => [0, intensity, 120, intensity, 120, intensity],
    heartbeat: (intensity) => [0, Math.round(intensity * 0.3), 80, Math.round(intensity * 0.6), 400, Math.round(intensity * 0.3), 80, Math.round(intensity * 0.6)],
    continuous: (intensity) => [0, intensity * 3],
    escalate: (intensity) => [0, Math.round(intensity * 0.2), 100, Math.round(intensity * 0.4), 100, Math.round(intensity * 0.7), 100, intensity],
    sos: (intensity) => [0, 100, 80, 100, 80, 100, 200, Math.round(intensity * 0.8), 80, Math.round(intensity * 0.8), 80, Math.round(intensity * 0.8), 200, 100, 80, 100, 80, 100],
    pulse: (intensity) => [0, Math.min(intensity, 150), 100, Math.min(intensity, 150), 100, Math.min(intensity, 150), 100, Math.min(intensity, 150), 100, Math.min(intensity, 150)],
  },
  // Flash intensity levels (duration in ms) - same as vibration
  FLASH_INTENSITY: {
    MIN: 100,      // 0.1 sec
    MAX: 2000,     // 2 sec
    DEFAULT: 800,  // 0.8 sec
    STEP: 100,     // 0.1 sec step
  },
  // Flash patterns: functions that return [on_ms, off_ms, ...] based on intensity
  FLASH_PATTERNS: {
    single: (intensity) => [intensity, 0],
    double: (intensity) => [intensity, Math.round(intensity * 0.25), intensity, 0],
    triple: (intensity) => [Math.round(intensity * 0.8), Math.round(intensity * 0.2), Math.round(intensity * 0.8), Math.round(intensity * 0.2), Math.round(intensity * 0.8), 0],
    heartbeat: (intensity) => [Math.round(intensity * 0.3), 80, Math.round(intensity * 0.6), 400, Math.round(intensity * 0.3), 80, Math.round(intensity * 0.6), 0],
    continuous: (intensity) => [intensity * 3, 0],
    escalate: (intensity) => [Math.round(intensity * 0.2), 100, Math.round(intensity * 0.4), 100, Math.round(intensity * 0.7), 100, intensity, 0],
    sos: (intensity) => [100, 80, 100, 80, 100, 200, Math.round(intensity * 0.8), 80, Math.round(intensity * 0.8), 80, Math.round(intensity * 0.8), 200, 100, 80, 100, 80, 100, 0],
    pulse: (intensity) => [Math.min(intensity, 150), 100, Math.min(intensity, 150), 100, Math.min(intensity, 150), 100, Math.min(intensity, 150), 100, Math.min(intensity, 150), 0],
  },
};

export const COLORS = {
  primary: '#19e66b',
  primaryDark: '#15c95c',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  background: '#112117',
  surface: '#1a2c22',
  surfaceLight: '#2a3d30',
  text: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  border: '#3d5446',
  overlay: 'rgba(0,0,0,0.6)',
  overlayStrong: 'rgba(0,0,0,0.7)',
};

export const POSTURE_STATUS = { GOOD: 'good', WARNING: 'warning', BAD: 'bad' };
