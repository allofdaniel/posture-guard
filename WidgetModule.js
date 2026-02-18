// Widget Module for React Native
import { NativeModules, Platform } from 'react-native';

const { WidgetModule } = NativeModules;

export const updateWidget = async (score, isMonitoring) => {
  if (Platform.OS !== 'android' || !WidgetModule) {
    return false;
  }
  try {
    return await WidgetModule.updateWidget(score, isMonitoring);
  } catch (e) {
    console.error('Widget update error:', e);
    return false;
  }
};

export const hasWidgets = async () => {
  if (Platform.OS !== 'android' || !WidgetModule) {
    return false;
  }
  try {
    return await WidgetModule.hasWidgets();
  } catch (e) {
    console.error('Widget check error:', e);
    return false;
  }
};

export default {
  updateWidget,
  hasWidgets,
};
