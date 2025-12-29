import React, { useState, useCallback, Component } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

const BANNER_AD_UNIT_ID = __DEV__ ? TestIds.BANNER : 'ca-app-pub-7278941489904900/5206159407';

// Error Boundary to catch crashes in ad component
class AdErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.warn('AdBanner Error Boundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <View style={styles.adPlaceholder} />;
    }
    return this.props.children;
  }
}

function AdBannerContent() {
  const [adError, setAdError] = useState(false);

  const handleAdFailedToLoad = useCallback((error) => {
    console.warn('Ad failed to load:', error);
    setAdError(true);
  }, []);

  const handleAdLoaded = useCallback(() => {
    setAdError(false);
  }, []);

  if (Platform.OS === 'web') {
    return null;
  }

  if (adError) {
    return <View style={styles.adPlaceholder} />;
  }

  return (
    <View style={styles.adContainer} accessibilityLabel="Advertisement banner">
      <BannerAd
        unitId={BANNER_AD_UNIT_ID}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
        onAdLoaded={handleAdLoaded}
        onAdFailedToLoad={handleAdFailedToLoad}
      />
    </View>
  );
}

export default function AdBanner() {
  return (
    <AdErrorBoundary>
      <AdBannerContent />
    </AdErrorBoundary>
  );
}

const styles = StyleSheet.create({
  adContainer: {
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingBottom: Platform.OS === 'ios' ? 0 : 8,
  },
  adPlaceholder: {
    height: 60,
    backgroundColor: '#0F172A',
  },
});
