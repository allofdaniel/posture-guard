import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, Linking } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { styles } from './styles';

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

export default PermissionScreen;
