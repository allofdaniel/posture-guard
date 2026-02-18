import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, TouchableOpacity } from 'react-native';
import { COLORS } from './constants';

const CLOCK_COLORS = {
  green: '#19e66b',
  white: '#F8FAFC',
  blue: '#60A5FA',
  red: '#EF4444',
};

const FONT_SIZES = {
  small: { time: 48, date: 16, stats: 14, hint: 11 },
  medium: { time: 64, date: 20, stats: 16, hint: 12 },
  large: { time: 80, date: 24, stats: 18, hint: 13 },
};

const DAY_NAMES = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  ko: ['일', '월', '화', '수', '목', '금', '토'],
};

const DeskClock = ({
  onDismiss, isMonitoring, sessionTime, goodPostureRate,
  clockSettings, onSettingsChange, formatTime, lang, t,
}) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const color = CLOCK_COLORS[clockSettings.color] || CLOCK_COLORS.green;
  const sizes = FONT_SIZES[clockSettings.fontSize] || FONT_SIZES.large;
  const days = DAY_NAMES[lang] || DAY_NAMES.en;

  const formatDate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}.${m}.${d}`;
  };

  return (
    <Pressable
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', zIndex: 100,
      }}
      onPress={() => {
        if (showSettings) setShowSettings(false);
        else onDismiss();
      }}
    >
      {/* Settings gear */}
      <TouchableOpacity
        style={{ position: 'absolute', top: 40, right: 20, zIndex: 10 }}
        onPress={() => setShowSettings(!showSettings)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={{ fontSize: 24, opacity: 0.5 }}>&#x2699;&#xFE0F;</Text>
      </TouchableOpacity>

      {/* Clock content */}
      <View style={{ alignItems: 'center' }}>
        {clockSettings.showTime && (
          <Text style={{
            fontSize: sizes.time, fontWeight: '200', color,
            fontFamily: 'monospace', letterSpacing: 4,
          }}>
            {currentTime.getHours().toString().padStart(2, '0')}
            :{currentTime.getMinutes().toString().padStart(2, '0')}
          </Text>
        )}
        {(clockSettings.showDate || clockSettings.showDay) && (
          <Text style={{ fontSize: sizes.date, color: color + '99', marginTop: 8, fontWeight: '300' }}>
            {clockSettings.showDate && formatDate(currentTime)}
            {clockSettings.showDate && clockSettings.showDay && ' '}
            {clockSettings.showDay && days[currentTime.getDay()]}
          </Text>
        )}
        {clockSettings.showStats && isMonitoring && (
          <Text style={{ fontSize: sizes.stats, color: color + '77', marginTop: 16, fontWeight: '400' }}>
            {formatTime(sessionTime)}  {'\u00B7'}  {goodPostureRate}%
          </Text>
        )}
      </View>

      {/* Hint */}
      <Text style={{
        position: 'absolute', bottom: 40,
        fontSize: sizes.hint, color: 'rgba(255,255,255,0.2)',
      }}>
        {t.tapToDismiss}
      </Text>

      {/* Settings panel */}
      {showSettings && (
        <Pressable
          style={{
            position: 'absolute', top: 80, right: 16, width: 200,
            backgroundColor: 'rgba(26, 44, 34, 0.95)', borderRadius: 16,
            padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
          }}
          onPress={() => {}}
        >
          <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 12 }}>
            {t.clockSettings}
          </Text>

          {/* Toggle items */}
          {[
            { key: 'showTime', label: t.showTime },
            { key: 'showDate', label: t.showDate },
            { key: 'showDay', label: t.showDay },
            { key: 'showStats', label: t.showStats },
          ].map((item) => (
            <TouchableOpacity
              key={item.key}
              style={{
                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
              }}
              onPress={() => onSettingsChange(item.key, !clockSettings[item.key])}
            >
              <Text style={{ fontSize: 13, color: COLORS.text }}>{item.label}</Text>
              <Text style={{
                fontSize: 12, fontWeight: '700',
                color: clockSettings[item.key] ? COLORS.primary : COLORS.textMuted,
              }}>
                {clockSettings[item.key] ? 'ON' : 'OFF'}
              </Text>
            </TouchableOpacity>
          ))}

          {/* Font size */}
          <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 12, marginBottom: 8 }}>
            {t.fontSize}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              { key: 'small', label: t.fontSmall },
              { key: 'medium', label: t.fontMedium },
              { key: 'large', label: t.fontLarge },
            ].map((item) => (
              <TouchableOpacity
                key={item.key}
                style={{
                  flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 8,
                  backgroundColor: clockSettings.fontSize === item.key ? COLORS.primary : 'rgba(255,255,255,0.05)',
                  borderWidth: 1,
                  borderColor: clockSettings.fontSize === item.key ? COLORS.primary : 'rgba(255,255,255,0.1)',
                }}
                onPress={() => onSettingsChange('fontSize', item.key)}
              >
                <Text style={{
                  fontSize: 12, fontWeight: '600',
                  color: clockSettings.fontSize === item.key ? COLORS.background : COLORS.textSecondary,
                }}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Color */}
          <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 12, marginBottom: 8 }}>
            {t.clockColor}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {Object.entries(CLOCK_COLORS).map(([key, val]) => (
              <TouchableOpacity
                key={key}
                style={{
                  width: 32, height: 32, borderRadius: 16, backgroundColor: val,
                  borderWidth: 2, borderColor: clockSettings.color === key ? '#fff' : 'transparent',
                }}
                onPress={() => onSettingsChange('color', key)}
              />
            ))}
          </View>
        </Pressable>
      )}
    </Pressable>
  );
};

export default DeskClock;
