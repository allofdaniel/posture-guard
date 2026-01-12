import { Platform } from 'react-native';

// Foreground service for background operation
let ForegroundService = null;

// Try to import the foreground service module
try {
  ForegroundService = require('@supersami/rn-foreground-service').default;
} catch (e) {
  console.log('Foreground service not available:', e);
}

// Notification channel configuration
const CHANNEL_CONFIG = {
  id: 'posture-guard-channel',
  name: 'Posture Guard',
  description: 'Posture monitoring notification',
  importance: 4, // HIGH
  enableVibration: false,
};

// Notification configuration
const NOTIFICATION_CONFIG = {
  id: 1001,
  title: 'Posture Guard',
  message: 'Monitoring your posture',
  icon: 'ic_notification',
  ongoing: true,
  setOnlyAlertOnce: true,
  color: '#6366F1',
};

class BackgroundServiceManager {
  constructor() {
    this.isRunning = false;
    this.isInitialized = false;
  }

  // Initialize the foreground service
  async initialize() {
    if (Platform.OS !== 'android' || !ForegroundService) {
      console.log('Foreground service not supported on this platform');
      return false;
    }

    if (this.isInitialized) {
      return true;
    }

    try {
      // Create notification channel
      await ForegroundService.createNotificationChannel(CHANNEL_CONFIG);
      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize foreground service:', error);
      return false;
    }
  }

  // Start the foreground service
  async start(titleKo = false) {
    if (Platform.OS !== 'android' || !ForegroundService) {
      return false;
    }

    try {
      // Initialize if needed
      if (!this.isInitialized) {
        const initialized = await this.initialize();
        if (!initialized) {
          return false;
        }
      }

      // Start the service
      await ForegroundService.startService({
        ...NOTIFICATION_CONFIG,
        channelId: CHANNEL_CONFIG.id,
        title: titleKo ? '자세 알리미' : 'Posture Guard',
        message: titleKo ? '자세 모니터링 중...' : 'Monitoring your posture...',
      });

      this.isRunning = true;
      return true;
    } catch (error) {
      console.error('Failed to start foreground service:', error);
      return false;
    }
  }

  // Stop the foreground service
  async stop() {
    if (Platform.OS !== 'android' || !ForegroundService) {
      return false;
    }

    try {
      await ForegroundService.stopService();
      this.isRunning = false;
      return true;
    } catch (error) {
      console.error('Failed to stop foreground service:', error);
      return false;
    }
  }

  // Update notification message
  async updateNotification(message, titleKo = false) {
    if (Platform.OS !== 'android' || !ForegroundService || !this.isRunning) {
      return false;
    }

    try {
      await ForegroundService.updateNotification({
        ...NOTIFICATION_CONFIG,
        channelId: CHANNEL_CONFIG.id,
        title: titleKo ? '자세 알리미' : 'Posture Guard',
        message: message,
      });
      return true;
    } catch (error) {
      console.error('Failed to update notification:', error);
      return false;
    }
  }

  // Check if service is running
  isServiceRunning() {
    return this.isRunning;
  }
}

// Export singleton instance
const backgroundService = new BackgroundServiceManager();
export default backgroundService;
