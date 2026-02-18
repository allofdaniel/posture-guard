import React from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { COLORS } from './constants';
import { styles } from './styles';

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

export default SessionResultModal;
