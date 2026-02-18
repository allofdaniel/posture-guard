import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Text,
  View,
  TouchableOpacity,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Platform,
  Alert,
  AppState,
  Animated,
  useWindowDimensions,
  ActivityIndicator,
  Vibration,
  DeviceEventEmitter,
  Linking,
  NativeModules,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useCameraPermissions } from 'expo-camera';
import { WebView } from 'react-native-webview';
import { POSE_DETECTION_HTML } from './PoseDetectionWebView';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AdBanner from './AdBanner';
// Custom Torch Module (Kotlin native)
const { TorchModule } = NativeModules;
const Torch = {
  switchState: async (state) => {
    if (TorchModule) {
      return TorchModule.switchState(state);
    }
    throw new Error('TorchModule not available');
  }
};
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Audio } from 'expo-av';
// PIP 기능 비활성화 - 정확도 이슈로 제거
// import { isPipSupported, enterPipMode, setAutoEnterPip, isInPipMode as checkPipMode, updatePipStatus } from './PipModule';
import { updateWidget } from './WidgetModule';
import PremiumModal from './PremiumModal';
import { initializePremium, isAdFree, cleanupPremium } from './PremiumManager';
import Slider from '@react-native-community/slider';

// Import modular components
import {
  CONFIG,
  COLORS,
  POSTURE_STATUS,
  TRANSLATIONS,
  getDeviceLanguage,
  styles,
  OnboardingScreen,
  PermissionScreen,
  SettingsModal,
  StatsModal,
  SessionResultModal,
  DeskClock,
} from './components';

// Set up notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Component definitions have been moved to ./components/

