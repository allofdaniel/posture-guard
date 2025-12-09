import React, { useState, useEffect, useRef, useCallback } from 'react';
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
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

// 광고 단위 ID (프로덕션용)
const BANNER_AD_UNIT_ID = __DEV__
  ? TestIds.BANNER
  : 'ca-app-pub-7278941489904900/5206159407';

const { width, height } = Dimensions.get('window');

// 알림 설정
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// 자세 상태
const POSTURE_STATUS = {
  GOOD: 'good',
  WARNING: 'warning',
  BAD: 'bad',
};

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [postureStatus, setPostureStatus] = useState(POSTURE_STATUS.GOOD);
  const [sensitivity, setSensitivity] = useState(0.3);
  const [alertEnabled, setAlertEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [badPostureCount, setBadPostureCount] = useState(0);
  const [totalAlerts, setTotalAlerts] = useState(0);
  const [sessionTime, setSessionTime] = useState(0);

  const cameraRef = useRef(null);
  const monitoringInterval = useRef(null);
  const sessionInterval = useRef(null);

  // 알림 권한 요청
  useEffect(() => {
    const requestNotificationPermission = async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('알림 권한', '자세 교정 알림을 위해 알림 권한이 필요합니다.');
      }
    };
    requestNotificationPermission();
  }, []);

  // 설정 로드
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedSensitivity = await AsyncStorage.getItem('sensitivity');
        const savedAlert = await AsyncStorage.getItem('alertEnabled');
        const savedVibration = await AsyncStorage.getItem('vibrationEnabled');
        const savedTotalAlerts = await AsyncStorage.getItem('totalAlerts');

        if (savedSensitivity) setSensitivity(parseFloat(savedSensitivity));
        if (savedAlert) setAlertEnabled(savedAlert === 'true');
        if (savedVibration) setVibrationEnabled(savedVibration === 'true');
        if (savedTotalAlerts) setTotalAlerts(parseInt(savedTotalAlerts));
      } catch (error) {
        console.error('Settings load error:', error);
      }
    };
    loadSettings();
  }, []);

  // 설정 저장
  const saveSettings = async (key, value) => {
    try {
      await AsyncStorage.setItem(key, value.toString());
    } catch (error) {
      console.error('Settings save error:', error);
    }
  };

  // 자세 시뮬레이션 (실제 앱에서는 AI 모델 사용)
  const simulatePostureCheck = useCallback(() => {
    // 랜덤하게 자세 상태 시뮬레이션 (테스트용)
    // 실제 앱에서는 TensorFlow.js 또는 ML Kit 사용
    const random = Math.random();
    const badThreshold = 0.15 + (sensitivity * 0.1);
    const warningThreshold = 0.3 + (sensitivity * 0.15);

    if (random < badThreshold) {
      return POSTURE_STATUS.BAD;
    } else if (random < warningThreshold) {
      return POSTURE_STATUS.WARNING;
    }
    return POSTURE_STATUS.GOOD;
  }, [sensitivity]);

  // 나쁜 자세 알림
  const triggerBadPostureAlert = useCallback(async () => {
    const newTotalAlerts = totalAlerts + 1;
    setTotalAlerts(newTotalAlerts);
    saveSettings('totalAlerts', newTotalAlerts);

    if (vibrationEnabled) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }

    if (alertEnabled) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '자세 교정 필요!',
          body: '자세가 흐트러졌습니다. 바른 자세로 앉아주세요.',
          sound: true,
        },
        trigger: null,
      });
    }
  }, [alertEnabled, vibrationEnabled, totalAlerts]);

  // 모니터링 로직
  useEffect(() => {
    if (isMonitoring) {
      // 세션 타이머
      sessionInterval.current = setInterval(() => {
        setSessionTime(prev => prev + 1);
      }, 1000);

      // 자세 체크 (3초마다)
      monitoringInterval.current = setInterval(() => {
        const status = simulatePostureCheck();
        setPostureStatus(status);

        if (status === POSTURE_STATUS.BAD) {
          setBadPostureCount(prev => {
            if (prev >= 2) {
              // 연속 3번 나쁜 자세 감지 시 알림
              triggerBadPostureAlert();
              return 0;
            }
            return prev + 1;
          });
        } else {
          setBadPostureCount(0);
        }
      }, 3000);
    } else {
      if (monitoringInterval.current) {
        clearInterval(monitoringInterval.current);
      }
      if (sessionInterval.current) {
        clearInterval(sessionInterval.current);
      }
    }

    return () => {
      if (monitoringInterval.current) clearInterval(monitoringInterval.current);
      if (sessionInterval.current) clearInterval(sessionInterval.current);
    };
  }, [isMonitoring, simulatePostureCheck, triggerBadPostureAlert]);

  // 모니터링 시작/중지
  const toggleMonitoring = useCallback(() => {
    setIsMonitoring(prev => !prev);
    if (!isMonitoring) {
      setSessionTime(0);
      setBadPostureCount(0);
    }
    setPostureStatus(POSTURE_STATUS.GOOD);
  }, [isMonitoring]);

  // 시간 포맷
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // 권한 체크
  if (!permission) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.loadingText}>권한 확인 중...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.centerContent}>
          <Text style={styles.permissionIcon}>📷</Text>
          <Text style={styles.permissionTitle}>카메라 권한 필요</Text>
          <Text style={styles.permissionText}>
            자세 감지를 위해{'\n'}카메라 접근 권한이 필요합니다.
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>권한 허용하기</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // 상태 색상
  const getStatusColor = () => {
    switch (postureStatus) {
      case POSTURE_STATUS.BAD: return '#EF4444';
      case POSTURE_STATUS.WARNING: return '#F59E0B';
      default: return '#10B981';
    }
  };

  const getStatusText = () => {
    switch (postureStatus) {
      case POSTURE_STATUS.BAD: return '자세 교정 필요!';
      case POSTURE_STATUS.WARNING: return '주의';
      default: return '좋은 자세';
    }
  };

  const getStatusEmoji = () => {
    switch (postureStatus) {
      case POSTURE_STATUS.BAD: return '😣';
      case POSTURE_STATUS.WARNING: return '😐';
      default: return '😊';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>자세 교정 알리미</Text>
        <Text style={styles.headerSubtitle}>바른 자세로 건강하게!</Text>
      </View>

      {/* 카메라 뷰 */}
      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="front"
        >
          {/* 상태 오버레이 */}
          {isMonitoring && (
            <View style={[styles.statusOverlay, { borderColor: getStatusColor() }]}>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor() }]}>
                <Text style={styles.statusEmoji}>{getStatusEmoji()}</Text>
                <Text style={styles.statusText}>{getStatusText()}</Text>
              </View>

              {/* 세션 정보 */}
              <View style={styles.sessionInfo}>
                <Text style={styles.sessionTime}>{formatTime(sessionTime)}</Text>
              </View>
            </View>
          )}

          {/* 모니터링 안내 */}
          {!isMonitoring && (
            <View style={styles.guideOverlay}>
              <Text style={styles.guideEmoji}>🧘</Text>
              <Text style={styles.guideText}>
                시작 버튼을 눌러{'\n'}자세 모니터링을 시작하세요
              </Text>
            </View>
          )}
        </CameraView>
      </View>

      {/* 통계 */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalAlerts}</Text>
          <Text style={styles.statLabel}>총 알림 횟수</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{formatTime(sessionTime)}</Text>
          <Text style={styles.statLabel}>세션 시간</Text>
        </View>
      </View>

      {/* 컨트롤 패널 */}
      <View style={styles.controlPanel}>
        {/* 시작/중지 버튼 */}
        <TouchableOpacity
          style={[
            styles.mainButton,
            { backgroundColor: isMonitoring ? '#EF4444' : '#6366F1' }
          ]}
          onPress={toggleMonitoring}
        >
          <Text style={styles.mainButtonText}>
            {isMonitoring ? '⏹️ 모니터링 중지' : '▶️ 모니터링 시작'}
          </Text>
        </TouchableOpacity>

        {/* 설정 */}
        <View style={styles.settingsContainer}>
          {/* 민감도 */}
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>민감도</Text>
            <View style={styles.sensitivityButtons}>
              {[0.1, 0.3, 0.5].map((value) => (
                <TouchableOpacity
                  key={value}
                  style={[
                    styles.sensitivityButton,
                    sensitivity === value && styles.sensitivityButtonActive
                  ]}
                  onPress={() => {
                    setSensitivity(value);
                    saveSettings('sensitivity', value);
                  }}
                >
                  <Text style={[
                    styles.sensitivityButtonText,
                    sensitivity === value && styles.sensitivityButtonTextActive
                  ]}>
                    {value === 0.1 ? '낮음' : value === 0.3 ? '중간' : '높음'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 진동 */}
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>진동 알림</Text>
            <Switch
              value={vibrationEnabled}
              onValueChange={(value) => {
                setVibrationEnabled(value);
                saveSettings('vibrationEnabled', value);
              }}
              trackColor={{ false: '#4B5563', true: '#6366F1' }}
              thumbColor={vibrationEnabled ? '#fff' : '#9CA3AF'}
            />
          </View>

          {/* 알림 */}
          <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.settingLabel}>푸시 알림</Text>
            <Switch
              value={alertEnabled}
              onValueChange={(value) => {
                setAlertEnabled(value);
                saveSettings('alertEnabled', value);
              }}
              trackColor={{ false: '#4B5563', true: '#6366F1' }}
              thumbColor={alertEnabled ? '#fff' : '#9CA3AF'}
            />
          </View>
        </View>
      </View>

      {/* 안내 텍스트 */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          카메라에 상체가 보이도록 폰을 세워두세요
        </Text>
      </View>

      {/* 배너 광고 */}
      <View style={styles.adContainer}>
        <BannerAd
          unitId={BANNER_AD_UNIT_ID}
          size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
          requestOptions={{
            requestNonPersonalizedAdsOnly: true,
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1F2937',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    color: '#fff',
    fontSize: 18,
  },
  permissionIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  permissionText: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  permissionButton: {
    backgroundColor: '#6366F1',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingTop: Platform.OS === 'android' ? 36 : 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 2,
  },
  cameraContainer: {
    height: height * 0.32,
    marginHorizontal: 16,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  statusOverlay: {
    flex: 1,
    borderWidth: 4,
    borderRadius: 16,
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusEmoji: {
    fontSize: 22,
    marginRight: 8,
  },
  statusText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  sessionInfo: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  sessionTime: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  guideOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  guideEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  guideText: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
    lineHeight: 24,
  },
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    gap: 12,
  },
  statItem: {
    flex: 1,
    backgroundColor: '#374151',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  statLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  controlPanel: {
    flex: 1,
    padding: 16,
  },
  mainButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  mainButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  settingsContainer: {
    backgroundColor: '#374151',
    borderRadius: 16,
    padding: 14,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#4B5563',
  },
  settingLabel: {
    fontSize: 15,
    color: '#D1D5DB',
  },
  sensitivityButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  sensitivityButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#4B5563',
  },
  sensitivityButtonActive: {
    backgroundColor: '#6366F1',
  },
  sensitivityButtonText: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  sensitivityButtonTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  footer: {
    alignItems: 'center',
    paddingBottom: 16,
  },
  footerText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  adContainer: {
    alignItems: 'center',
    backgroundColor: '#1F2937',
    paddingBottom: Platform.OS === 'ios' ? 0 : 8,
  },
});
