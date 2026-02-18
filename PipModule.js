// PiP (Picture-in-Picture) Module for React Native
import { NativeModules, Platform } from 'react-native';

const { PipModule } = NativeModules;

export const isPipSupported = async () => {
  if (Platform.OS !== 'android' || !PipModule) {
    return false;
  }
  try {
    return await PipModule.isPipSupported();
  } catch (e) {
    console.error('PiP support check error:', e);
    return false;
  }
};

export const enterPipMode = async (aspectRatioWidth = 16, aspectRatioHeight = 9) => {
  if (Platform.OS !== 'android' || !PipModule) {
    return false;
  }
  try {
    return await PipModule.enterPipMode(aspectRatioWidth, aspectRatioHeight);
  } catch (e) {
    console.error('Enter PiP error:', e);
    return false;
  }
};

export const isInPipMode = async () => {
  if (Platform.OS !== 'android' || !PipModule) {
    return false;
  }
  try {
    return await PipModule.isInPipMode();
  } catch (e) {
    console.error('Check PiP mode error:', e);
    return false;
  }
};

export const setAutoEnterPip = async (enabled) => {
  if (Platform.OS !== 'android' || !PipModule) {
    return false;
  }
  try {
    return await PipModule.setAutoEnterPip(enabled);
  } catch (e) {
    console.error('Set auto PiP error:', e);
    return false;
  }
};

// Update PiP overlay status (warnings, alerts, time, achievement rate, status)
export const updatePipStatus = (warnings, alerts, time, achievementRate, status, isGoodPosture) => {
  if (Platform.OS !== 'android' || !PipModule) {
    return;
  }
  try {
    PipModule.updatePipStatus(warnings, alerts, time, achievementRate, status, isGoodPosture);
  } catch (e) {
    // Silently ignore - this is called frequently
  }
};

export default {
  isPipSupported,
  enterPipMode,
  isInPipMode,
  setAutoEnterPip,
  updatePipStatus,
};