// Combined welcome screen - onboarding + permission in one step
const _WelcomeScreen = React.memo(({ onStart, needsPermission, isDenied, t }) => {
  const handleOpenSettings = useCallback(() => {
    Linking.openSettings();
  }, []);

  return (
    <SafeAreaView style={styles.onboardingContainer}>
      <StatusBar style="light" />
      <View style={styles.onboardingContent}>
        <Text style={styles.onboardingIcon}>🧘</Text>
        <Text style={styles.onboardingTitle}>{t.appName}</Text>
        <Text style={styles.onboardingDescription}>{t.appSubtitle}</Text>
        <View style={{ marginTop: 24, gap: 12, width: '100%', paddingHorizontal: 20 }}>
          {t.onboarding.map((item, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={{ fontSize: 24 }}>{item.icon}</Text>
              <Text style={{ color: '#ccc', fontSize: 14, flex: 1 }}>{item.title}</Text>
            </View>
          ))}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{ fontSize: 24 }}>📷</Text>
            <Text style={{ color: '#999', fontSize: 12, flex: 1 }}>{t.cameraPermissionNote}</Text>
          </View>
        </View>
      </View>
      <View style={styles.onboardingFooter}>
        {isDenied ? (
          <TouchableOpacity style={styles.onboardingButton} onPress={handleOpenSettings}>
            <Text style={styles.onboardingButtonText}>{t.openSettings}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.onboardingButton} onPress={onStart}>
            <Text style={styles.onboardingButtonText}>{t.getStarted}</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
});

const _StatCard = React.memo(({ icon, value, label, color }) => (
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

const _SettingItem = React.memo(({ label, description, value, onValueChange, isLast }) => (
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
const _PatternSelector = React.memo(({ patterns, selected, onSelect, patternLabels }) => (
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

// Intensity selector component (step buttons)
const _IntensitySelector = React.memo(({ value, onChange, min, max, step, t }) => {
  const levels = [];
  for (let i = min; i <= max; i += step) {
    levels.push(i);
  }
  return (
    <View style={styles.intensityContainer}>
      <Text style={styles.intensityLabel}>{t.vibrationIntensity}</Text>
      <View style={styles.intensityButtons}>
        {levels.map((level) => (
          <TouchableOpacity
            key={level}
            style={[styles.intensityButton, value === level && styles.intensityButtonActive]}
            onPress={() => onChange(level)}
          >
            <Text style={[styles.intensityButtonText, value === level && styles.intensityButtonTextActive]}>
              {level / 100}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.intensityHint}>{value}ms</Text>
    </View>
  );
});

const _SettingsModal = React.memo(({
  visible, onClose, sensitivity, setSensitivity,
  vibrationEnabled, setVibrationEnabled, vibrationIntensity, setVibrationIntensity, vibrationPattern, setVibrationPattern,
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
              {/* Vibration Settings - only show when vibration is enabled */}
              {vibrationEnabled && (
                <>
                  {/* Vibration Intensity */}
                  <View style={styles.patternSection}>
                    <IntensitySelector
                      value={vibrationIntensity}
                      onChange={(val) => { setVibrationIntensity(val); saveSettings('vibrationIntensity', val); }}
                      min={CONFIG.VIBRATION_INTENSITY.MIN}
                      max={CONFIG.VIBRATION_INTENSITY.MAX}
                      step={CONFIG.VIBRATION_INTENSITY.STEP}
                      t={t}
                    />
                  </View>
                  {/* Vibration Pattern */}
                  <View style={styles.patternSection}>
                    <Text style={styles.patternTitle}>{t.vibrationPattern}</Text>
                    <PatternSelector
                      patterns={CONFIG.VIBRATION_PATTERNS}
                      selected={vibrationPattern}
                      onSelect={(pattern) => { setVibrationPattern(pattern); saveSettings('vibrationPattern', pattern); }}
                      patternLabels={t.vibrationPatterns}
                    />
                  </View>
                </>
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

const _StatsModal = React.memo(({ visible, onClose, stats, t }) => (
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

const _SessionResultModal = React.memo(({ visible, onClose, result, t }) => {
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
  const [vibrationIntensity, setVibrationIntensity] = useState(CONFIG.VIBRATION_INTENSITY.DEFAULT);
  const [vibrationPattern, setVibrationPattern] = useState('double');
  const [flashEnabled, setFlashEnabled] = useState(true); // 화면 플래시 기본 활성화
  const [flashIntensity, setFlashIntensity] = useState(CONFIG.FLASH_INTENSITY?.DEFAULT || 800);
  const [flashPattern, setFlashPattern] = useState('double');
  const [torchEnabled, setTorchEnabled] = useState(true); // 카메라 플래시(손전등) 기본 활성화
  const [torchIntensity, setTorchIntensity] = useState(CONFIG.FLASH_INTENSITY?.DEFAULT || 800);
  const [torchPattern, setTorchPattern] = useState('double');
  const [totalAlerts, setTotalAlerts] = useState(0);
  const [sessionTime, setSessionTime] = useState(0);
  const [totalSessionTime, setTotalSessionTime] = useState(0);
  const [sessionsCount, setSessionsCount] = useState(0);
  const [goodPostureTime, setGoodPostureTime] = useState(0);
  const [sessionGoodPostureTime, setSessionGoodPostureTime] = useState(0); // Session-specific good posture time
  const [warningCount, setWarningCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);

  // Calculate good posture rate for current session (capped at 100%)
  const goodPostureRate = sessionTime > 0 ? Math.min(100, Math.round((sessionGoodPostureTime / sessionTime) * 100)) : 0;
  const [showSettings, setShowSettings] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showSessionResult, setShowSessionResult] = useState(false);
  const [sessionResult, setSessionResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showFlashOverlay, setShowFlashOverlay] = useState(false);
  // PIP 기능 비활성화
  const pipSupported = false;
  const isInPipMode = false;
  const isInPipBySize = false;
  const pipActive = false;
  const isLandscape = width > height && !pipActive;
  const [showPremium, setShowPremium] = useState(false);
  const [hideAds, setHideAds] = useState(false);
  const [screenOffMode, setScreenOffMode] = useState(false);
  const [clockSettings, setClockSettings] = useState({
    showTime: true, showDate: true, showDay: true, showStats: true,
    fontSize: 'large', color: 'green',
  });
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastTimeoutRef = useRef(null);

  const webViewRef = useRef(null);
  const monitoringInterval = useRef(null);
  const sessionInterval = useRef(null);
  const [webViewReady, setWebViewReady] = useState(false);
  const [currentPostureIssues, setCurrentPostureIssues] = useState([]);
  const appState = useRef(AppState.currentState);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseAnimationRef = useRef(null);
  const isMountedRef = useRef(true);
  const badPostureCountRef = useRef(0); // Ref for immediate alert triggering
  const monitoringStartedAt = useRef(0); // Timestamp when monitoring started (grace period)
  const lastAlertTimeRef = useRef(0); // Throttle alerts to 1 per second

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

  // PIP 기능 비활성화됨 - 아래 useEffect들 제거
  // useEffect for PIP support check - DISABLED
  // useEffect for PIP mode change listener - DISABLED
  // useEffect for PIP state polling - DISABLED

  // Initialize premium and check ad-free status
  useEffect(() => {
    const initPremium = async () => {
      try {
        await initializePremium();
        const adFree = await isAdFree();
        setHideAds(adFree);
      } catch (error) {
        console.error('Premium init error:', error);
      }
    };
    initPremium();

    return () => {
      cleanupPremium();
    };
  }, []);

  // PIP mode handler - DISABLED
  const handleEnterPipMode = useCallback(() => {}, []);

  // Update home screen widget when monitoring state or posture changes
  const lastWidgetUpdateRef = useRef(0);
  useEffect(() => {
    const updateWidgetStatus = async () => {
      // Throttle updates to every 5 seconds
      const now = Date.now();
      if (now - lastWidgetUpdateRef.current < 5000) return;
      lastWidgetUpdateRef.current = now;

      try {
        // Calculate current posture score
        const currentScore = sessionTimeRef.current > 0
          ? Math.round((goodPostureTimeRef.current / sessionTimeRef.current) * 100)
          : 0;
        await updateWidget(currentScore, isMonitoring);
      } catch (error) {
        // Widget update error - ignore silently
      }
    };

    updateWidgetStatus();
  }, [isMonitoring, postureStatus]);

  // Update widget when session ends
  useEffect(() => {
    if (!isMonitoring) {
      const finalScore = totalSessionTime > 0
        ? Math.round((goodPostureTime / totalSessionTime) * 100)
        : 0;
      updateWidget(finalScore, false).catch(() => {});
    }
  }, [isMonitoring, totalSessionTime, goodPostureTime]);

  // PIP overlay status update - DISABLED

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

  // Notification permission is now requested during onboarding (handleStart)

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const keys = ['sensitivity', 'alertEnabled', 'vibrationEnabled', 'vibrationIntensity', 'vibrationPattern', 'flashEnabled', 'flashIntensity', 'flashPattern', 'torchEnabled', 'torchIntensity', 'torchPattern', 'screenOffMode', 'totalAlerts', 'totalSessionTime', 'sessionsCount', 'goodPostureTime', 'clock_showTime', 'clock_showDate', 'clock_showDay', 'clock_showStats', 'clock_fontSize', 'clock_color'];
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
        if (settings.vibrationIntensity) {
          const intensity = parseInt(settings.vibrationIntensity, 10);
          if (!isNaN(intensity) && intensity >= CONFIG.VIBRATION_INTENSITY.MIN && intensity <= CONFIG.VIBRATION_INTENSITY.MAX) {
            setVibrationIntensity(intensity);
          }
        }
        if (settings.vibrationPattern && CONFIG.VIBRATION_PATTERNS[settings.vibrationPattern]) {
          setVibrationPattern(settings.vibrationPattern);
        }
        if (settings.flashEnabled) setFlashEnabled(settings.flashEnabled === 'true');
        if (settings.flashIntensity) {
          const fIntensity = parseInt(settings.flashIntensity, 10);
          const flashMin = CONFIG.FLASH_INTENSITY?.MIN || 100;
          const flashMax = CONFIG.FLASH_INTENSITY?.MAX || 2000;
          if (!isNaN(fIntensity) && fIntensity >= flashMin && fIntensity <= flashMax) {
            setFlashIntensity(fIntensity);
          }
        }
        if (settings.flashPattern && CONFIG.FLASH_PATTERNS[settings.flashPattern]) {
          setFlashPattern(settings.flashPattern);
        }
        // Torch (카메라 플래시) 설정 로드
        if (settings.torchEnabled) setTorchEnabled(settings.torchEnabled === 'true');
        if (settings.torchIntensity) {
          const tIntensity = parseInt(settings.torchIntensity, 10);
          const torchMin = CONFIG.FLASH_INTENSITY?.MIN || 100;
          const torchMax = CONFIG.FLASH_INTENSITY?.MAX || 2000;
          if (!isNaN(tIntensity) && tIntensity >= torchMin && tIntensity <= torchMax) {
            setTorchIntensity(tIntensity);
          }
        }
        if (settings.torchPattern && CONFIG.FLASH_PATTERNS[settings.torchPattern]) {
          setTorchPattern(settings.torchPattern);
        }
        if (settings.screenOffMode) setScreenOffMode(settings.screenOffMode === 'true');

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

        // Load clock settings
        const loadedClock = {};
        if (settings.clock_showTime !== undefined) loadedClock.showTime = settings.clock_showTime !== 'false';
        if (settings.clock_showDate !== undefined) loadedClock.showDate = settings.clock_showDate !== 'false';
        if (settings.clock_showDay !== undefined) loadedClock.showDay = settings.clock_showDay !== 'false';
        if (settings.clock_showStats !== undefined) loadedClock.showStats = settings.clock_showStats !== 'false';
        if (settings.clock_fontSize && ['small', 'medium', 'large'].includes(settings.clock_fontSize)) loadedClock.fontSize = settings.clock_fontSize;
        if (settings.clock_color && ['green', 'white', 'blue', 'red'].includes(settings.clock_color)) loadedClock.color = settings.clock_color;
        if (Object.keys(loadedClock).length > 0) {
          setClockSettings(prev => ({ ...prev, ...loadedClock }));
        }
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

  const handleClockSettingChange = useCallback(async (key, value) => {
    setClockSettings(prev => ({ ...prev, [key]: value }));
    try {
      await AsyncStorage.setItem(`clock_${key}`, String(value));
    } catch (error) {
      console.error('Clock setting save error:', error);
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
          // Start background posture reminders
          scheduleBackgroundReminder(sensitivity);
        }
      } else if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        if (isMonitoring) {
          // Stop background reminders - real detection resumes
          cancelBackgroundReminder();
        }
      }
      appState.current = nextAppState;
    });
    return () => subscription.remove();
  }, [isMonitoring, saveSessionStats, sensitivity, scheduleBackgroundReminder, cancelBackgroundReminder]);

  // Execute screen flash pattern (화면 플래시만)
  const executeScreenFlash = useCallback(async (pattern, intensity) => {
    const patternFn = CONFIG.FLASH_PATTERNS[pattern] || CONFIG.FLASH_PATTERNS.double;
    const timings = typeof patternFn === 'function' ? patternFn(intensity) : patternFn;

    try {
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
    } catch (error) {
      console.error('Screen flash error:', error);
    } finally {
      setShowFlashOverlay(false);
    }
  }, []);

  // Execute torch flash pattern (카메라 플래시/손전등만)
  const executeTorchFlash = useCallback(async (pattern, intensity) => {
    const patternFn = CONFIG.FLASH_PATTERNS[pattern] || CONFIG.FLASH_PATTERNS.double;
    const timings = typeof patternFn === 'function' ? patternFn(intensity) : patternFn;

    try {
      for (let i = 0; i < timings.length; i += 2) {
        const onTime = timings[i];
        const offTime = timings[i + 1] || 0;

        if (onTime > 0) {
          try {
            await Torch.switchState(true);
            await new Promise(resolve => setTimeout(resolve, onTime));
            await Torch.switchState(false);
          } catch (torchError) {
            // Show error only once per pattern
            if (i === 0) {
              Alert.alert('Torch Error', String(torchError));
            }
          }
        }
        if (offTime > 0) {
          await new Promise(resolve => setTimeout(resolve, offTime));
        }
      }
    } catch (error) {
      Alert.alert('Torch Pattern Error', String(error));
    } finally {
      // 토치 끄기 보장
      try {
        await Torch.switchState(false);
      } catch {
        // 무시
      }
    }
  }, []);

  // Legacy function for backward compatibility (preview용)
  const executeTorchPattern = useCallback(async (pattern, intensity) => {
    await executeScreenFlash(pattern, intensity);
  }, [executeScreenFlash]);

  // Background posture reminder scheduling
  const scheduleBackgroundReminder = useCallback(async (sens) => {
    try {
      await Notifications.cancelScheduledNotificationAsync('background-posture-reminder');
    } catch {}
    // Map sensitivity to reminder interval (seconds)
    const intervalMap = { 0.1: 300, 0.2: 240, 0.3: 180, 0.4: 120, 0.5: 60 };
    const interval = intervalMap[sens] || 180;
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '자세 확인 시간!',
          body: '잠시 멈추고 자세를 확인해보세요.',
          sound: true,
        },
        trigger: { seconds: interval, repeats: true },
        identifier: 'background-posture-reminder',
      });
    } catch (error) {
      console.error('Background reminder schedule error:', error);
    }
  }, []);

  const cancelBackgroundReminder = useCallback(async () => {
    try {
      await Notifications.cancelScheduledNotificationAsync('background-posture-reminder');
    } catch {}
  }, []);

  const triggerBadPostureAlert = useCallback(async () => {
    // 앱이 백그라운드에 있으면 알림 트리거하지 않음
    if (appState.current !== 'active') {
      return;
    }

    // 1초에 한 번만 알림 트리거 (throttle)
    const now = Date.now();
    if (now - lastAlertTimeRef.current < 1000) {
      return;
    }
    lastAlertTimeRef.current = now;

    // Use functional update to avoid stale closure issue
    setTotalAlerts(prev => {
      const newTotal = prev + 1;
      saveSettings('totalAlerts', newTotal);
      return newTotal;
    });

    // Vibration alert with intensity and pattern
    if (vibrationEnabled) {
      try {
        const patternFn = CONFIG.VIBRATION_PATTERNS[vibrationPattern] || CONFIG.VIBRATION_PATTERNS.double;
        const pattern = patternFn(vibrationIntensity);
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

    // Screen flash alert with pattern (화면 플래시)
    if (flashEnabled) {
      try {
        executeScreenFlash(flashPattern, flashIntensity);
      } catch (error) {
        console.error('Screen flash error:', error);
      }
    }

    // Camera torch flash alert with pattern (카메라 플래시/손전등)
    if (torchEnabled) {
      try {
        executeTorchFlash(torchPattern, torchIntensity);
      } catch (error) {
        console.error('Torch flash error:', error);
      }
    }

  }, [vibrationEnabled, vibrationIntensity, vibrationPattern, flashEnabled, flashIntensity, flashPattern, torchEnabled, torchIntensity, torchPattern, totalAlerts, saveSettings, executeScreenFlash, executeTorchFlash]);


  // Handle messages from WebView (pose detection results)
  // Validate WebView message structure
  const isValidWebViewMessage = useCallback((data) => {
    if (!data || typeof data !== 'object') return false;
    if (typeof data.type !== 'string') return false;
    // Only allow known message types
    const validTypes = ['ready', 'posture', 'calibrated', 'error', 'log', 'orientation', 'started', 'stopped', 'privacyModeChanged'];
    return validTypes.includes(data.type);
  }, []);

  const handleWebViewMessage = useCallback((event) => {
    try {
      // Validate event structure
      if (!event?.nativeEvent?.data) {
        console.warn('Invalid WebView event structure');
        return;
      }

      const data = JSON.parse(event.nativeEvent.data);

      // Validate message structure
      if (!isValidWebViewMessage(data)) {
        console.warn('Invalid WebView message:', data?.type);
        return;
      }

      if (data.type === 'ready') {
        setWebViewReady(true);
      } else if (data.type === 'posture') {
        // Validate posture data fields
        if (typeof data.status !== 'string' || !['good', 'warning', 'bad'].includes(data.status)) {
          console.warn('Invalid posture status:', data.status);
          return;
        }
        // Convert status string to POSTURE_STATUS
        let status = POSTURE_STATUS.GOOD;
        if (data.status === 'bad') status = POSTURE_STATUS.BAD;
        else if (data.status === 'warning') status = POSTURE_STATUS.WARNING;

        setPostureStatus(status);
        setCurrentPostureIssues(Array.isArray(data.issues) ? data.issues : []);

        // Handle good/bad posture logic
        if (status === POSTURE_STATUS.GOOD) {
          setGoodPostureTime(prev => prev + 1);
          setSessionGoodPostureTime(prev => prev + 1);
        }

        // Skip posture alerts during 3-second grace period after START
        const gracePeriodActive = (Date.now() - monitoringStartedAt.current) < 3000;

        if (status === POSTURE_STATUS.BAD && !gracePeriodActive) {
          // Use ref for immediate control, state for UI
          badPostureCountRef.current += 1;
          if (badPostureCountRef.current > CONFIG.BAD_POSTURE_THRESHOLD) {
            triggerBadPostureAlert();
            badPostureCountRef.current = 0;
            setBadPostureCount(0);
          } else {
            setBadPostureCount(badPostureCountRef.current);
          }
        } else {
          badPostureCountRef.current = 0;
          setBadPostureCount(0);
        }
      } else if (data.type === 'calibrated') {
        // Pose calibrated - monitoring is now active
      } else if (data.type === 'error') {
        console.error('WebView error:', data.message);
      }
    } catch (e) {
      console.error('WebView message parse error:', e);
    }
  }, [triggerBadPostureAlert, isValidWebViewMessage]);

  // Send message to WebView
  const sendToWebView = useCallback((message) => {
    if (webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify(message));
    }
  }, []);

  // pulseAnim removed - was causing camera zoom in/out loop

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

        // Disable keep-awake when stopping
        try {
          deactivateKeepAwake();
        } catch {
          // Ignore keep-awake error
        }

        // PiP stays enabled always

        // Cancel background reminders
        await cancelBackgroundReminder();

        // Capture session data before resetting
        const sessionDuration = formatTime(sessionTimeRef.current);
        const sessionAlerts = totalAlerts;

        // Save session stats
        await saveSessionStats();
        const newSessionsCount = sessionsCount + 1;
        setSessionsCount(newSessionsCount);
        await saveSettings('sessionsCount', newSessionsCount);

        // Save result for modal and show toast
        setSessionResult({ duration: sessionDuration, alerts: sessionAlerts });
        setShowToast(true);
        Animated.timing(toastAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = setTimeout(() => {
          Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => setShowToast(false));
        }, 5000);
      } else {
        // Close result modal if open
        setShowSessionResult(false);
        setSessionTime(0);
        setSessionGoodPostureTime(0); // Reset session-specific good posture time
        setWarningCount(0); // Reset warning count for new session
        setErrorCount(0); // Reset error count for new session
        setBadPostureCount(0);
        badPostureCountRef.current = 0; // Reset ref too
        monitoringStartedAt.current = Date.now(); // 3-second grace period
        setIsMonitoring(true);
        setPostureStatus(POSTURE_STATUS.GOOD);

        // PiP is always enabled at app startup

        // Enable keep-awake to prevent screen from turning off during monitoring
        try {
          await activateKeepAwakeAsync();
        } catch {
          // Ignore keep-awake error
        }

      }
    } finally {
      // Delay to prevent rapid clicking
      setTimeout(() => setIsProcessing(false), CONFIG.BUTTON_DEBOUNCE);
    }
  }, [isMonitoring, isProcessing, saveSessionStats, sessionsCount, saveSettings, formatTime, totalAlerts, t, lang]);

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

  // Combined: show welcome screen if onboarding needed OR permission not granted
  if (showOnboarding || !permission || !permission.granted) {
    const isDenied = permission && permission.status === 'denied' && !permission.canAskAgain;
    const handleStart = async () => {
      // Request all permissions at once, then complete onboarding
      if (!permission || !permission.granted) {
        await requestPermission();
      }
      try { await Notifications.requestPermissionsAsync(); } catch (e) { /* ignore */ }
      await completeOnboarding();
    };
    return <_WelcomeScreen onStart={handleStart} needsPermission={!permission || !permission.granted} isDenied={isDenied} t={t} />;
  }

  return (
    <SafeAreaView style={[styles.container, pipActive && { padding: 0, margin: 0 }]}>
      <StatusBar style="light" hidden={pipActive} />

      {/* Stats Bar - always visible */}
      <View style={[styles.statsBar, isLandscape && styles.statsBarLandscape]} accessibilityRole="summary">
        <View style={styles.statsBarItem}>
          <Text style={styles.statsBarIcon}>⚠️</Text>
          <Text style={styles.statsBarValue}>{warningCount || 0}</Text>
        </View>
        <View style={styles.statsBarItem}>
          <Text style={styles.statsBarIcon}>🔴</Text>
          <Text style={styles.statsBarValue}>{errorCount || 0}</Text>
        </View>
        <View style={styles.statsBarDivider} />
        <View style={styles.statsBarItem}>
          <Text style={styles.statsBarIcon}>🕐</Text>
          <Text style={styles.statsBarValue}>{formatTime(sessionTime)}</Text>
        </View>
        <View style={styles.statsBarDivider} />
        <View style={styles.statsBarItem}>
          <Text style={styles.statsBarIcon}>🏆</Text>
          <Text style={styles.statsBarValue}>{goodPostureRate}%</Text>
        </View>
        <View style={styles.statsBarDivider} />
        <View style={styles.statsBarItem}>
          <Text style={styles.statsBarIcon}>{isMonitoring ? getStatusEmoji() : ''}</Text>
          <Text style={[styles.statsBarValue, isMonitoring && { color: getStatusColor() }]}>
            {isMonitoring ? getStatusText() : 'Ready'}
          </Text>
        </View>
      </View>

      {/* Main Content Wrapper - row in landscape, column in portrait */}
      <View style={[{ flex: 1 }, isLandscape && styles.landscapeWrapper]}>

      {/* Camera View with AI Pose Detection */}
      <View style={[styles.cameraContainer, isLandscape ? { flex: 0.6 } : { flex: 1 }]}>
        {/* WebView-based pose detection */}
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
        {!webViewReady && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#19e66b" />
            <Text style={styles.loadingText}>{t.loading}</Text>
          </View>
        )}
      </View>

      {/* Control Panel - Side panel (ScrollView) in landscape, Bottom panel in portrait */}
      {isLandscape ? (
        <ScrollView nativeID="pip-hide" testID="pip-hide" style={styles.sidePanel} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
        {/* Toggle Buttons Row */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleButton, vibrationEnabled && styles.toggleButtonActive]}
            onPress={() => { setVibrationEnabled(!vibrationEnabled); saveSettings('vibrationEnabled', !vibrationEnabled); }}
            activeOpacity={0.7}
          >
            <Text style={styles.toggleIcon}>📳</Text>
            <Text style={[styles.toggleLabel, vibrationEnabled && styles.toggleLabelActive]}>{lang === 'ko' ? '진동' : 'Vib'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, flashEnabled && styles.toggleButtonActive]}
            onPress={() => { setFlashEnabled(!flashEnabled); saveSettings('flashEnabled', !flashEnabled); }}
            activeOpacity={0.7}
          >
            <Text style={styles.toggleIcon}>💡</Text>
            <Text style={[styles.toggleLabel, flashEnabled && styles.toggleLabelActive]}>{lang === 'ko' ? '화면' : 'Screen'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, torchEnabled && styles.toggleButtonActive, { borderColor: torchEnabled ? '#FF6B35' : 'rgba(255,255,255,0.1)' }]}
            onPress={() => { setTorchEnabled(!torchEnabled); saveSettings('torchEnabled', !torchEnabled); }}
            activeOpacity={0.7}
          >
            <Text style={styles.toggleIcon}>🔦</Text>
            <Text style={[styles.toggleLabel, torchEnabled && styles.toggleLabelActive]}>{lang === 'ko' ? '손전등' : 'Torch'}</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.toggleRow, { marginTop: 4 }]}>
          <TouchableOpacity
            style={[styles.toggleButton, screenOffMode && styles.screenOffButtonActive]}
            onPress={() => { setScreenOffMode(!screenOffMode); saveSettings('screenOffMode', !screenOffMode); }}
            activeOpacity={0.7}
          >
            <Text style={styles.toggleIcon}>🕐</Text>
            <Text style={[styles.toggleLabel, screenOffMode && styles.toggleLabelActive]}>{t.deskClock}</Text>
          </TouchableOpacity>
        </View>

        {/* Vibration Cycle Slider */}
        <View style={[styles.sliderGroup, !vibrationEnabled && styles.sliderGroupDisabled]}>
          <Text style={[styles.sliderLabel, !vibrationEnabled && styles.sliderLabelDisabled]}>📳 {lang === 'ko' ? '진동 주기' : 'Vibration'}</Text>
          <Slider style={styles.slider} minimumValue={CONFIG.VIBRATION_INTENSITY.MIN} maximumValue={CONFIG.VIBRATION_INTENSITY.MAX} step={CONFIG.VIBRATION_INTENSITY.STEP} value={vibrationIntensity} onValueChange={(value) => setVibrationIntensity(value)} onSlidingComplete={(value) => saveSettings('vibrationIntensity', value)} minimumTrackTintColor={vibrationEnabled ? COLORS.primary : 'rgba(255,255,255,0.1)'} maximumTrackTintColor="rgba(255,255,255,0.2)" thumbTintColor={vibrationEnabled ? COLORS.primary : 'rgba(255,255,255,0.3)'} disabled={!vibrationEnabled} />
          <Text style={[styles.sliderValue, !vibrationEnabled && styles.sliderValueDisabled]}>{(vibrationIntensity / 1000).toFixed(1)}s</Text>
        </View>

        {/* Vibration Pattern Selector */}
        {vibrationEnabled && (
          <View style={styles.patternQuickSelect}>
            <Text style={styles.patternQuickLabel}>🎵 {lang === 'ko' ? '패턴' : 'Pattern'}</Text>
            <View style={styles.patternGrid}>
              {[
                { key: 'single', label: lang === 'ko' ? '1회' : '1x' },
                { key: 'double', label: lang === 'ko' ? '2회' : '2x' },
                { key: 'triple', label: lang === 'ko' ? '3회' : '3x' },
                { key: 'heartbeat', label: lang === 'ko' ? '심장' : 'Heart' },
                { key: 'continuous', label: lang === 'ko' ? '연속' : 'Cont' },
                { key: 'escalate', label: lang === 'ko' ? '점강' : 'Esc' },
                { key: 'sos', label: 'SOS' },
                { key: 'pulse', label: lang === 'ko' ? '펄스' : 'Pulse' },
              ].map((item) => (
                <TouchableOpacity key={item.key} style={[styles.patternPill, vibrationPattern === item.key && styles.patternPillActive]} onPress={() => { setVibrationPattern(item.key); saveSettings('vibrationPattern', item.key); try { Vibration.vibrate(CONFIG.VIBRATION_PATTERNS[item.key](vibrationIntensity)); } catch (e) {} }} activeOpacity={0.7}>
                  <Text style={[styles.patternPillText, vibrationPattern === item.key && styles.patternPillTextActive]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Flash Cycle Slider - landscape */}
        {flashEnabled && (
          <View style={styles.sliderGroup}>
            <Text style={styles.sliderLabel}>💡 {lang === 'ko' ? '플래시 주기' : 'Flash'}</Text>
            <Slider style={styles.slider} minimumValue={CONFIG.FLASH_INTENSITY?.MIN || 100} maximumValue={CONFIG.FLASH_INTENSITY?.MAX || 2000} step={CONFIG.FLASH_INTENSITY?.STEP || 100} value={flashIntensity} onValueChange={(value) => setFlashIntensity(value)} onSlidingComplete={(value) => saveSettings('flashIntensity', value)} minimumTrackTintColor={COLORS.warning} maximumTrackTintColor="rgba(255,255,255,0.2)" thumbTintColor={COLORS.warning} />
            <Text style={[styles.sliderValue, { color: COLORS.warning }]}>{(flashIntensity / 1000).toFixed(1)}s</Text>
          </View>
        )}

        {/* Flash Pattern Selector - landscape */}
        {flashEnabled && (
          <View style={styles.patternQuickSelect}>
            <Text style={styles.patternQuickLabel}>💡 {lang === 'ko' ? '플래시' : 'Flash'}</Text>
            <View style={styles.patternGrid}>
              {[
                { key: 'single', label: lang === 'ko' ? '1회' : '1x' },
                { key: 'double', label: lang === 'ko' ? '2회' : '2x' },
                { key: 'triple', label: lang === 'ko' ? '3회' : '3x' },
                { key: 'heartbeat', label: lang === 'ko' ? '심장' : 'Heart' },
                { key: 'continuous', label: lang === 'ko' ? '연속' : 'Cont' },
                { key: 'escalate', label: lang === 'ko' ? '점강' : 'Esc' },
                { key: 'sos', label: 'SOS' },
                { key: 'pulse', label: lang === 'ko' ? '펄스' : 'Pulse' },
              ].map((item) => (
                <TouchableOpacity key={item.key} style={[styles.patternPill, flashPattern === item.key && styles.patternPillActive, { borderColor: flashPattern === item.key ? COLORS.warning : 'rgba(255,255,255,0.1)' }]} onPress={() => { setFlashPattern(item.key); saveSettings('flashPattern', item.key); executeScreenFlash(item.key, flashIntensity); }} activeOpacity={0.7}>
                  <Text style={[styles.patternPillText, flashPattern === item.key && styles.patternPillTextActive]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Torch Cycle Slider - landscape */}
        {torchEnabled && (
          <View style={styles.sliderGroup}>
            <Text style={styles.sliderLabel}>🔦 {lang === 'ko' ? '손전등' : 'Torch'}</Text>
            <Slider style={styles.slider} minimumValue={CONFIG.FLASH_INTENSITY?.MIN || 100} maximumValue={CONFIG.FLASH_INTENSITY?.MAX || 2000} step={CONFIG.FLASH_INTENSITY?.STEP || 100} value={torchIntensity} onValueChange={(value) => setTorchIntensity(value)} onSlidingComplete={(value) => saveSettings('torchIntensity', value)} minimumTrackTintColor="#FF6B35" maximumTrackTintColor="rgba(255,255,255,0.2)" thumbTintColor="#FF6B35" />
            <Text style={[styles.sliderValue, { color: '#FF6B35' }]}>{(torchIntensity / 1000).toFixed(1)}s</Text>
          </View>
        )}

        {/* Torch Pattern Selector - landscape */}
        {torchEnabled && (
          <View style={styles.patternQuickSelect}>
            <Text style={styles.patternQuickLabel}>🔦 {lang === 'ko' ? '손전등' : 'Torch'}</Text>
            <View style={styles.patternGrid}>
              {[
                { key: 'single', label: lang === 'ko' ? '1회' : '1x' },
                { key: 'double', label: lang === 'ko' ? '2회' : '2x' },
                { key: 'triple', label: lang === 'ko' ? '3회' : '3x' },
                { key: 'heartbeat', label: lang === 'ko' ? '심장' : 'Heart' },
                { key: 'continuous', label: lang === 'ko' ? '연속' : 'Cont' },
                { key: 'escalate', label: lang === 'ko' ? '점강' : 'Esc' },
                { key: 'sos', label: 'SOS' },
                { key: 'pulse', label: lang === 'ko' ? '펄스' : 'Pulse' },
              ].map((item) => (
                <TouchableOpacity key={item.key} style={[styles.patternPill, torchPattern === item.key && styles.patternPillActive, { borderColor: torchPattern === item.key ? '#FF6B35' : 'rgba(255,255,255,0.1)' }]} onPress={() => { setTorchPattern(item.key); saveSettings('torchPattern', item.key); executeTorchFlash(item.key, torchIntensity); }} activeOpacity={0.7}>
                  <Text style={[styles.patternPillText, torchPattern === item.key && styles.patternPillTextActive]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Sensitivity Slider */}
        <View style={styles.sliderGroup}>
          <Text style={styles.sliderLabel}>🎚️ {lang === 'ko' ? '민감도' : 'Sensitivity'}</Text>
          <Slider style={styles.slider} minimumValue={0.1} maximumValue={0.5} step={0.1} value={sensitivity} onValueChange={(value) => setSensitivity(Math.round(value * 10) / 10)} onSlidingComplete={(value) => saveSettings('sensitivity', Math.round(value * 10) / 10)} minimumTrackTintColor={COLORS.primary} maximumTrackTintColor="rgba(255,255,255,0.2)" thumbTintColor={COLORS.primary} />
          <Text style={styles.sliderValue}>{Math.round(sensitivity * 100)}%</Text>
        </View>

        {/* Start/Stop Button */}
        <TouchableOpacity style={[styles.stopButton, !isMonitoring && styles.startButton, isProcessing && { opacity: 0.6 }]} onPress={toggleMonitoring} activeOpacity={0.8} disabled={isProcessing}>
          <Text style={styles.stopButtonIcon}>{isMonitoring ? '⏹' : '▶'}</Text>
          <Text style={styles.stopButtonText}>{isMonitoring ? 'STOP' : 'START'}</Text>
        </TouchableOpacity>
        </ScrollView>
      ) : (
        <View nativeID="pip-hide" testID="pip-hide" style={[styles.bottomPanel, panelCollapsed && styles.bottomPanelCollapsed]}>
        {/* Panel Collapse Handle */}
        <TouchableOpacity
          style={styles.panelHandle}
          onPress={() => setPanelCollapsed(!panelCollapsed)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={panelCollapsed ? '패널 펼치기' : '패널 접기'}
        >
          <View style={styles.panelHandleBar} />
          <Text style={styles.panelHandleArrow}>{panelCollapsed ? '▲' : '▼'}</Text>
        </TouchableOpacity>

        {!panelCollapsed && (<>
        {/* Toggle Buttons Row - Vibration, Flash, Clock */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleButton, vibrationEnabled && styles.toggleButtonActive]}
            onPress={() => {
              const enabled = !vibrationEnabled;
              setVibrationEnabled(enabled);
              saveSettings('vibrationEnabled', enabled);
            }}
            activeOpacity={0.7}
            accessibilityRole="switch"
            accessibilityState={{ checked: vibrationEnabled }}
          >
            <Text style={styles.toggleIcon}>📳</Text>
            <Text style={[styles.toggleLabel, vibrationEnabled && styles.toggleLabelActive]}>{lang === 'ko' ? '진동' : 'Vibration'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.toggleButton, flashEnabled && styles.toggleButtonActive]}
            onPress={() => {
              const enabled = !flashEnabled;
              setFlashEnabled(enabled);
              saveSettings('flashEnabled', enabled);
            }}
            activeOpacity={0.7}
            accessibilityRole="switch"
            accessibilityState={{ checked: flashEnabled }}
          >
            <Text style={styles.toggleIcon}>💡</Text>
            <Text style={[styles.toggleLabel, flashEnabled && styles.toggleLabelActive]}>{lang === 'ko' ? '화면' : 'Screen'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.toggleButton, torchEnabled && styles.toggleButtonActive, { borderColor: torchEnabled ? '#FF6B35' : 'rgba(255,255,255,0.1)' }]}
            onPress={async () => {
              const enabled = !torchEnabled;
              setTorchEnabled(enabled);
              saveSettings('torchEnabled', enabled);
              // Test torch when enabling
              if (enabled) {
                try {
                  await Torch.switchState(true);
                  await new Promise(r => setTimeout(r, 500));
                  await Torch.switchState(false);
                } catch (e) {
                  Alert.alert('Torch Test Failed', String(e));
                }
              }
            }}
            activeOpacity={0.7}
            accessibilityRole="switch"
            accessibilityState={{ checked: torchEnabled }}
          >
            <Text style={styles.toggleIcon}>🔦</Text>
            <Text style={[styles.toggleLabel, torchEnabled && styles.toggleLabelActive]}>{lang === 'ko' ? '손전등' : 'Torch'}</Text>
          </TouchableOpacity>
        </View>

        {/* Second Row - Clock */}
        <View style={[styles.toggleRow, { marginTop: 8 }]}>
          <TouchableOpacity
            style={[styles.toggleButton, screenOffMode && styles.screenOffButtonActive]}
            onPress={() => {
              const enabled = !screenOffMode;
              setScreenOffMode(enabled);
              saveSettings('screenOffMode', enabled);
            }}
            activeOpacity={0.7}
            accessibilityRole="switch"
            accessibilityState={{ checked: screenOffMode }}
          >
            <Text style={styles.toggleIcon}>🕐</Text>
            <Text style={[styles.toggleLabel, screenOffMode && styles.toggleLabelActive]}>{t.deskClock}</Text>
          </TouchableOpacity>
        </View>

        {/* Vibration Cycle Slider */}
        <View style={[styles.sliderGroup, !vibrationEnabled && styles.sliderGroupDisabled]}>
          <Text style={[styles.sliderLabel, !vibrationEnabled && styles.sliderLabelDisabled]}>📳 {lang === 'ko' ? '진동 주기' : 'Vibration'}</Text>
          <Slider
            style={styles.slider}
            minimumValue={CONFIG.VIBRATION_INTENSITY.MIN}
            maximumValue={CONFIG.VIBRATION_INTENSITY.MAX}
            step={CONFIG.VIBRATION_INTENSITY.STEP}
            value={vibrationIntensity}
            onValueChange={(value) => setVibrationIntensity(value)}
            onSlidingComplete={(value) => saveSettings('vibrationIntensity', value)}
            minimumTrackTintColor={vibrationEnabled ? COLORS.primary : 'rgba(255,255,255,0.1)'}
            maximumTrackTintColor="rgba(255,255,255,0.2)"
            thumbTintColor={vibrationEnabled ? COLORS.primary : 'rgba(255,255,255,0.3)'}
            disabled={!vibrationEnabled}
            accessibilityRole="adjustable"
          />
          <Text style={[styles.sliderValue, !vibrationEnabled && styles.sliderValueDisabled]}>{(vibrationIntensity / 1000).toFixed(1)}s</Text>
        </View>

        {/* Vibration Pattern Selector - only show when vibration is enabled */}
        {vibrationEnabled && (
          <View style={styles.patternQuickSelect}>
            <Text style={styles.patternQuickLabel}>🎵 {lang === 'ko' ? '진동 패턴' : 'Pattern'}</Text>
            <View style={styles.patternGrid}>
              {[
                { key: 'single', label: lang === 'ko' ? '1회' : '1x' },
                { key: 'double', label: lang === 'ko' ? '2회' : '2x' },
                { key: 'triple', label: lang === 'ko' ? '3회' : '3x' },
                { key: 'heartbeat', label: lang === 'ko' ? '심장박동' : 'Heartbeat' },
                { key: 'continuous', label: lang === 'ko' ? '연속' : 'Continuous' },
                { key: 'escalate', label: lang === 'ko' ? '점점강하게' : 'Escalate' },
                { key: 'sos', label: 'SOS' },
                { key: 'pulse', label: lang === 'ko' ? '펄스' : 'Pulse' },
              ].map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={[
                    styles.patternPill,
                    vibrationPattern === item.key && styles.patternPillActive,
                  ]}
                  onPress={() => {
                    setVibrationPattern(item.key);
                    saveSettings('vibrationPattern', item.key);
                    try {
                      const patternFn = CONFIG.VIBRATION_PATTERNS[item.key];
                      Vibration.vibrate(patternFn(vibrationIntensity));
                    } catch (e) { /* ignore */ }
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  accessibilityState={{ selected: vibrationPattern === item.key }}
                >
                  <Text style={[
                    styles.patternPillText,
                    vibrationPattern === item.key && styles.patternPillTextActive,
                  ]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Flash Cycle Slider - only show when flash is enabled */}
        {flashEnabled && (
          <View style={styles.sliderGroup}>
            <Text style={styles.sliderLabel}>💡 {lang === 'ko' ? '플래시 주기' : 'Flash'}</Text>
            <Slider
              style={styles.slider}
              minimumValue={CONFIG.FLASH_INTENSITY?.MIN || 100}
              maximumValue={CONFIG.FLASH_INTENSITY?.MAX || 2000}
              step={CONFIG.FLASH_INTENSITY?.STEP || 100}
              value={flashIntensity}
              onValueChange={(value) => setFlashIntensity(value)}
              onSlidingComplete={(value) => saveSettings('flashIntensity', value)}
              minimumTrackTintColor={COLORS.warning}
              maximumTrackTintColor="rgba(255,255,255,0.2)"
              thumbTintColor={COLORS.warning}
              accessibilityRole="adjustable"
            />
            <Text style={[styles.sliderValue, { color: COLORS.warning }]}>{(flashIntensity / 1000).toFixed(1)}s</Text>
          </View>
        )}

        {/* Flash Pattern Selector - only show when flash is enabled */}
        {flashEnabled && (
          <View style={styles.patternQuickSelect}>
            <Text style={styles.patternQuickLabel}>💡 {lang === 'ko' ? '플래시 패턴' : 'Flash Pattern'}</Text>
            <View style={styles.patternGrid}>
              {[
                { key: 'single', label: lang === 'ko' ? '1회' : '1x' },
                { key: 'double', label: lang === 'ko' ? '2회' : '2x' },
                { key: 'triple', label: lang === 'ko' ? '3회' : '3x' },
                { key: 'heartbeat', label: lang === 'ko' ? '심장박동' : 'Heartbeat' },
                { key: 'continuous', label: lang === 'ko' ? '연속' : 'Continuous' },
                { key: 'escalate', label: lang === 'ko' ? '점점강하게' : 'Escalate' },
                { key: 'sos', label: 'SOS' },
                { key: 'pulse', label: lang === 'ko' ? '펄스' : 'Pulse' },
              ].map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={[
                    styles.patternPill,
                    flashPattern === item.key && styles.patternPillActive,
                    { borderColor: flashPattern === item.key ? COLORS.warning : 'rgba(255,255,255,0.1)' },
                  ]}
                  onPress={() => {
                    setFlashPattern(item.key);
                    saveSettings('flashPattern', item.key);
                    // Preview flash pattern
                    executeTorchPattern(item.key, flashIntensity);
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  accessibilityState={{ selected: flashPattern === item.key }}
                >
                  <Text style={[
                    styles.patternPillText,
                    flashPattern === item.key && styles.patternPillTextActive,
                  ]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Torch (Camera Flash) Cycle Slider - only show when torch is enabled */}
        {torchEnabled && (
          <View style={styles.sliderGroup}>
            <Text style={styles.sliderLabel}>🔦 {lang === 'ko' ? '손전등 주기' : 'Torch'}</Text>
            <Slider
              style={styles.slider}
              minimumValue={CONFIG.FLASH_INTENSITY?.MIN || 100}
              maximumValue={CONFIG.FLASH_INTENSITY?.MAX || 2000}
              step={CONFIG.FLASH_INTENSITY?.STEP || 100}
              value={torchIntensity}
              onValueChange={(value) => setTorchIntensity(value)}
              onSlidingComplete={(value) => saveSettings('torchIntensity', value)}
              minimumTrackTintColor="#FF6B35"
              maximumTrackTintColor="rgba(255,255,255,0.2)"
              thumbTintColor="#FF6B35"
              accessibilityRole="adjustable"
            />
            <Text style={[styles.sliderValue, { color: '#FF6B35' }]}>{(torchIntensity / 1000).toFixed(1)}s</Text>
          </View>
        )}

        {/* Torch Pattern Selector - only show when torch is enabled */}
        {torchEnabled && (
          <View style={styles.patternQuickSelect}>
            <Text style={styles.patternQuickLabel}>🔦 {lang === 'ko' ? '손전등 패턴' : 'Torch Pattern'}</Text>
            <View style={styles.patternGrid}>
              {[
                { key: 'single', label: lang === 'ko' ? '1회' : '1x' },
                { key: 'double', label: lang === 'ko' ? '2회' : '2x' },
                { key: 'triple', label: lang === 'ko' ? '3회' : '3x' },
                { key: 'heartbeat', label: lang === 'ko' ? '심장박동' : 'Heartbeat' },
                { key: 'continuous', label: lang === 'ko' ? '연속' : 'Continuous' },
                { key: 'escalate', label: lang === 'ko' ? '점점강하게' : 'Escalate' },
                { key: 'sos', label: 'SOS' },
                { key: 'pulse', label: lang === 'ko' ? '펄스' : 'Pulse' },
              ].map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={[
                    styles.patternPill,
                    torchPattern === item.key && styles.patternPillActive,
                    { borderColor: torchPattern === item.key ? '#FF6B35' : 'rgba(255,255,255,0.1)' },
                  ]}
                  onPress={() => {
                    setTorchPattern(item.key);
                    saveSettings('torchPattern', item.key);
                    // Preview torch pattern
                    executeTorchFlash(item.key, torchIntensity);
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  accessibilityState={{ selected: torchPattern === item.key }}
                >
                  <Text style={[
                    styles.patternPillText,
                    torchPattern === item.key && styles.patternPillTextActive,
                  ]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Posture Detection Sensitivity Slider */}
        <View style={styles.sliderGroup}>
          <Text style={styles.sliderLabel}>🎚️ {lang === 'ko' ? '자세감지 민감도' : 'Sensitivity'}</Text>
          <Slider
            style={styles.slider}
            minimumValue={0.1}
            maximumValue={0.5}
            step={0.1}
            value={sensitivity}
            onValueChange={(value) => setSensitivity(Math.round(value * 10) / 10)}
            onSlidingComplete={(value) => saveSettings('sensitivity', Math.round(value * 10) / 10)}
            minimumTrackTintColor={COLORS.primary}
            maximumTrackTintColor="rgba(255,255,255,0.2)"
            thumbTintColor={COLORS.primary}
            accessibilityRole="adjustable"
          />
          <Text style={styles.sliderValue}>{Math.round(sensitivity * 100)}%</Text>
        </View>

        </>)}

        {/* Stop/Start Session Button - always visible */}
        <TouchableOpacity
          style={[
            styles.stopButton,
            !isMonitoring && styles.startButton,
            isProcessing && { opacity: 0.6 }
          ]}
          onPress={toggleMonitoring}
          activeOpacity={0.8}
          disabled={isProcessing}
          accessibilityRole="button"
          accessibilityLabel={isMonitoring ? t.stopMonitoring : t.startMonitoring}
          accessibilityState={{ disabled: isProcessing }}
        >
          <Text style={styles.stopButtonIcon}>{isMonitoring ? '⏹' : '▶'}</Text>
          <Text style={styles.stopButtonText}>
            {isMonitoring ? 'STOP SESSION' : 'START SESSION'}
          </Text>
        </TouchableOpacity>
        </View>
      )}

      </View>{/* End Main Content Wrapper */}

      {/* Ad Banner */}
      {/* Ad banner removed for cleaner UI */}

      {/* Modals - hidden in PiP mode */}
      {!pipActive && (
      <>
      <SessionResultModal
        visible={showSessionResult}
        onClose={() => setShowSessionResult(false)}
        result={sessionResult}
        t={t}
      />
      <PremiumModal
        visible={showPremium}
        onClose={() => setShowPremium(false)}
        lang={lang}
      />
      </>
      )}

      {/* Session End Toast - hidden in PiP */}
      {!pipActive && showToast && (
        <Animated.View style={[styles.toastContainer, { opacity: toastAnim }]} pointerEvents="box-none">
          <Text style={styles.toastText}>세션이 종료되었습니다</Text>
          <TouchableOpacity
            onPress={() => {
              setShowSessionResult(true);
              setShowToast(false);
              toastAnim.setValue(0);
              if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.toastAction}>결과보기</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Desk Clock Overlay - hidden in PiP */}
      {!pipActive && screenOffMode && (
        <DeskClock
          onDismiss={() => { setScreenOffMode(false); saveSettings('screenOffMode', false); }}
          isMonitoring={isMonitoring}
          sessionTime={sessionTime}
          goodPostureRate={goodPostureRate}
          clockSettings={clockSettings}
          onSettingsChange={handleClockSettingChange}
          formatTime={formatTime}
          lang={lang}
          t={t}
        />
      )}

      {/* Screen Flash Overlay - hidden in PiP */}
      {!pipActive && showFlashOverlay && (
        <View style={styles.flashOverlay} pointerEvents="none" />
      )}
    </SafeAreaView>
  );
}

// Legacy styles - now imported from ./components/styles.js
const _styles = StyleSheet.create({
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, paddingTop: Platform.OS === 'android' ? 48 : 12, position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  headerCenter: { flex: 1, alignItems: 'center', marginHorizontal: 8 },
  headerStatusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(26, 44, 34, 0.9)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  headerStatusEmoji: { fontSize: 16, marginRight: 6 },
  headerStatusText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  headerTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, letterSpacing: 3, textTransform: 'uppercase' },
  headerButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(26, 44, 34, 0.9)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  headerButtonIcon: { fontSize: 18 },
  // Stats Bar - below header
  statsBar: { position: 'absolute', top: Platform.OS === 'android' ? 100 : 70, left: 16, right: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(26, 44, 34, 0.9)', borderRadius: 25, paddingVertical: 10, paddingHorizontal: 20, zIndex: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  statsBarItem: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 8 },
  statsBarIcon: { fontSize: 14, marginRight: 4 },
  statsBarValue: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  statsBarDivider: { width: 1, height: 20, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 8 },
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  statusOverlay: { flex: 1, borderWidth: 2, borderRadius: 20, justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(17, 33, 23, 0.7)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  statusEmoji: { fontSize: 18, marginRight: 8 },
  statusText: { fontSize: 12, fontWeight: 'bold', color: COLORS.text },
  sessionInfo: { backgroundColor: 'rgba(17, 33, 23, 0.7)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, alignItems: 'center', flexDirection: 'row', gap: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  sessionTimeLabel: { fontSize: 14, color: COLORS.textMuted },
  sessionTime: { fontSize: 12, color: COLORS.text, fontWeight: 'bold', fontFamily: 'monospace' },
  guideOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.overlayStrong },
  guideEmoji: { fontSize: 56, marginBottom: 16 },
  guideText: { fontSize: 18, color: COLORS.text, textAlign: 'center', lineHeight: 26, fontWeight: '500' },
  guideHint: { fontSize: 13, color: COLORS.textMuted, marginTop: 12, textAlign: 'center' },
  bottomPanel: { backgroundColor: 'rgba(26, 44, 34, 0.95)', paddingHorizontal: 20, paddingVertical: 16, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderBottomWidth: 0 },
  // Toggle button row styles
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, gap: 12 },
  toggleButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 12, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)' },
  toggleButtonActive: { backgroundColor: 'rgba(25, 230, 107, 0.15)', borderColor: COLORS.primary },
  toggleIcon: { fontSize: 20, marginRight: 8 },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: COLORS.textSecondary, marginRight: 8 },
  toggleLabelActive: { color: COLORS.text },
  toggleIndicator: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  toggleIndicatorActive: { backgroundColor: COLORS.primary },
  toggleIndicatorText: { fontSize: 12, fontWeight: '700', color: COLORS.text },
  // Pattern quick select styles
  patternQuickSelect: { marginBottom: 12, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  patternQuickLabel: { fontSize: 15, color: COLORS.text, fontWeight: '600', marginBottom: 8, paddingHorizontal: 4 },
  patternScrollRow: { flexDirection: 'row' },
  patternPill: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', marginRight: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  patternPillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  patternPillText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '600' },
  patternPillTextActive: { color: COLORS.background },
  // Slider styles - larger and more touch-friendly
  sliderGroup: { marginBottom: 12, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  sliderGroupDisabled: { opacity: 0.4 },
  sliderLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4, marginBottom: 2 },
  sliderLabel: { fontSize: 15, color: COLORS.text, fontWeight: '600' },
  sliderLabelDisabled: { color: COLORS.textMuted },
  sliderValue: { fontSize: 15, color: COLORS.primary, fontWeight: '700' },
  sliderValueDisabled: { color: COLORS.textMuted },
  slider: { flex: 1, height: 44 },
  // Stop/Start button
  stopButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(26, 44, 34, 0.8)', paddingVertical: 14, borderRadius: 12, marginTop: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  startButton: { backgroundColor: COLORS.primary },
  stopButtonIcon: { fontSize: 16, marginRight: 8 },
  stopButtonText: { fontSize: 14, fontWeight: '700', color: COLORS.text, letterSpacing: 1 },
  // Legacy styles (kept for compatibility)
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 12, backgroundColor: 'rgba(17, 33, 23, 0.5)', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  statItem: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  statValue: { fontSize: 12, fontWeight: 'bold', color: COLORS.text, fontFamily: 'monospace' },
  statLabel: { fontSize: 14, color: COLORS.textMuted },
  mainButton: { alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, marginBottom: 8, flexDirection: 'row', gap: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  mainButtonText: { color: COLORS.text, fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 },
  sensitivityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  sensitivityLabel: { fontSize: 14, color: COLORS.textMuted, marginRight: 4 },
  sensButton: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8, backgroundColor: 'rgba(17, 33, 23, 0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  sensButtonActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  sensButtonText: { fontSize: 11, color: COLORS.textSecondary },
  sensButtonTextActive: { color: COLORS.background, fontWeight: 'bold' },
  adContainer: { alignItems: 'center', backgroundColor: COLORS.background, paddingBottom: Platform.OS === 'ios' ? 0 : 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: 'rgba(17, 33, 23, 0.95)', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderBottomWidth: 0 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text },
  modalCloseButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  modalCloseText: { fontSize: 16, color: COLORS.textSecondary },
  modalBody: { padding: 20 },
  settingsSection: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.text, marginBottom: 4 },
  sectionDescription: { fontSize: 13, color: COLORS.textMuted, marginBottom: 12 },
  sensitivityContainer: { flexDirection: 'row', gap: 8 },
  sensitivityOption: { flex: 1, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  sensitivityOptionActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  sensitivityLabel: { fontSize: 15, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 2 },
  sensitivityLabelActive: { color: COLORS.text },
  sensitivityDesc: { fontSize: 11, color: COLORS.textMuted },
  sensitivityDescActive: { color: COLORS.text, opacity: 0.8 },
  settingsList: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  settingItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  settingItemLast: { borderBottomWidth: 0 },
  settingTextContainer: { flex: 1, marginRight: 12 },
  settingLabel: { fontSize: 15, color: COLORS.text, fontWeight: '500' },
  settingDescription: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  infoButton: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  infoButtonText: { fontSize: 15, color: COLORS.text },
  infoButtonArrow: { fontSize: 20, color: COLORS.textMuted },
  appInfo: { marginTop: 16, alignItems: 'center' },
  appInfoText: { fontSize: 12, color: COLORS.textMuted },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard: { width: '47%', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 16, borderLeftWidth: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  statIcon: { fontSize: 24, marginBottom: 8 },
  statValue: { fontSize: 24, fontWeight: 'bold', color: COLORS.text, marginBottom: 4 },
  statLabel: { fontSize: 12, color: COLORS.textMuted },
  statsNote: { marginTop: 20, padding: 16, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  statsNoteText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },
  webViewOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12, alignItems: 'center' },
  issuesContainer: { backgroundColor: COLORS.overlay, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, marginTop: 8 },
  issuesText: { fontSize: 12, color: COLORS.text, fontWeight: '500' },
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: COLORS.overlayStrong, justifyContent: 'center', alignItems: 'center' },
  resultModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  resultModalContent: { backgroundColor: 'rgba(17, 33, 23, 0.95)', borderRadius: 24, padding: 32, alignItems: 'center', width: '100%', maxWidth: 320, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
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
  patternSection: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  patternTitle: { fontSize: 13, color: COLORS.textMuted, marginBottom: 8 },
  patternContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  patternOption: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)', minWidth: 60, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  patternOptionActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  patternLabel: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '500' },
  patternLabelActive: { color: COLORS.text },
  // Intensity selector styles
  intensityContainer: { marginBottom: 8 },
  intensityLabel: { fontSize: 13, color: COLORS.textMuted, marginBottom: 8 },
  intensityButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  intensityButton: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)', minWidth: 44, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  intensityButtonActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  intensityButtonText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
  intensityButtonTextActive: { color: COLORS.text },
  intensityHint: { fontSize: 11, color: COLORS.textMuted, marginTop: 6, textAlign: 'center' },
  // Screen flash overlay - 화면 전체를 덮는 밝은 빨간색/흰색 플래시
  flashOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 100, 100, 0.9)',
    zIndex: 9999,
  },
  // Background mode indicator
  backgroundModeIndicator: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 60 : 50,
    right: 10,
    backgroundColor: 'rgba(25, 230, 107, 0.9)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  backgroundModeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
});
