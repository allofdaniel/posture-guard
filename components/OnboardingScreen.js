import React, { useState, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, Animated } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { styles } from './styles';

const OnboardingScreen = React.memo(({ onComplete, t }) => {
  const [currentPage, setCurrentPage] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const handleNext = useCallback(() => {
    if (currentPage < t.onboarding.length - 1) {
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();
      setCurrentPage(prev => prev + 1);
    } else {
      onComplete();
    }
  }, [currentPage, fadeAnim, onComplete, t.onboarding.length]);

  const data = t.onboarding[currentPage];

  return (
    <SafeAreaView style={styles.onboardingContainer}>
      <StatusBar style="light" />
      <Animated.View style={[styles.onboardingContent, { opacity: fadeAnim }]}>
        <Text style={styles.onboardingIcon} accessibilityLabel={data.title}>{data.icon}</Text>
        <Text style={styles.onboardingTitle} accessibilityRole="header">{data.title}</Text>
        <Text style={styles.onboardingDescription}>{data.description}</Text>
      </Animated.View>
      <View style={styles.onboardingFooter}>
        <View style={styles.onboardingDots} accessibilityLabel={t.pageOfTotal.replace('{current}', currentPage + 1).replace('{total}', t.onboarding.length)}>
          {t.onboarding.map((_, index) => (
            <View key={index} style={[styles.onboardingDot, index === currentPage && styles.onboardingDotActive]} />
          ))}
        </View>
        <TouchableOpacity
          style={styles.onboardingButton}
          onPress={handleNext}
          accessibilityRole="button"
          accessibilityLabel={currentPage < t.onboarding.length - 1 ? t.next : t.getStarted}
        >
          <Text style={styles.onboardingButtonText}>
            {currentPage < t.onboarding.length - 1 ? t.next : t.getStarted}
          </Text>
        </TouchableOpacity>
        {currentPage < t.onboarding.length - 1 && (
          <TouchableOpacity
            style={styles.skipButton}
            onPress={onComplete}
            accessibilityRole="button"
            accessibilityLabel={t.skip}
          >
            <Text style={styles.skipButtonText}>{t.skip}</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
});

export default OnboardingScreen;
