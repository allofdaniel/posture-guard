import React from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, Switch } from 'react-native';
import { CONFIG, COLORS } from './constants';
import { styles } from './styles';

// SettingItem component
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

// PatternSelector component
const PatternSelector = React.memo(({ patterns, selected, onSelect, patternLabels }) => (
  <View style={styles.patternContainer}>
    {Object.keys(patterns).map((key) => (
      <TouchableOpacity
        key={key}
        style={[styles.patternOption, selected === key && styles.patternOptionActive]}
        onPress={() => onSelect(key)}
        accessibilityRole="button"
        accessibilityLabel={patternLabels[key] || key}
        accessibilityState={{ selected: selected === key }}
      >
        <Text style={[styles.patternLabel, selected === key && styles.patternLabelActive]}>
          {patternLabels[key] || key}
        </Text>
      </TouchableOpacity>
    ))}
  </View>
));

// IntensitySelector component
const IntensitySelector = React.memo(({ value, onChange, min, max, step, t }) => {
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
            accessibilityRole="button"
            accessibilityLabel={`${level}ms`}
            accessibilityState={{ selected: value === level }}
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

const SettingsModal = React.memo(({
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
          <TouchableOpacity
            onPress={onClose}
            style={styles.modalCloseButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={t.close || 'Close'}
          >
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
                  accessibilityRole="button"
                  accessibilityLabel={`${item.label} - ${item.desc}`}
                  accessibilityState={{ selected: sensitivity === item.value }}
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
            <TouchableOpacity
              style={styles.infoButton}
              onPress={onShowPrivacyPolicy}
              accessibilityRole="button"
              accessibilityLabel={t.privacyPolicy}
            >
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

export { SettingItem, PatternSelector, IntensitySelector };
export default SettingsModal;
