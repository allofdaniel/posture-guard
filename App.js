import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  Dimensions,
  Alert,
  Switch,
  AppState,
  Modal,
  ScrollView,
  Animated,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

const BANNER_AD_UNIT_ID = __DEV__ ? TestIds.BANNER : 'ca-app-pub-7278941489904900/5206159407';
const { width, height } = Dimensions.get('window');

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
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const POSTURE_STATUS = { GOOD: 'good', WARNING: 'warning', BAD: 'bad' };

const ONBOARDING_DATA = [
  { title: '자세 교정 알리미', description: '바른 자세 습관을 만들어\n건강한 일상을 시작하세요', icon: '🧘' },
  { title: '실시간 모니터링', description: '카메라로 자세를 분석하고\n흐트러지면 바로 알려드려요', icon: '📱' },
  { title: '맞춤 알림 설정', description: '진동, 소리 알림을 선택하고\n민감도를 조절할 수 있어요', icon: '🔔' },
];

const OnboardingScreen = React.memo(({ onComplete }) => {
  const [currentPage, setCurrentPage] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const handleNext = useCallback(() => {
    if (currentPage < ONBOARDING_DATA.length - 1) {
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();
      setCurrentPage(prev => prev + 1);
    } else { onComplete(); }
  }, [currentPage, fadeAnim, onComplete]);
  const data = ONBOARDING_DATA[currentPage];
  return (
    <SafeAreaView style={styles.onboardingContainer}>
      <StatusBar style="light" />
      <Animated.View style={[styles.onboardingContent, { opacity: fadeAnim }]}>
        <Text style={styles.onboardingIcon}>{data.icon}</Text>
        <Text style={styles.onboardingTitle}>{data.title}</Text>
        <Text style={styles.onboardingDescription}>{data.description}</Text>
      </Animated.View>
      <View style={styles.onboardingFooter}>
        <View style={styles.onboardingDots}>
          {ONBOARDING_DATA.map((_, index) => (
            <View key={index} style={[styles.onboardingDot, index === currentPage && styles.onboardingDotActive]} />
          ))}
        </View>
        <TouchableOpacity style={styles.onboardingButton} onPress={handleNext}>
          <Text style={styles.onboardingButtonText}>{currentPage < ONBOARDING_DATA.length - 1 ? '다음' : '시작하기'}</Text>
        </TouchableOpacity>
        {currentPage < ONBOARDING_DATA.length - 1 && (
          <TouchableOpacity style={styles.skipButton} onPress={onComplete}>
            <Text style={styles.skipButtonText}>건너뛰기</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
});

const PermissionScreen = React.memo(({ onRequestPermission }) => (
  <SafeAreaView style={styles.container}>
    <StatusBar style="light" />
    <View style={styles.permissionContent}>
      <View style={styles.permissionIconContainer}>
        <Text style={styles.permissionIcon}>📷</Text>
      </View>
      <Text style={styles.permissionTitle}>카메라 권한 필요</Text>
      <Text style={styles.permissionText}>자세를 분석하기 위해{'\n'}카메라 접근 권한이 필요합니다.</Text>
      <Text style={styles.permissionNote}>촬영된 영상은 기기에서만 처리되며{'\n'}외부로 전송되지 않습니다.</Text>
      <TouchableOpacity style={styles.permissionButton} onPress={onRequestPermission}>
        <Text style={styles.permissionButtonText}>권한 허용하기</Text>
      </TouchableOpacity>
    </View>
  </SafeAreaView>
));

const StatCard = React.memo(({ icon, value, label, color }) => (
  <View style={[styles.statCard, { borderLeftColor: color || COLORS.primary }]}>
    <Text style={styles.statIcon}>{icon}</Text>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
));

const SettingItem = React.memo(({ label, description, value, onValueChange, isLast }) => (
  <View style={[styles.settingItem, isLast && styles.settingItemLast]}>
    <View style={styles.settingTextContainer}>
      <Text style={styles.settingLabel}>{label}</Text>
      {description && <Text style={styles.settingDescription}>{description}</Text>}
    </View>
    <Switch value={value} onValueChange={onValueChange} trackColor={{ false: COLORS.surfaceLight, true: COLORS.primary }} thumbColor={value ? '#fff' : COLORS.textSecondary} />
  </View>
));

const SettingsModal = React.memo(({ visible, onClose, sensitivity, setSensitivity, vibrationEnabled, setVibrationEnabled, alertEnabled, setAlertEnabled, saveSettings, onShowPrivacyPolicy }) => (
  <Modal visible={visible} animationType="slide" transparent={true}>
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>설정</Text>
          <TouchableOpacity onPress={onClose} style={styles.modalCloseButton}><Text style={styles.modalCloseText}>✕</Text></TouchableOpacity>
        </View>
        <ScrollView style={styles.modalBody}>
          <View style={styles.settingsSection}>
            <Text style={styles.sectionTitle}>감지 민감도</Text>
            <Text style={styles.sectionDescription}>민감도가 높을수록 작은 자세 변화도 감지합니다</Text>
            <View style={styles.sensitivityContainer}>
              {[{ value: 0.1, label: '낮음', desc: '여유있게' }, { value: 0.3, label: '중간', desc: '권장' }, { value: 0.5, label: '높음', desc: '엄격하게' }].map((item) => (
                <TouchableOpacity key={item.value} style={[styles.sensitivityOption, sensitivity === item.value && styles.sensitivityOptionActive]} onPress={() => { setSensitivity(item.value); saveSettings('sensitivity', item.value); }}>
                  <Text style={[styles.sensitivityLabel, sensitivity === item.value && styles.sensitivityLabelActive]}>{item.label}</Text>
                  <Text style={[styles.sensitivityDesc, sensitivity === item.value && styles.sensitivityDescActive]}>{item.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.settingsSection}>
            <Text style={styles.sectionTitle}>알림 설정</Text>
            <View style={styles.settingsList}>
              <SettingItem label="진동 알림" description="자세가 흐트러지면 진동으로 알림" value={vibrationEnabled} onValueChange={(value) => { setVibrationEnabled(value); saveSettings('vibrationEnabled', value); }} />
              <SettingItem label="푸시 알림" description="화면 상단에 알림 표시" value={alertEnabled} onValueChange={(value) => { setAlertEnabled(value); saveSettings('alertEnabled', value); }} isLast />
            </View>
          </View>
          <View style={styles.settingsSection}>
            <Text style={styles.sectionTitle}>정보</Text>
            <TouchableOpacity style={styles.infoButton} onPress={onShowPrivacyPolicy}>
              <Text style={styles.infoButtonText}>개인정보처리방침</Text>
              <Text style={styles.infoButtonArrow}>›</Text>
            </TouchableOpacity>
            <View style={styles.appInfo}><Text style={styles.appInfoText}>자세 교정 알리미 v1.0.0</Text></View>
          </View>
        </ScrollView>
      </View>
    </View>
  </Modal>
));

const StatsModal = React.memo(({ visible, onClose, stats }) => (
  <Modal visible={visible} animationType="slide" transparent={true}>
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>통계</Text>
          <TouchableOpacity onPress={onClose} style={styles.modalCloseButton}><Text style={styles.modalCloseText}>✕</Text></TouchableOpacity>
        </View>
        <ScrollView style={styles.modalBody}>
          <View style={styles.statsGrid}>
            <StatCard icon="🔔" value={stats.totalAlerts} label="총 알림 횟수" color={COLORS.warning} />
            <StatCard icon="⏱️" value={stats.totalSessionTime} label="총 모니터링 시간" color={COLORS.primary} />
            <StatCard icon="📊" value={stats.sessionsCount} label="세션 횟수" color={COLORS.success} />
            <StatCard icon="✨" value={stats.goodPostureRate} label="바른 자세 비율" color={COLORS.success} />
          </View>
          <View style={styles.statsNote}><Text style={styles.statsNoteText}>꾸준한 사용으로 바른 자세 습관을 만들어보세요!</Text></View>
        </ScrollView>
      </View>
    </View>
  </Modal>
));

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [isOnboardingChecked, setIsOnboardingChecked] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [postureStatus, setPostureStatus] = useState(POSTURE_STATUS.GOOD);
  const [badPostureCount, setBadPostureCount] = useState(0);
  const [sensitivity, setSensitivity] = useState(0.3);
  const [alertEnabled, setAlertEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [totalAlerts, setTotalAlerts] = useState(0);
  const [sessionTime, setSessionTime] = useState(0);
  const [totalSessionTime, setTotalSessionTime] = useState(0);
  const [sessionsCount, setSessionsCount] = useState(0);
  const [goodPostureTime, setGoodPostureTime] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const cameraRef = useRef(null);
  const monitoringInterval = useRef(null);
  const sessionInterval = useRef(null);
  const appState = useRef(AppState.currentState);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        const hasSeenOnboarding = await AsyncStorage.getItem('hasSeenOnboarding');
        if (hasSeenOnboarding === 'true') setShowOnboarding(false);
      } catch (error) { console.error('Onboarding check error:', error); }
      setIsOnboardingChecked(true);
    };
    checkOnboarding();
  }, []);

  const completeOnboarding = useCallback(async () => {
    try { await AsyncStorage.setItem('hasSeenOnboarding', 'true'); } catch (error) { console.error('Onboarding save error:', error); }
    setShowOnboarding(false);
  }, []);

  useEffect(() => {
    const requestNotificationPermission = async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') console.log('Notification permission not granted');
    };
    requestNotificationPermission();
  }, []);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const keys = ['sensitivity', 'alertEnabled', 'vibrationEnabled', 'totalAlerts', 'totalSessionTime', 'sessionsCount', 'goodPostureTime'];
        const results = await AsyncStorage.multiGet(keys);
        const settings = Object.fromEntries(results);
        if (settings.sensitivity) setSensitivity(parseFloat(settings.sensitivity));
        if (settings.alertEnabled) setAlertEnabled(settings.alertEnabled === 'true');
        if (settings.vibrationEnabled) setVibrationEnabled(settings.vibrationEnabled === 'true');
        if (settings.totalAlerts) setTotalAlerts(parseInt(settings.totalAlerts));
        if (settings.totalSessionTime) setTotalSessionTime(parseInt(settings.totalSessionTime));
        if (settings.sessionsCount) setSessionsCount(parseInt(settings.sessionsCount));
        if (settings.goodPostureTime) setGoodPostureTime(parseInt(settings.goodPostureTime));
      } catch (error) { console.error('Settings load error:', error); }
    };
    loadSettings();
  }, []);

  const saveSettings = useCallback(async (key, value) => {
    try { await AsyncStorage.setItem(key, value.toString()); } catch (error) { console.error('Settings save error:', error); }
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current === 'active' && nextAppState.match(/inactive|background/)) {
        if (isMonitoring) saveSessionStats();
      }
      appState.current = nextAppState;
    });
    return () => subscription.remove();
  }, [isMonitoring]);

  const saveSessionStats = useCallback(async () => {
    try {
      const newTotalTime = totalSessionTime + sessionTime;
      await AsyncStorage.multiSet([['totalSessionTime', newTotalTime.toString()], ['goodPostureTime', goodPostureTime.toString()]]);
      setTotalSessionTime(newTotalTime);
    } catch (error) { console.error('Session stats save error:', error); }
  }, [sessionTime, totalSessionTime, goodPostureTime]);

  const simulatePostureCheck = useCallback(() => {
    const random = Math.random();
    const badThreshold = 0.15 + (sensitivity * 0.1);
    const warningThreshold = 0.3 + (sensitivity * 0.15);
    if (random < badThreshold) return POSTURE_STATUS.BAD;
    if (random < warningThreshold) return POSTURE_STATUS.WARNING;
    return POSTURE_STATUS.GOOD;
  }, [sensitivity]);

  const triggerBadPostureAlert = useCallback(async () => {
    const newTotalAlerts = totalAlerts + 1;
    setTotalAlerts(newTotalAlerts);
    saveSettings('totalAlerts', newTotalAlerts);
    if (vibrationEnabled) await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    if (alertEnabled) {
      await Notifications.scheduleNotificationAsync({
        content: { title: '자세 교정 필요!', body: '자세가 흐트러졌습니다. 바른 자세로 앉아주세요.', sound: true },
        trigger: null,
      });
    }
  }, [alertEnabled, vibrationEnabled, totalAlerts, saveSettings]);

  useEffect(() => {
    if (isMonitoring) {
      const pulse = Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]));
      pulse.start();
      return () => pulse.stop();
    } else { pulseAnim.setValue(1); }
  }, [isMonitoring, pulseAnim]);

  useEffect(() => {
    if (isMonitoring) {
      sessionInterval.current = setInterval(() => setSessionTime(prev => prev + 1), 1000);
      monitoringInterval.current = setInterval(() => {
        const status = simulatePostureCheck();
        setPostureStatus(status);
        if (status === POSTURE_STATUS.GOOD) setGoodPostureTime(prev => prev + 3);
        if (status === POSTURE_STATUS.BAD) {
          setBadPostureCount(prev => { if (prev >= 2) { triggerBadPostureAlert(); return 0; } return prev + 1; });
        } else { setBadPostureCount(0); }
      }, 3000);
    } else {
      if (monitoringInterval.current) clearInterval(monitoringInterval.current);
      if (sessionInterval.current) clearInterval(sessionInterval.current);
    }
    return () => {
      if (monitoringInterval.current) clearInterval(monitoringInterval.current);
      if (sessionInterval.current) clearInterval(sessionInterval.current);
    };
  }, [isMonitoring, simulatePostureCheck, triggerBadPostureAlert]);

  const toggleMonitoring = useCallback(async () => {
    if (isMonitoring) {
      await saveSessionStats();
      const newSessionsCount = sessionsCount + 1;
      setSessionsCount(newSessionsCount);
      await saveSettings('sessionsCount', newSessionsCount);
    } else { setSessionTime(0); setBadPostureCount(0); }
    setIsMonitoring(prev => !prev);
    setPostureStatus(POSTURE_STATUS.GOOD);
  }, [isMonitoring, saveSessionStats, sessionsCount, saveSettings]);

  const formatTime = useCallback((seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return hrs + ':' + mins.toString().padStart(2, '0') + ':' + secs.toString().padStart(2, '0');
    return mins.toString().padStart(2, '0') + ':' + secs.toString().padStart(2, '0');
  }, []);

  const statsData = useMemo(() => ({
    totalAlerts,
    totalSessionTime: formatTime(totalSessionTime + sessionTime),
    sessionsCount: sessionsCount + '회',
    goodPostureRate: totalSessionTime > 0 ? Math.round((goodPostureTime / (totalSessionTime + sessionTime)) * 100) + '%' : '-',
  }), [totalAlerts, totalSessionTime, sessionTime, sessionsCount, goodPostureTime, formatTime]);

  const showPrivacyPolicy = useCallback(() => {
    Alert.alert('개인정보처리방침', '이 앱은 사용자의 개인정보를 존중합니다.\n\n• 카메라 영상은 기기에서만 처리되며 외부로 전송되지 않습니다.\n• 앱 사용 통계는 기기에만 저장됩니다.\n• 광고 표시를 위해 익명화된 광고 ID가 사용될 수 있습니다.\n\n문의: allofdaniel@gmail.com', [{ text: '확인', style: 'default' }]);
  }, []);

  const getStatusColor = useCallback(() => {
    switch (postureStatus) { case POSTURE_STATUS.BAD: return COLORS.danger; case POSTURE_STATUS.WARNING: return COLORS.warning; default: return COLORS.success; }
  }, [postureStatus]);

  const getStatusText = useCallback(() => {
    switch (postureStatus) { case POSTURE_STATUS.BAD: return '자세 교정 필요!'; case POSTURE_STATUS.WARNING: return '주의'; default: return '좋은 자세'; }
  }, [postureStatus]);

  const getStatusEmoji = useCallback(() => {
    switch (postureStatus) { case POSTURE_STATUS.BAD: return '😣'; case POSTURE_STATUS.WARNING: return '😐'; default: return '😊'; }
  }, [postureStatus]);

  if (!isOnboardingChecked) return (<SafeAreaView style={styles.container}><StatusBar style="light" /><View style={styles.centerContent}><Text style={styles.loadingText}>로딩 중...</Text></View></SafeAreaView>);
  if (showOnboarding) return <OnboardingScreen onComplete={completeOnboarding} />;
  if (!permission) return (<SafeAreaView style={styles.container}><StatusBar style="light" /><View style={styles.centerContent}><Text style={styles.loadingText}>권한 확인 중...</Text></View></SafeAreaView>);
  if (!permission.granted) return <PermissionScreen onRequestPermission={requestPermission} />;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>자세 교정 알리미</Text>
          <Text style={styles.headerSubtitle}>바른 자세로 건강하게</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerButton} onPress={() => setShowStats(true)}>
            <Text style={styles.headerButtonIcon}>📊</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={() => setShowSettings(true)}>
            <Text style={styles.headerButtonIcon}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Animated.View style={[styles.cameraContainer, { transform: [{ scale: pulseAnim }] }]}>
        <CameraView ref={cameraRef} style={styles.camera} facing="front">
          {isMonitoring && (
            <View style={[styles.statusOverlay, { borderColor: getStatusColor() }]}>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor() }]}>
                <Text style={styles.statusEmoji}>{getStatusEmoji()}</Text>
                <Text style={styles.statusText}>{getStatusText()}</Text>
              </View>
              <View style={styles.sessionInfo}>
                <Text style={styles.sessionTimeLabel}>세션 시간</Text>
                <Text style={styles.sessionTime}>{formatTime(sessionTime)}</Text>
              </View>
            </View>
          )}
          {!isMonitoring && (
            <View style={styles.guideOverlay}>
              <Text style={styles.guideEmoji}>🧘</Text>
              <Text style={styles.guideText}>시작 버튼을 눌러{'\n'}자세 모니터링을 시작하세요</Text>
              <Text style={styles.guideHint}>상체가 잘 보이도록 폰을 세워두세요</Text>
            </View>
          )}
        </CameraView>
      </Animated.View>
      <View style={styles.quickStats}>
        <View style={styles.quickStatItem}>
          <Text style={styles.quickStatIcon}>🔔</Text>
          <Text style={styles.quickStatValue}>{totalAlerts}</Text>
          <Text style={styles.quickStatLabel}>알림</Text>
        </View>
        <View style={styles.quickStatDivider} />
        <View style={styles.quickStatItem}>
          <Text style={styles.quickStatIcon}>⏱️</Text>
          <Text style={styles.quickStatValue}>{formatTime(sessionTime)}</Text>
          <Text style={styles.quickStatLabel}>현재 세션</Text>
        </View>
        <View style={styles.quickStatDivider} />
        <View style={styles.quickStatItem}>
          <Text style={styles.quickStatIcon}>📊</Text>
          <Text style={styles.quickStatValue}>{sessionsCount}</Text>
          <Text style={styles.quickStatLabel}>총 세션</Text>
        </View>
      </View>
      <View style={styles.controlSection}>
        <TouchableOpacity style={[styles.mainButton, { backgroundColor: isMonitoring ? COLORS.danger : COLORS.primary }]} onPress={toggleMonitoring} activeOpacity={0.8}>
          <Text style={styles.mainButtonEmoji}>{isMonitoring ? '⏹️' : '▶️'}</Text>
          <Text style={styles.mainButtonText}>{isMonitoring ? '모니터링 중지' : '모니터링 시작'}</Text>
        </TouchableOpacity>
        <View style={styles.quickSettings}>
          <Text style={styles.quickSettingsLabel}>민감도</Text>
          <View style={styles.quickSettingsButtons}>
            {[{ value: 0.1, label: '낮음' }, { value: 0.3, label: '중간' }, { value: 0.5, label: '높음' }].map((item) => (
              <TouchableOpacity key={item.value} style={[styles.quickSettingsButton, sensitivity === item.value && styles.quickSettingsButtonActive]} onPress={() => { setSensitivity(item.value); saveSettings('sensitivity', item.value); }}>
                <Text style={[styles.quickSettingsButtonText, sensitivity === item.value && styles.quickSettingsButtonTextActive]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
      <View style={styles.adContainer}>
        <BannerAd unitId={BANNER_AD_UNIT_ID} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} requestOptions={{ requestNonPersonalizedAdsOnly: true }} />
      </View>
      <SettingsModal visible={showSettings} onClose={() => setShowSettings(false)} sensitivity={sensitivity} setSensitivity={setSensitivity} vibrationEnabled={vibrationEnabled} setVibrationEnabled={setVibrationEnabled} alertEnabled={alertEnabled} setAlertEnabled={setAlertEnabled} saveSettings={saveSettings} onShowPrivacyPolicy={showPrivacyPolicy} />
      <StatsModal visible={showStats} onClose={() => setShowStats(false)} stats={statsData} />
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, paddingTop: Platform.OS === 'android' ? 40 : 12 },
  headerLeft: {},
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text },
  headerSubtitle: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  headerRight: { flexDirection: 'row', gap: 8 },
  headerButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center' },
  headerButtonIcon: { fontSize: 18 },
  cameraContainer: { height: height * 0.35, marginHorizontal: 16, borderRadius: 24, overflow: 'hidden', backgroundColor: '#000' },
  camera: { flex: 1 },
  statusOverlay: { flex: 1, borderWidth: 4, borderRadius: 20, justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 24 },
  statusEmoji: { fontSize: 24, marginRight: 8 },
  statusText: { fontSize: 16, fontWeight: 'bold', color: COLORS.text },
  sessionInfo: { backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, alignItems: 'center' },
  sessionTimeLabel: { fontSize: 10, color: COLORS.textSecondary, marginBottom: 2 },
  sessionTime: { fontSize: 20, color: COLORS.text, fontWeight: 'bold' },
  guideOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)' },
  guideEmoji: { fontSize: 56, marginBottom: 16 },
  guideText: { fontSize: 18, color: COLORS.text, textAlign: 'center', lineHeight: 26, fontWeight: '500' },
  guideHint: { fontSize: 13, color: COLORS.textMuted, marginTop: 12 },
  quickStats: { flexDirection: 'row', marginHorizontal: 16, marginTop: 16, backgroundColor: COLORS.surface, borderRadius: 16, padding: 16 },
  quickStatItem: { flex: 1, alignItems: 'center' },
  quickStatIcon: { fontSize: 20, marginBottom: 4 },
  quickStatValue: { fontSize: 20, fontWeight: 'bold', color: COLORS.text },
  quickStatLabel: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  quickStatDivider: { width: 1, backgroundColor: COLORS.border, marginVertical: 4 },
  controlSection: { flex: 1, paddingHorizontal: 16, paddingTop: 16, justifyContent: 'flex-start' },
  mainButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, borderRadius: 16, gap: 8 },
  mainButtonEmoji: { fontSize: 20 },
  mainButtonText: { color: COLORS.text, fontSize: 18, fontWeight: 'bold' },
  quickSettings: { marginTop: 16, backgroundColor: COLORS.surface, borderRadius: 16, padding: 16 },
  quickSettingsLabel: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 12 },
  quickSettingsButtons: { flexDirection: 'row', gap: 8 },
  quickSettingsButton: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: COLORS.surfaceLight, alignItems: 'center' },
  quickSettingsButtonActive: { backgroundColor: COLORS.primary },
  quickSettingsButtonText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '500' },
  quickSettingsButtonTextActive: { color: COLORS.text, fontWeight: 'bold' },
  adContainer: { alignItems: 'center', backgroundColor: COLORS.background, paddingBottom: Platform.OS === 'ios' ? 0 : 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text },
  modalCloseButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.surfaceLight, justifyContent: 'center', alignItems: 'center' },
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
});
