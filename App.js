import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  Alert,
  Switch,
  AppState,
  Modal,
  ScrollView,
  Animated,
  useWindowDimensions,
  Linking,
  ActivityIndicator,
  Vibration,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useCameraPermissions } from 'expo-camera';
import { WebView } from 'react-native-webview';
import { POSE_DETECTION_HTML } from './PoseDetectionWebView';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import AdBanner from './AdBanner';

// Constants for configuration
const CONFIG = {
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
  // Vibration patterns: [vibrate, pause, vibrate, pause, ...]
  VIBRATION_PATTERNS: {
    short: [200],                          // 짧은 1회
    medium: [400],                         // 중간 1회
    long: [800],                           // 긴 1회
    double: [200, 100, 200],               // 2회
    triple: [200, 100, 200, 100, 200],     // 3회
    sos: [100, 50, 100, 50, 100, 200, 300, 100, 300, 100, 300, 200, 100, 50, 100, 50, 100], // SOS
  },
  // Flash patterns: [on_ms, off_ms, ...] - simulated with torch
  FLASH_PATTERNS: {
    single: [300, 0],                      // 1회 깜빡임
    double: [200, 150, 200, 0],            // 2회 깜빡임
    triple: [150, 100, 150, 100, 150, 0],  // 3회 깜빡임
    rapid: [100, 50, 100, 50, 100, 50, 100, 0], // 빠른 깜빡임
    pulse: [500, 300, 500, 0],             // 느린 펄스
  },
};

// Internationalization - English as default, Korean as secondary
const TRANSLATIONS = {
  en: {
    appName: 'Posture Guard',
    appSubtitle: 'Stay healthy with good posture',
    onboarding: [
      { title: 'Posture Guard', description: 'Build healthy posture habits\nfor a better daily life', icon: '🧘' },
      { title: 'Visual Reminder', description: 'Use camera as a mirror\nwith timed posture reminders', icon: '📱' },
      { title: 'Custom Alerts', description: 'Choose vibration or sound alerts\nand adjust reminder frequency', icon: '🔔' },
    ],
    next: 'Next',
    getStarted: 'Get Started',
    skip: 'Skip',
    pageOfTotal: 'Page {current} of {total}',
    cameraPermissionTitle: 'Camera Permission Required',
    cameraPermissionText: 'Camera is used as a mirror\nto help you check your posture.',
    cameraPermissionNote: 'Video is displayed locally as a visual reference\nand never recorded or sent externally.',
    allowPermission: 'Allow Permission',
    openSettings: 'Open Settings',
    permissionDeniedNote: 'Permission was denied. Please enable camera access in Settings.',
    loading: 'Loading...',
    checkingPermission: 'Checking permission...',
    settings: 'Settings',
    statistics: 'Statistics',
    sensitivity: 'Reminder Frequency',
    sensitivityDesc: 'Higher frequency gives more frequent posture reminders',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    relaxed: 'Relaxed',
    recommended: 'Recommended',
    strict: 'Strict',
    alertSettings: 'Alert Settings',
    vibrationAlert: 'Vibration Alert',
    vibrationAlertDesc: 'Vibrate when reminder activates',
    vibrationPattern: 'Vibration Pattern',
    vibrationPatternDesc: 'Choose vibration style',
    vibrationPatterns: {
      short: 'Short',
      medium: 'Medium',
      long: 'Long',
      double: 'Double',
      triple: 'Triple',
      sos: 'SOS',
    },
    flashAlert: 'Flash Alert',
    flashAlertDesc: 'Flash screen when reminder activates',
    flashPattern: 'Flash Pattern',
    flashPatternDesc: 'Choose flash style',
    flashPatterns: {
      single: 'Single',
      double: 'Double',
      triple: 'Triple',
      rapid: 'Rapid',
      pulse: 'Pulse',
    },
    pushAlert: 'Push Notification',
    pushAlertDesc: 'Show notification at top of screen',
    info: 'Information',
    privacyPolicy: 'Privacy Policy',
    version: 'Posture Guard v1.2.0',
    totalAlerts: 'Total Alerts',
    totalMonitoringTime: 'Total Monitoring Time',
    sessionCount: 'Session Count',
    goodPostureRate: 'Good Posture Rate',
    statsNote: 'Build healthy posture habits with regular use!',
    alerts: 'Alerts',
    currentSession: 'Current Session',
    totalSessions: 'Total Sessions',
    startMonitoring: 'Start Monitoring',
    stopMonitoring: 'Stop Monitoring',
    sessionTime: 'Session Time',
    guideText: 'Press start button\nto begin posture reminders',
    guideHint: 'Use the camera as a mirror to check your posture',
    goodPosture: 'Good Posture',
    warning: 'Caution',
    needCorrection: 'Check Your Posture!',
    alertTitle: 'Time to Check Your Posture!',
    alertBody: 'Take a moment to check and correct your posture.',
    privacyPolicyContent: 'Privacy Policy & Disclaimer\n\nDATA COLLECTION\n• Camera: Used as a mirror only, never recorded or transmitted\n• Usage stats: Session counts and times stored locally on device\n• Advertising: Google Mobile Ads may use anonymized device ID\n\nDATA STORAGE\n• All data stored locally on your device\n• No external servers or cloud storage used\n• You can clear data anytime via device settings\n\nYOUR RIGHTS\n• Access, modify, or delete your data anytime\n• Disable notifications in app settings\n• Opt-out of personalized ads in device settings\n\nDISCLAIMER\nThis app is NOT a medical device. It provides timed reminders only and does not diagnose, treat, or prevent any medical condition. Consult healthcare professionals for medical concerns.\n\nContact: allofdaniel@gmail.com',
    ok: 'OK',
    times: 'times',
    sessionComplete: 'Session Complete',
    sessionSummary: 'Session Summary',
    alertsReceived: 'Alerts Received',
    duration: 'Duration',
    close: 'Close',
    greatJob: 'Great job! Keep up the good posture!',
    needsImprovement: 'Try to maintain better posture next time!',
  },
  ko: {
    appName: '자세 알리미',
    appSubtitle: '바른 자세로 건강하게',
    onboarding: [
      { title: '자세 알리미', description: '바른 자세 습관을 만들어\n건강한 일상을 시작하세요', icon: '🧘' },
      { title: '자세 확인 거울', description: '카메라를 거울처럼 사용하고\n주기적으로 자세 알림을 받아요', icon: '📱' },
      { title: '맞춤 알림 설정', description: '진동, 소리 알림을 선택하고\n민감도를 조절할 수 있어요', icon: '🔔' },
    ],
    next: '다음',
    getStarted: '시작하기',
    skip: '건너뛰기',
    pageOfTotal: '페이지 {current} / {total}',
    cameraPermissionTitle: '카메라 권한 필요',
    cameraPermissionText: '카메라를 거울처럼 사용하여\n자세를 확인할 수 있습니다.',
    cameraPermissionNote: '촬영된 영상은 기기에서만 처리되며\n외부로 전송되지 않습니다.',
    allowPermission: '권한 허용하기',
    openSettings: '설정 열기',
    permissionDeniedNote: '권한이 거부되었습니다. 설정에서 카메라 권한을 허용해주세요.',
    loading: '로딩 중...',
    checkingPermission: '권한 확인 중...',
    settings: '설정',
    statistics: '통계',
    sensitivity: '알림 빈도',
    sensitivityDesc: '빈도가 높을수록 자세 확인 알림을 더 자주 받습니다',
    low: '낮음',
    medium: '중간',
    high: '높음',
    relaxed: '여유있게',
    recommended: '권장',
    strict: '엄격하게',
    alertSettings: '알림 설정',
    vibrationAlert: '진동 알림',
    vibrationAlertDesc: '자세 확인 시간에 진동으로 알림',
    vibrationPattern: '진동 패턴',
    vibrationPatternDesc: '진동 스타일 선택',
    vibrationPatterns: {
      short: '짧게',
      medium: '보통',
      long: '길게',
      double: '2회',
      triple: '3회',
      sos: 'SOS',
    },
    flashAlert: '화면 깜빡임',
    flashAlertDesc: '자세 확인 시간에 화면 깜빡임',
    flashPattern: '깜빡임 패턴',
    flashPatternDesc: '깜빡임 스타일 선택',
    flashPatterns: {
      single: '1회',
      double: '2회',
      triple: '3회',
      rapid: '빠르게',
      pulse: '느리게',
    },
    pushAlert: '푸시 알림',
    pushAlertDesc: '화면 상단에 알림 표시',
    info: '정보',
    privacyPolicy: '개인정보처리방침',
    version: '자세 알리미 v1.2.0',
    totalAlerts: '총 알림 횟수',
    totalMonitoringTime: '총 모니터링 시간',
    sessionCount: '세션 횟수',
    goodPostureRate: '바른 자세 비율',
    statsNote: '꾸준한 사용으로 바른 자세 습관을 만들어보세요!',
    alerts: '알림',
    currentSession: '현재 세션',
    totalSessions: '총 세션',
    startMonitoring: '모니터링 시작',
    stopMonitoring: '모니터링 중지',
    sessionTime: '세션 시간',
    guideText: '시작 버튼을 눌러\n자세 알림을 시작하세요',
    guideHint: '카메라를 거울처럼 사용해 자세를 확인하세요',
    goodPosture: '좋은 자세',
    warning: '주의',
    needCorrection: '자세 확인 필요!',
    alertTitle: '자세 확인 시간!',
    alertBody: '잠시 멈추고 자세를 확인해보세요.',
    privacyPolicyContent: '개인정보처리방침 및 면책조항\n\n데이터 수집\n• 카메라: 거울처럼 화면에만 표시되며, 녹화나 전송되지 않습니다\n• 사용 통계: 세션 횟수와 시간이 기기에만 저장됩니다\n• 광고: Google Mobile Ads가 익명화된 기기 ID를 사용할 수 있습니다\n\n데이터 저장\n• 모든 데이터는 사용자 기기에만 저장됩니다\n• 외부 서버나 클라우드 저장소를 사용하지 않습니다\n• 기기 설정에서 언제든 데이터를 삭제할 수 있습니다\n\n사용자 권리\n• 언제든 데이터에 접근, 수정, 삭제할 수 있습니다\n• 앱 설정에서 알림을 끌 수 있습니다\n• 기기 설정에서 맞춤 광고를 거부할 수 있습니다\n\n면책조항\n이 앱은 의료기기가 아닙니다. 주기적인 자세 확인 알림만 제공하며, 어떠한 의료 상태도 진단, 치료, 예방하지 않습니다. 의료 관련 사항은 전문 의료인과 상담하세요.\n\n문의: allofdaniel@gmail.com',
    ok: '확인',
    times: '회',
    sessionComplete: '세션 완료',
    sessionSummary: '세션 요약',
    alertsReceived: '받은 알림',
    duration: '시간',
    close: '닫기',
    greatJob: '잘하셨어요! 바른 자세를 유지하세요!',
    needsImprovement: '다음엔 더 바른 자세를 유지해보세요!',
  },
};

