import React from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { COLORS } from './constants';
import { styles } from './styles';

// StatCard component
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

const StatsModal = React.memo(({ visible, onClose, stats, t }) => (
  <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{t.statistics}</Text>
          <TouchableOpacity
            onPress={onClose}
            style={styles.modalCloseButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={t.close}
          >
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

export { StatCard };
export default StatsModal;