// Get device locale and set language (default to English)
const getDeviceLanguage = () => {
  try {
    const locale = Localization.locale || 'en';
    const langCode = locale.split('-')[0].toLowerCase();
    return TRANSLATIONS[langCode] ? langCode : 'en';
  } catch {
    return 'en';
  }
};

const COLORS = {
  primary: '#6366F1',
  primaryDark: '#4F46E5',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  background: '#0F172A',
  surface: '#1E293B',
  surfaceLight: '#334155',
  text: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  border: '#475569',
  overlay: 'rgba(0,0,0,0.6)',
  overlayStrong: 'rgba(0,0,0,0.7)',
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const POSTURE_STATUS = { GOOD: 'good', WARNING: 'warning', BAD: 'bad' };

const OnboardingScreen = React.memo(({ onComplete, t }) => {
  const [currentPage, setCurrentPage] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const handleNext = useCallback(() => {
    if (currentPage < t.onboarding.length - 1) {
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();
      setCurrentPage(prev => prev + 1);
    } else {
      onComplete();
    }
  }, [currentPage, fadeAnim, onComplete, t.onboarding.length]);

  const data = t.onboarding[currentPage];

  return (
    <SafeAreaView style={styles.onboardingContainer}>
      <StatusBar style="light" />
      <Animated.View style={[styles.onboardingContent, { opacity: fadeAnim }]}>
        <Text style={styles.onboardingIcon} accessibilityLabel={data.title}>{data.icon}</Text>
        <Text style={styles.onboardingTitle} accessibilityRole="header">{data.title}</Text>
        <Text style={styles.onboardingDescription}>{data.description}</Text>
      </Animated.View>
      <View style={styles.onboardingFooter}>
        <View style={styles.onboardingDots} accessibilityLabel={t.pageOfTotal.replace('{current}', currentPage + 1).replace('{total}', t.onboarding.length)}>
          {t.onboarding.map((_, index) => (
            <View key={index} style={[styles.onboardingDot, index === currentPage && styles.onboardingDotActive]} />
          ))}
        </View>
        <TouchableOpacity
          style={styles.onboardingButton}
          onPress={handleNext}
          accessibilityRole="button"
          accessibilityLabel={currentPage < t.onboarding.length - 1 ? t.next : t.getStarted}
        >
          <Text style={styles.onboardingButtonText}>
            {currentPage < t.onboarding.length - 1 ? t.next : t.getStarted}
          </Text>
        </TouchableOpacity>
        {currentPage < t.onboarding.length - 1 && (
          <TouchableOpacity
            style={styles.skipButton}
            onPress={onComplete}
            accessibilityRole="button"
            accessibilityLabel={t.skip}
          >
            <Text style={styles.skipButtonText}>{t.skip}</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
});

const PermissionScreen = React.memo(({ onRequestPermission, isDenied, t }) => {
  const handleOpenSettings = useCallback(() => {
    Linking.openSettings();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.permissionContent}>
        <View style={styles.permissionIconContainer}>
          <Text style={styles.permissionIcon} accessibilityLabel={t.cameraPermissionTitle}>📷</Text>
        </View>
        <Text style={styles.permissionTitle} accessibilityRole="header">{t.cameraPermissionTitle}</Text>
        <Text style={styles.permissionText}>{t.cameraPermissionText}</Text>
        <Text style={styles.permissionNote}>
          {isDenied ? t.permissionDeniedNote : t.cameraPermissionNote}
        </Text>
        {isDenied ? (
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={handleOpenSettings}
            accessibilityRole="button"
            accessibilityLabel={t.openSettings}
          >
            <Text style={styles.permissionButtonText}>{t.openSettings}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={onRequestPermission}
            accessibilityRole="button"
            accessibilityLabel={t.allowPermission}
          >
            <Text style={styles.permissionButtonText}>{t.allowPermission}</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
});

const StatCard = React.memo(({ icon, value, label, color }) => (
  <View
    style={[styles.statCard, { borderLeftColor: color || COLORS.primary }]}
    accessibilityLabel={`${label}: ${value}`}
    accessibilityRole="text"
  >
    <Text style={styles.statIcon} accessibilityElementsHidden>{icon}</Text>
    <Text style={styles.statValue} accessibilityElementsHidden>{value}</Text>
    <Text style={styles.statLabel} accessibilityElementsHidden>{label}</Text>
  </View>
));

const SettingItem = React.memo(({ label, description, value, onValueChange, isLast }) => (
  <View style={[styles.settingItem, isLast && styles.settingItemLast]}>
    <View style={styles.settingTextContainer}>
      <Text style={styles.settingLabel}>{label}</Text>
      {description && <Text style={styles.settingDescription}>{description}</Text>}
    </View>
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: COLORS.surfaceLight, true: COLORS.primary }}
      thumbColor={value ? '#fff' : COLORS.textSecondary}
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityRole="switch"
    />
  </View>
));

// Pattern selector component
const PatternSelector = React.memo(({ patterns, selected, onSelect, patternLabels }) => (
  <View style={styles.patternContainer}>
    {Object.keys(patterns).map((key) => (
      <TouchableOpacity
        key={key}
        style={[styles.patternOption, selected === key && styles.patternOptionActive]}
        onPress={() => onSelect(key)}
      >
        <Text style={[styles.patternLabel, selected === key && styles.patternLabelActive]}>
          {patternLabels[key] || key}
        </Text>
      </TouchableOpacity>
    ))}
  </View>
));

const SettingsModal = React.memo(({
  visible, onClose, sensitivity, setSensitivity,
  vibrationEnabled, setVibrationEnabled, vibrationPattern, setVibrationPattern,
  flashEnabled, setFlashEnabled, flashPattern, setFlashPattern,
  alertEnabled, setAlertEnabled, saveSettings, onShowPrivacyPolicy, t
}) => (
  <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{t.settings}</Text>
          <TouchableOpacity onPress={onClose} style={styles.modalCloseButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.modalCloseText}>✕</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.modalBody}>
          <View style={styles.settingsSection}>
            <Text style={styles.sectionTitle}>{t.sensitivity}</Text>
            <Text style={styles.sectionDescription}>{t.sensitivityDesc}</Text>
            <View style={styles.sensitivityContainer}>
              {[
                { value: 0.1, label: t.low, desc: t.relaxed },
                { value: 0.3, label: t.medium, desc: t.recommended },
                { value: 0.5, label: t.high, desc: t.strict }
              ].map((item) => (
                <TouchableOpacity
                  key={item.value}
                  style={[styles.sensitivityOption, sensitivity === item.value && styles.sensitivityOptionActive]}
                  onPress={() => { setSensitivity(item.value); saveSettings('sensitivity', item.value); }}
                >
                  <Text style={[styles.sensitivityLabel, sensitivity === item.value && styles.sensitivityLabelActive]}>{item.label}</Text>
                  <Text style={[styles.sensitivityDesc, sensitivity === item.value && styles.sensitivityDescActive]}>{item.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.settingsSection}>
            <Text style={styles.sectionTitle}>{t.alertSettings}</Text>
            <View style={styles.settingsList}>
              {/* Vibration Toggle */}
              <SettingItem
                label={t.vibrationAlert}
                description={t.vibrationAlertDesc}
                value={vibrationEnabled}
                onValueChange={(value) => { setVibrationEnabled(value); saveSettings('vibrationEnabled', value); }}
              />
              {/* Vibration Pattern - only show when vibration is enabled */}
              {vibrationEnabled && (
                <View style={styles.patternSection}>
                  <Text style={styles.patternTitle}>{t.vibrationPattern}</Text>
                  <PatternSelector
                    patterns={CONFIG.VIBRATION_PATTERNS}
                    selected={vibrationPattern}
                    onSelect={(pattern) => { setVibrationPattern(pattern); saveSettings('vibrationPattern', pattern); }}
                    patternLabels={t.vibrationPatterns}
                  />
                </View>
              )}
              {/* Flash Toggle */}
              <SettingItem
                label={t.flashAlert}
                description={t.flashAlertDesc}
                value={flashEnabled}
                onValueChange={(value) => { setFlashEnabled(value); saveSettings('flashEnabled', value); }}
              />
              {/* Flash Pattern - only show when flash is enabled */}
              {flashEnabled && (
                <View style={styles.patternSection}>
                  <Text style={styles.patternTitle}>{t.flashPattern}</Text>
                  <PatternSelector
                    patterns={CONFIG.FLASH_PATTERNS}
                    selected={flashPattern}
                    onSelect={(pattern) => { setFlashPattern(pattern); saveSettings('flashPattern', pattern); }}
                    patternLabels={t.flashPatterns}
                  />
                </View>
              )}
              {/* Push Notification Toggle */}
              <SettingItem
                label={t.pushAlert}
                description={t.pushAlertDesc}
                value={alertEnabled}
                onValueChange={(value) => { setAlertEnabled(value); saveSettings('alertEnabled', value); }}
                isLast
              />
            </View>
          </View>
          <View style={styles.settingsSection}>
            <Text style={styles.sectionTitle}>{t.info}</Text>
            <TouchableOpacity style={styles.infoButton} onPress={onShowPrivacyPolicy}>
              <Text style={styles.infoButtonText}>{t.privacyPolicy}</Text>
              <Text style={styles.infoButtonArrow}>›</Text>
            </TouchableOpacity>
            <View style={styles.appInfo}>
              <Text style={styles.appInfoText}>{t.version}</Text>
            </View>
          </View>
        </ScrollView>
      </View>
    </View>
  </Modal>
));

const StatsModal = React.memo(({ visible, onClose, stats, t }) => (
  <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{t.statistics}</Text>
          <TouchableOpacity onPress={onClose} style={styles.modalCloseButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.modalCloseText}>✕</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.modalBody}>
          <View style={styles.statsGrid}>
            <StatCard icon="🔔" value={stats.totalAlerts} label={t.totalAlerts} color={COLORS.warning} />
            <StatCard icon="⏱️" value={stats.totalSessionTime} label={t.totalMonitoringTime} color={COLORS.primary} />
            <StatCard icon="📊" value={stats.sessionsCount} label={t.sessionCount} color={COLORS.success} />
            <StatCard icon="✨" value={stats.goodPostureRate} label={t.goodPostureRate} color={COLORS.success} />
          </View>
          <View style={styles.statsNote}>
            <Text style={styles.statsNoteText}>{t.statsNote}</Text>
          </View>
        </ScrollView>
      </View>
    </View>
  </Modal>
));

const SessionResultModal = React.memo(({ visible, onClose, result, t }) => {
  if (!visible || !result) return null;
  const isGoodSession = result.alerts < 5;

  return (
    <Modal visible={true} animationType="fade" transparent={true} onRequestClose={onClose}>
      <View style={styles.resultModalOverlay}>
        <View style={styles.resultModalContent}>
          <Text style={styles.resultEmoji}>{isGoodSession ? '🎉' : '💪'}</Text>
          <Text style={styles.resultTitle}>{t.sessionComplete}</Text>

          <View style={styles.resultStats}>
            <View style={styles.resultStatRow}>
              <Text style={styles.resultStatLabel}>{t.duration}</Text>
              <Text style={styles.resultStatValue}>{result.duration}</Text>
            </View>
            <View style={styles.resultStatRow}>
              <Text style={styles.resultStatLabel}>{t.alertsReceived}</Text>
              <Text style={[styles.resultStatValue, { color: result.alerts > 10 ? COLORS.warning : COLORS.success }]}>
                {result.alerts}
              </Text>
            </View>
          </View>

          <Text style={styles.resultMessage}>
            {isGoodSession ? t.greatJob : t.needsImprovement}
          </Text>

          <TouchableOpacity style={styles.resultCloseButton} onPress={onClose}>
            <Text style={styles.resultCloseButtonText}>{t.close}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
});

export default function App() {
  // Use reactive dimensions hook for orientation changes
  const { width, height } = useWindowDimensions();

  // Language state
  const [lang, setLang] = useState('en');
  const t = useMemo(() => TRANSLATIONS[lang] || TRANSLATIONS.en, [lang]);

  const [permission, requestPermission] = useCameraPermissions();
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [isOnboardingChecked, setIsOnboardingChecked] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [postureStatus, setPostureStatus] = useState(POSTURE_STATUS.GOOD);
  const [badPostureCount, setBadPostureCount] = useState(0);
  const [sensitivity, setSensitivity] = useState(0.3);
  const [alertEnabled, setAlertEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [vibrationPattern, setVibrationPattern] = useState('double');
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [flashPattern, setFlashPattern] = useState('double');
  const [totalAlerts, setTotalAlerts] = useState(0);
  const [sessionTime, setSessionTime] = useState(0);
  const [totalSessionTime, setTotalSessionTime] = useState(0);
  const [sessionsCount, setSessionsCount] = useState(0);
  const [goodPostureTime, setGoodPostureTime] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showSessionResult, setShowSessionResult] = useState(false);
  const [sessionResult, setSessionResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const webViewRef = useRef(null);
  const monitoringInterval = useRef(null);
  const sessionInterval = useRef(null);
  const [webViewReady, setWebViewReady] = useState(false);
  const [currentPostureIssues, setCurrentPostureIssues] = useState([]);
  const appState = useRef(AppState.currentState);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseAnimationRef = useRef(null);
  const isMountedRef = useRef(true);

  // Refs for latest values to avoid stale closures in callbacks
  const sessionTimeRef = useRef(sessionTime);
  const totalSessionTimeRef = useRef(totalSessionTime);
  const goodPostureTimeRef = useRef(goodPostureTime);

  // Keep refs in sync with state
  useEffect(() => { sessionTimeRef.current = sessionTime; }, [sessionTime]);
  useEffect(() => { totalSessionTimeRef.current = totalSessionTime; }, [totalSessionTime]);
  useEffect(() => { goodPostureTimeRef.current = goodPostureTime; }, [goodPostureTime]);

  // Initialize language on mount
  useEffect(() => {
    const initLanguage = async () => {
      try {
        const savedLang = await AsyncStorage.getItem('appLanguage');
        if (savedLang && TRANSLATIONS[savedLang]) {
          setLang(savedLang);
        } else {
          const deviceLang = getDeviceLanguage();
          setLang(deviceLang);
          await AsyncStorage.setItem('appLanguage', deviceLang);
        }
      } catch (error) {
        console.error('Language init error:', error);
        setLang('en');
      }
    };
    initLanguage();
  }, []);

  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        const hasSeenOnboarding = await AsyncStorage.getItem('hasSeenOnboarding');
        if (hasSeenOnboarding === 'true') {
          setShowOnboarding(false);
        }
      } catch (error) {
        console.error('Onboarding check error:', error);
      }
      setIsOnboardingChecked(true);
    };
    checkOnboarding();
  }, []);

  const completeOnboarding = useCallback(async () => {
    try {
      await AsyncStorage.setItem('hasSeenOnboarding', 'true');
    } catch (error) {
      console.error('Onboarding save error:', error);
    }
    setShowOnboarding(false);
  }, []);

  // Cleanup isMounted on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const requestNotificationPermission = async () => {
      try {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== 'granted') {
          console.log('Notification permission not granted');
        }
      } catch (error) {
        console.error('Notification permission error:', error);
      }
    };
    requestNotificationPermission();
  }, []);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const keys = ['sensitivity', 'alertEnabled', 'vibrationEnabled', 'vibrationPattern', 'flashEnabled', 'flashPattern', 'totalAlerts', 'totalSessionTime', 'sessionsCount', 'goodPostureTime'];
        const results = await AsyncStorage.multiGet(keys);
        const settings = Object.fromEntries(results);

        if (settings.sensitivity) {
          const parsedSensitivity = parseFloat(settings.sensitivity);
          if (!isNaN(parsedSensitivity) && parsedSensitivity >= CONFIG.SENSITIVITY_LEVELS.LOW && parsedSensitivity <= CONFIG.SENSITIVITY_LEVELS.HIGH) {
            setSensitivity(parsedSensitivity);
          }
        }
        if (settings.alertEnabled) setAlertEnabled(settings.alertEnabled === 'true');
        if (settings.vibrationEnabled) setVibrationEnabled(settings.vibrationEnabled === 'true');
        if (settings.vibrationPattern && CONFIG.VIBRATION_PATTERNS[settings.vibrationPattern]) {
          setVibrationPattern(settings.vibrationPattern);
        }
        if (settings.flashEnabled) setFlashEnabled(settings.flashEnabled === 'true');
        if (settings.flashPattern && CONFIG.FLASH_PATTERNS[settings.flashPattern]) {
          setFlashPattern(settings.flashPattern);
        }

        // Validate numeric values with bounds checking
        const safeParseInt = (value, max = Number.MAX_SAFE_INTEGER) => {
          const parsed = parseInt(value, 10);
          if (isNaN(parsed) || parsed < 0) return 0;
          return Math.min(parsed, max);
        };

        if (settings.totalAlerts) setTotalAlerts(safeParseInt(settings.totalAlerts, CONFIG.VALIDATION_LIMITS.TOTAL_ALERTS));
        if (settings.totalSessionTime) setTotalSessionTime(safeParseInt(settings.totalSessionTime, CONFIG.VALIDATION_LIMITS.SESSION_TIME));
        if (settings.sessionsCount) setSessionsCount(safeParseInt(settings.sessionsCount, CONFIG.VALIDATION_LIMITS.SESSIONS_COUNT));
        if (settings.goodPostureTime) setGoodPostureTime(safeParseInt(settings.goodPostureTime, CONFIG.VALIDATION_LIMITS.SESSION_TIME));
      } catch (error) {
        console.error('Settings load error:', error);
      }
    };
    loadSettings();
  }, []);

  const saveSettings = useCallback(async (key, value) => {
    try {
      await AsyncStorage.setItem(key, String(value));
    } catch (error) {
      console.error('Settings save error:', error);
    }
  }, []);

  const saveSessionStats = useCallback(async () => {
    try {
      // Use refs to get the latest values and avoid stale closures
      const currentSessionTime = sessionTimeRef.current;
      const currentTotalSessionTime = totalSessionTimeRef.current;
      const currentGoodPostureTime = goodPostureTimeRef.current;

      const newTotalTime = currentTotalSessionTime + currentSessionTime;
      await AsyncStorage.multiSet([
        ['totalSessionTime', String(newTotalTime)],
        ['goodPostureTime', String(currentGoodPostureTime)]
      ]);
      setTotalSessionTime(newTotalTime);
    } catch (error) {
      console.error('Session stats save error:', error);
    }
  }, []); // Empty deps - uses refs for latest values

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current === 'active' && nextAppState.match(/inactive|background/)) {
        if (isMonitoring) {
          saveSessionStats();
        }
      }
      appState.current = nextAppState;
    });
    return () => subscription.remove();
  }, [isMonitoring, saveSessionStats]);

  // Flash screen overlay state for visual alert
  const [showFlashOverlay, setShowFlashOverlay] = useState(false);

  // Execute flash pattern
  const executeFlashPattern = useCallback(async (pattern) => {
    const timings = CONFIG.FLASH_PATTERNS[pattern] || CONFIG.FLASH_PATTERNS.double;
    for (let i = 0; i < timings.length; i += 2) {
      const onTime = timings[i];
      const offTime = timings[i + 1] || 0;

      if (onTime > 0) {
        setShowFlashOverlay(true);
        await new Promise(resolve => setTimeout(resolve, onTime));
        setShowFlashOverlay(false);
      }
      if (offTime > 0) {
        await new Promise(resolve => setTimeout(resolve, offTime));
      }
    }
  }, []);

  const triggerBadPostureAlert = useCallback(async () => {
    const newTotalAlerts = totalAlerts + 1;
    setTotalAlerts(newTotalAlerts);
    saveSettings('totalAlerts', newTotalAlerts);

    // Vibration alert with pattern
    if (vibrationEnabled) {
      try {
        const pattern = CONFIG.VIBRATION_PATTERNS[vibrationPattern] || CONFIG.VIBRATION_PATTERNS.double;
        Vibration.vibrate(pattern);
      } catch (error) {
        console.error('Vibration error:', error);
        // Fallback to haptics if Vibration fails
        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } catch {
          // Ignore haptics error
        }
      }
    }

    // Flash alert with pattern
    if (flashEnabled) {
      try {
        executeFlashPattern(flashPattern);
      } catch (error) {
        console.error('Flash error:', error);
      }
    }

    // Push notification
    if (alertEnabled) {
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: t.alertTitle,
            body: t.alertBody,
            sound: true,
          },
          trigger: null,
        });
      } catch (error) {
        console.error('Notification error:', error);
      }
    }
  }, [alertEnabled, vibrationEnabled, vibrationPattern, flashEnabled, flashPattern, totalAlerts, saveSettings, executeFlashPattern, t]);

  // Handle messages from WebView (pose detection results)
  const handleWebViewMessage = useCallback((event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'ready') {
        setWebViewReady(true);
      } else if (data.type === 'posture') {
        // Convert status string to POSTURE_STATUS
        let status = POSTURE_STATUS.GOOD;
        if (data.status === 'bad') status = POSTURE_STATUS.BAD;
        else if (data.status === 'warning') status = POSTURE_STATUS.WARNING;

        setPostureStatus(status);
        setCurrentPostureIssues(data.issues || []);

        // Handle good/bad posture logic
        if (status === POSTURE_STATUS.GOOD) {
          setGoodPostureTime(prev => prev + 1);
        }

        if (status === POSTURE_STATUS.BAD) {
          setBadPostureCount(prev => {
            if (prev >= CONFIG.BAD_POSTURE_THRESHOLD) {
              triggerBadPostureAlert();
              return 0;
            }
            return prev + 1;
          });
        } else {
          setBadPostureCount(0);
        }
      } else if (data.type === 'calibrated') {
        // Pose calibrated - monitoring is now active
        console.log('Pose calibrated');
      } else if (data.type === 'error') {
        console.error('WebView error:', data.message);
      }
    } catch (e) {
      console.error('WebView message parse error:', e);
    }
  }, [triggerBadPostureAlert]);

  // Send message to WebView
  const sendToWebView = useCallback((message) => {
    if (webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify(message));
    }
  }, []);

  useEffect(() => {
    if (isMonitoring) {
      // Store animation reference for proper cleanup
      pulseAnimationRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.05, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ])
      );
      pulseAnimationRef.current.start();
    } else {
      // Stop animation and reset value
      if (pulseAnimationRef.current) {
        pulseAnimationRef.current.stop();
        pulseAnimationRef.current = null;
      }
      pulseAnim.setValue(1);
    }

    // Cleanup on unmount
    return () => {
      if (pulseAnimationRef.current) {
        pulseAnimationRef.current.stop();
        pulseAnimationRef.current = null;
      }
    };
  }, [isMonitoring, pulseAnim]);

  // Send start/stop monitoring to WebView when monitoring state changes
  useEffect(() => {
    if (isMonitoring) {
      // Start session timer
      sessionInterval.current = setInterval(() => {
        if (!isMountedRef.current) return;
        setSessionTime(prev => prev + 1);
      }, CONFIG.SESSION_INTERVAL);

      // Tell WebView to start monitoring with current sensitivity
      // Map sensitivity to detection sensitivity (higher app sensitivity = lower threshold = more sensitive)
      const detectionSensitivity = sensitivity <= 0.1 ? 1.5 : sensitivity <= 0.3 ? 1.0 : 0.7;
      sendToWebView({ type: 'startMonitoring', sensitivity: detectionSensitivity });
    } else {
      // Stop session timer
      if (sessionInterval.current) clearInterval(sessionInterval.current);

      // Tell WebView to stop monitoring
      sendToWebView({ type: 'stopMonitoring' });
    }

    return () => {
      if (sessionInterval.current) clearInterval(sessionInterval.current);
    };
  }, [isMonitoring, sensitivity, sendToWebView]);

  const formatTime = useCallback((seconds) => {
    // Handle invalid input
    if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) {
      return '00:00';
    }
    const safeSeconds = Math.floor(seconds);
    const hrs = Math.floor(safeSeconds / 3600);
    const mins = Math.floor((safeSeconds % 3600) / 60);
    const secs = safeSeconds % 60;

    if (hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, []);

  const toggleMonitoring = useCallback(async () => {
    // Prevent rapid clicks
    if (isProcessing) return;
    setIsProcessing(true);

    try {
      if (isMonitoring) {
        // Stop monitoring first
        setIsMonitoring(false);
        setPostureStatus(POSTURE_STATUS.GOOD);

        // Capture session data before resetting
        const sessionDuration = formatTime(sessionTimeRef.current);
        const sessionAlerts = totalAlerts;

        // Save session stats
        await saveSessionStats();
        const newSessionsCount = sessionsCount + 1;
        setSessionsCount(newSessionsCount);
        await saveSettings('sessionsCount', newSessionsCount);

        // Show session result using Alert
        Alert.alert(
          'Session Complete',
          `Duration: ${sessionDuration}\nAlerts: ${sessionAlerts}`,
          [{ text: 'OK', style: 'default' }]
        );
      } else {
        // Close result modal if open
        setShowSessionResult(false);
        setSessionTime(0);
        setBadPostureCount(0);
        setIsMonitoring(true);
        setPostureStatus(POSTURE_STATUS.GOOD);
      }
    } finally {
      // Delay to prevent rapid clicking
      setTimeout(() => setIsProcessing(false), CONFIG.BUTTON_DEBOUNCE);
    }
  }, [isMonitoring, isProcessing, saveSessionStats, sessionsCount, saveSettings, formatTime, totalAlerts, t]);

  const statsData = useMemo(() => ({
    totalAlerts,
    totalSessionTime: formatTime(totalSessionTime + sessionTime),
    sessionsCount: `${sessionsCount}${lang === 'ko' ? t.times : ''}`,
    goodPostureRate: totalSessionTime > 0
      ? `${Math.round((goodPostureTime / (totalSessionTime + sessionTime)) * 100)}%`
      : '-',
  }), [totalAlerts, totalSessionTime, sessionTime, sessionsCount, goodPostureTime, formatTime, lang, t.times]);

  const showPrivacyPolicy = useCallback(() => {
    Alert.alert(
      t.privacyPolicy,
      t.privacyPolicyContent,
      [{ text: t.ok, style: 'default' }]
    );
  }, [t]);

  const getStatusColor = useCallback(() => {
    switch (postureStatus) {
      case POSTURE_STATUS.BAD: return COLORS.danger;
      case POSTURE_STATUS.WARNING: return COLORS.warning;
      default: return COLORS.success;
    }
  }, [postureStatus]);

  const getStatusText = useCallback(() => {
    switch (postureStatus) {
      case POSTURE_STATUS.BAD: return t.needCorrection;
      case POSTURE_STATUS.WARNING: return t.warning;
      default: return t.goodPosture;
    }
  }, [postureStatus, t]);

  const getStatusEmoji = useCallback(() => {
    switch (postureStatus) {
      case POSTURE_STATUS.BAD: return '😣';
      case POSTURE_STATUS.WARNING: return '😐';
      default: return '😊';
    }
  }, [postureStatus]);

  // Loading states
  if (!isOnboardingChecked) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>{t.loading}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (showOnboarding) {
    return <OnboardingScreen onComplete={completeOnboarding} t={t} />;
  }

  if (!permission) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>{t.checkingPermission}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    // Check if permission was explicitly denied (canAskAgain will be false)
    const isDenied = permission.status === 'denied' && !permission.canAskAgain;
    return <PermissionScreen onRequestPermission={requestPermission} isDenied={isDenied} t={t} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle} accessibilityRole="header">{t.appName}</Text>
          <Text style={styles.headerSubtitle}>{t.appSubtitle}</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setShowStats(true)}
            accessibilityRole="button"
            accessibilityLabel={t.statistics}
          >
            <Text style={styles.headerButtonIcon}>📊</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setShowSettings(true)}
            accessibilityRole="button"
            accessibilityLabel={t.settings}
          >
            <Text style={styles.headerButtonIcon}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Camera View with AI Pose Detection */}
      <Animated.View style={[styles.cameraContainer, { flex: 1, transform: [{ scale: pulseAnim }] }]}>
        <WebView
          ref={webViewRef}
          source={{ html: POSE_DETECTION_HTML, baseUrl: 'https://localhost/' }}
          style={styles.camera}
          onMessage={handleWebViewMessage}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback={true}
          originWhitelist={['*']}
          mixedContentMode="always"
          allowFileAccess={true}
          allowUniversalAccessFromFileURLs={true}
          scalesPageToFit={true}
          mediaCapturePermissionGrantType="grant"
          androidLayerType="hardware"
          geolocationEnabled={false}
          allowsProtectedMedia={true}
          webviewDebuggingEnabled={__DEV__}
          onPermissionRequest={(request) => {
            // Grant all permissions requested by WebView (camera, audio)
            if (request && request.grant) {
              request.grant(request.resources);
            }
          }}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.warn('WebView error:', nativeEvent);
          }}
          onHttpError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.warn('WebView HTTP error:', nativeEvent.statusCode);
          }}
        />
        {/* Overlay for session info - shown on top of WebView */}
        {isMonitoring && (
          <View style={styles.webViewOverlay}>
            <View style={styles.sessionInfo}>
              <Text style={styles.sessionTimeLabel}>{t.sessionTime}</Text>
              <Text style={styles.sessionTime}>{formatTime(sessionTime)}</Text>
            </View>
            {currentPostureIssues.length > 0 && (
              <View style={styles.issuesContainer}>
                <Text style={styles.issuesText}>{currentPostureIssues.join(', ')}</Text>
              </View>
            )}
          </View>
        )}
        {!webViewReady && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#6366F1" />
            <Text style={styles.loadingText}>{t.loading}</Text>
          </View>
        )}
      </Animated.View>

      {/* Compact Bottom Control Panel */}
      <View style={styles.bottomPanel}>
        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{totalAlerts}</Text>
            <Text style={styles.statLabel}>{t.alerts}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{formatTime(sessionTime)}</Text>
            <Text style={styles.statLabel}>{t.currentSession}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{sessionsCount}</Text>
            <Text style={styles.statLabel}>{t.totalSessions}</Text>
          </View>
        </View>

        {/* Main Button */}
        <TouchableOpacity
          style={[
            styles.mainButton,
            { backgroundColor: isMonitoring ? COLORS.danger : COLORS.primary },
            isProcessing && { opacity: 0.6 }
          ]}
          onPress={toggleMonitoring}
          activeOpacity={0.8}
          disabled={isProcessing}
        >
          <Text style={styles.mainButtonText}>
            {isMonitoring ? t.stopMonitoring : t.startMonitoring}
          </Text>
        </TouchableOpacity>

        {/* Sensitivity Row */}
        <View style={styles.sensitivityRow}>
          <Text style={styles.sensitivityLabel}>{t.sensitivity}:</Text>
          {[
            { value: 0.1, label: t.low },
            { value: 0.3, label: t.medium },
            { value: 0.5, label: t.high }
          ].map((item) => (
            <TouchableOpacity
              key={item.value}
              style={[styles.sensButton, sensitivity === item.value && styles.sensButtonActive]}
              onPress={() => { setSensitivity(item.value); saveSettings('sensitivity', item.value); }}
            >
              <Text style={[styles.sensButtonText, sensitivity === item.value && styles.sensButtonTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Ad Banner */}
      <AdBanner />

      {/* Flash Overlay for visual alert */}
      {showFlashOverlay && (
        <View style={styles.flashOverlay} pointerEvents="none" />
      )}

      {/* Modals */}
      <SettingsModal
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        sensitivity={sensitivity}
        setSensitivity={setSensitivity}
        vibrationEnabled={vibrationEnabled}
        setVibrationEnabled={setVibrationEnabled}
        vibrationPattern={vibrationPattern}
        setVibrationPattern={setVibrationPattern}
        flashEnabled={flashEnabled}
        setFlashEnabled={setFlashEnabled}
        flashPattern={flashPattern}
        setFlashPattern={setFlashPattern}
        alertEnabled={alertEnabled}
        setAlertEnabled={setAlertEnabled}
        saveSettings={saveSettings}
        onShowPrivacyPolicy={showPrivacyPolicy}
        t={t}
      />
      <StatsModal
        visible={showStats}
        onClose={() => setShowStats(false)}
        stats={statsData}
        t={t}
      />
      <SessionResultModal
        visible={showSessionResult}
        onClose={() => setShowSessionResult(false)}
        result={sessionResult}
        t={t}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: COLORS.text, fontSize: 16 },
  onboardingContainer: { flex: 1, backgroundColor: COLORS.background },
  onboardingContent: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  onboardingIcon: { fontSize: 80, marginBottom: 32 },
  onboardingTitle: { fontSize: 28, fontWeight: 'bold', color: COLORS.text, marginBottom: 16, textAlign: 'center' },
  onboardingDescription: { fontSize: 16, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 24 },
  onboardingFooter: { paddingHorizontal: 24, paddingBottom: 40, alignItems: 'center' },
  onboardingDots: { flexDirection: 'row', marginBottom: 24 },
  onboardingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.surfaceLight, marginHorizontal: 4 },
  onboardingDotActive: { backgroundColor: COLORS.primary, width: 24 },
  onboardingButton: { backgroundColor: COLORS.primary, paddingVertical: 16, paddingHorizontal: 48, borderRadius: 12, width: '100%' },
  onboardingButtonText: { color: COLORS.text, fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
  skipButton: { marginTop: 16, padding: 8 },
  skipButtonText: { color: COLORS.textMuted, fontSize: 14 },
  permissionContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  permissionIconContainer: { width: 120, height: 120, borderRadius: 60, backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  permissionIcon: { fontSize: 56 },
  permissionTitle: { fontSize: 24, fontWeight: 'bold', color: COLORS.text, marginBottom: 12 },
  permissionText: { fontSize: 16, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 8, lineHeight: 24 },
  permissionNote: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', marginBottom: 32, lineHeight: 20 },
  permissionButton: { backgroundColor: COLORS.primary, paddingVertical: 16, paddingHorizontal: 40, borderRadius: 12 },
  permissionButtonText: { color: COLORS.text, fontSize: 18, fontWeight: 'bold' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, paddingTop: Platform.OS === 'android' ? 28 : 4, position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  headerLeft: {},
  headerTitle: { fontSize: 14, fontWeight: 'bold', color: COLORS.text },
  headerSubtitle: { fontSize: 9, color: COLORS.textMuted },
  headerRight: { flexDirection: 'row', gap: 4 },
  headerButton: { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(30,30,46,0.8)', justifyContent: 'center', alignItems: 'center' },
  headerButtonIcon: { fontSize: 12 },
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  statusOverlay: { flex: 1, borderWidth: 4, borderRadius: 20, justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 24 },
  statusEmoji: { fontSize: 24, marginRight: 8 },
  statusText: { fontSize: 16, fontWeight: 'bold', color: COLORS.text },
  sessionInfo: { backgroundColor: COLORS.overlay, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, alignItems: 'center' },
  sessionTimeLabel: { fontSize: 10, color: COLORS.textSecondary, marginBottom: 2 },
  sessionTime: { fontSize: 20, color: COLORS.text, fontWeight: 'bold' },
  guideOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.overlayStrong },
  guideEmoji: { fontSize: 56, marginBottom: 16 },
  guideText: { fontSize: 18, color: COLORS.text, textAlign: 'center', lineHeight: 26, fontWeight: '500' },
  guideHint: { fontSize: 13, color: COLORS.textMuted, marginTop: 12, textAlign: 'center' },
  bottomPanel: { backgroundColor: COLORS.surface, paddingHorizontal: 12, paddingVertical: 8, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 14, fontWeight: 'bold', color: COLORS.text },
  statLabel: { fontSize: 9, color: COLORS.textMuted },
  mainButton: { alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10, marginBottom: 8 },
  mainButtonText: { color: COLORS.text, fontSize: 14, fontWeight: 'bold' },
  sensitivityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  sensitivityLabel: { fontSize: 10, color: COLORS.textMuted, marginRight: 4 },
  sensButton: { paddingVertical: 4, paddingHorizontal: 12, borderRadius: 6, backgroundColor: COLORS.surfaceLight },
  sensButtonActive: { backgroundColor: COLORS.primary },
  sensButtonText: { fontSize: 10, color: COLORS.textSecondary },
  sensButtonTextActive: { color: COLORS.text, fontWeight: 'bold' },
  adContainer: { alignItems: 'center', backgroundColor: COLORS.background, paddingBottom: Platform.OS === 'ios' ? 0 : 8 },
  modalOverlay: { flex: 1, backgroundColor: COLORS.overlayStrong, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text },
  modalCloseButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.surfaceLight, justifyContent: 'center', alignItems: 'center' },
  modalCloseText: { fontSize: 16, color: COLORS.textSecondary },
  modalBody: { padding: 20 },
  settingsSection: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.text, marginBottom: 4 },
  sectionDescription: { fontSize: 13, color: COLORS.textMuted, marginBottom: 12 },
  sensitivityContainer: { flexDirection: 'row', gap: 8 },
  sensitivityOption: { flex: 1, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12, backgroundColor: COLORS.surfaceLight, alignItems: 'center' },
  sensitivityOptionActive: { backgroundColor: COLORS.primary },
  sensitivityLabel: { fontSize: 15, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 2 },
  sensitivityLabelActive: { color: COLORS.text },
  sensitivityDesc: { fontSize: 11, color: COLORS.textMuted },
  sensitivityDescActive: { color: COLORS.text, opacity: 0.8 },
  settingsList: { backgroundColor: COLORS.surfaceLight, borderRadius: 12, overflow: 'hidden' },
  settingItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  settingItemLast: { borderBottomWidth: 0 },
  settingTextContainer: { flex: 1, marginRight: 12 },
  settingLabel: { fontSize: 15, color: COLORS.text, fontWeight: '500' },
  settingDescription: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  infoButton: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surfaceLight, borderRadius: 12, padding: 16 },
  infoButtonText: { fontSize: 15, color: COLORS.text },
  infoButtonArrow: { fontSize: 20, color: COLORS.textMuted },
  appInfo: { marginTop: 16, alignItems: 'center' },
  appInfoText: { fontSize: 12, color: COLORS.textMuted },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard: { width: '47%', backgroundColor: COLORS.surfaceLight, borderRadius: 16, padding: 16, borderLeftWidth: 4 },
  statIcon: { fontSize: 24, marginBottom: 8 },
  statValue: { fontSize: 24, fontWeight: 'bold', color: COLORS.text, marginBottom: 4 },
  statLabel: { fontSize: 12, color: COLORS.textMuted },
  statsNote: { marginTop: 20, padding: 16, backgroundColor: COLORS.surfaceLight, borderRadius: 12, alignItems: 'center' },
  statsNoteText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },
  webViewOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12, alignItems: 'center' },
  issuesContainer: { backgroundColor: COLORS.overlay, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, marginTop: 8 },
  issuesText: { fontSize: 12, color: COLORS.text, fontWeight: '500' },
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: COLORS.overlayStrong, justifyContent: 'center', alignItems: 'center' },
  resultModalOverlay: { flex: 1, backgroundColor: COLORS.overlayStrong, justifyContent: 'center', alignItems: 'center', padding: 24 },
  resultModalContent: { backgroundColor: COLORS.surface, borderRadius: 24, padding: 32, alignItems: 'center', width: '100%', maxWidth: 320 },
  resultEmoji: { fontSize: 64, marginBottom: 16 },
  resultTitle: { fontSize: 24, fontWeight: 'bold', color: COLORS.text, marginBottom: 24 },
  resultStats: { width: '100%', marginBottom: 20 },
  resultStatRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  resultStatLabel: { fontSize: 16, color: COLORS.textSecondary },
  resultStatValue: { fontSize: 18, fontWeight: 'bold', color: COLORS.text },
  resultMessage: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 24 },
  resultCloseButton: { backgroundColor: COLORS.primary, paddingVertical: 14, paddingHorizontal: 48, borderRadius: 12 },
  resultCloseButtonText: { color: COLORS.text, fontSize: 16, fontWeight: 'bold' },
  // Pattern selector styles
  patternSection: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  patternTitle: { fontSize: 13, color: COLORS.textMuted, marginBottom: 8 },
  patternContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  patternOption: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: COLORS.surfaceLight, minWidth: 60, alignItems: 'center' },
  patternOptionActive: { backgroundColor: COLORS.primary },
  patternLabel: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '500' },
  patternLabelActive: { color: COLORS.text },
  // Flash overlay for visual alert
  flashOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255, 255, 255, 0.9)', zIndex: 9999 },
});
