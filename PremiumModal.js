// PremiumModal.js - Premium upgrade UI for Posture Guard
import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  PRODUCT_IDS,
  PREMIUM_FEATURES,
  initializePremium,
  getProducts,
  purchaseProduct,
  restorePurchases,
  isPremium,
} from './PremiumManager';

const PremiumModal = ({ visible, onClose, lang = 'en' }) => {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [purchasing, setPurchasing] = useState(false);
  const [userIsPremium, setUserIsPremium] = useState(false);

  const t = {
    en: {
      title: 'Upgrade to Premium',
      subtitle: 'Unlock all features and remove ads',
      features: {
        [PREMIUM_FEATURES.AD_FREE]: 'Ad-free experience',
        [PREMIUM_FEATURES.UNLIMITED_SESSIONS]: 'Unlimited monitoring sessions',
        [PREMIUM_FEATURES.ADVANCED_STATS]: 'Advanced statistics & graphs',
        [PREMIUM_FEATURES.CUSTOM_THEMES]: 'Custom themes',
        [PREMIUM_FEATURES.DATA_EXPORT]: 'Export your data',
        [PREMIUM_FEATURES.BACKGROUND_MONITORING]: 'Background monitoring',
      },
      lifetime: 'Lifetime Access',
      lifetimeDesc: 'One-time payment, forever yours',
      monthly: 'Monthly Premium',
      monthlyDesc: 'Cancel anytime',
      adRemoval: 'Remove Ads Only',
      adRemovalDesc: 'Keep it simple',
      restore: 'Restore Purchases',
      close: 'Maybe Later',
      premiumActive: 'Premium Active',
      premiumActiveDesc: 'Thank you for your support!',
      purchaseError: 'Purchase failed. Please try again.',
      restoreSuccess: 'Purchases restored successfully!',
      restoreEmpty: 'No previous purchases found.',
    },
    ko: {
      title: '프리미엄 업그레이드',
      subtitle: '모든 기능을 잠금 해제하고 광고를 제거하세요',
      features: {
        [PREMIUM_FEATURES.AD_FREE]: '광고 없는 경험',
        [PREMIUM_FEATURES.UNLIMITED_SESSIONS]: '무제한 모니터링 세션',
        [PREMIUM_FEATURES.ADVANCED_STATS]: '고급 통계 및 그래프',
        [PREMIUM_FEATURES.CUSTOM_THEMES]: '사용자 정의 테마',
        [PREMIUM_FEATURES.DATA_EXPORT]: '데이터 내보내기',
        [PREMIUM_FEATURES.BACKGROUND_MONITORING]: '백그라운드 모니터링',
      },
      lifetime: '평생 이용권',
      lifetimeDesc: '일회성 결제로 영원히 사용',
      monthly: '월간 프리미엄',
      monthlyDesc: '언제든지 취소 가능',
      adRemoval: '광고만 제거',
      adRemovalDesc: '심플하게 유지',
      restore: '구매 복원',
      close: '나중에',
      premiumActive: '프리미엄 활성화됨',
      premiumActiveDesc: '이용해 주셔서 감사합니다!',
      purchaseError: '구매에 실패했습니다. 다시 시도해 주세요.',
      restoreSuccess: '구매가 성공적으로 복원되었습니다!',
      restoreEmpty: '이전 구매 내역이 없습니다.',
    },
  }[lang] || {};

  useEffect(() => {
    if (visible) {
      loadData();
    }
  }, [visible]);

  const loadData = async () => {
    setLoading(true);
    try {
      await initializePremium();
      const prods = getProducts();
      setProducts(prods);
      const premium = await isPremium();
      setUserIsPremium(premium);
    } catch (error) {
      console.error('Load premium data error:', error);
    }
    setLoading(false);
  };

  const handlePurchase = async (productId) => {
    setPurchasing(true);
    try {
      await purchaseProduct(productId);
      const premium = await isPremium();
      setUserIsPremium(premium);
      if (premium) {
        Alert.alert('Success', 'Thank you for your purchase!');
      }
    } catch (error) {
      Alert.alert('Error', t.purchaseError);
    }
    setPurchasing(false);
  };

  const handleRestore = async () => {
    setLoading(true);
    try {
      const purchases = await restorePurchases();
      if (purchases.length > 0) {
        const premium = await isPremium();
        setUserIsPremium(premium);
        Alert.alert('Success', t.restoreSuccess);
      } else {
        Alert.alert('Info', t.restoreEmpty);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to restore purchases');
    }
    setLoading(false);
  };

  const getProductPrice = (productId) => {
    const product = products.find((p) => p.productId === productId);
    return product?.localizedPrice || '--';
  };

  const renderFeatureList = () => (
    <View style={styles.featureList}>
      {Object.values(PREMIUM_FEATURES).map((feature) => (
        <View key={feature} style={styles.featureItem}>
          <Text style={styles.featureCheck}>✓</Text>
          <Text style={styles.featureText}>{t.features[feature]}</Text>
        </View>
      ))}
    </View>
  );

  const renderPurchaseOptions = () => (
    <View style={styles.purchaseOptions}>
      {/* Lifetime */}
      <TouchableOpacity
        style={[styles.purchaseButton, styles.lifetimeButton]}
        onPress={() => handlePurchase(PRODUCT_IDS.PREMIUM_LIFETIME)}
        disabled={purchasing}
      >
        <View style={styles.purchaseButtonContent}>
          <Text style={styles.purchaseTitle}>{t.lifetime}</Text>
          <Text style={styles.purchaseDesc}>{t.lifetimeDesc}</Text>
        </View>
        <Text style={styles.purchasePrice}>
          {getProductPrice(PRODUCT_IDS.PREMIUM_LIFETIME)}
        </Text>
      </TouchableOpacity>

      {/* Monthly */}
      <TouchableOpacity
        style={[styles.purchaseButton, styles.monthlyButton]}
        onPress={() => handlePurchase(PRODUCT_IDS.PREMIUM_MONTHLY)}
        disabled={purchasing}
      >
        <View style={styles.purchaseButtonContent}>
          <Text style={styles.purchaseTitle}>{t.monthly}</Text>
          <Text style={styles.purchaseDesc}>{t.monthlyDesc}</Text>
        </View>
        <Text style={styles.purchasePrice}>
          {getProductPrice(PRODUCT_IDS.PREMIUM_MONTHLY)}/mo
        </Text>
      </TouchableOpacity>

      {/* Ad Removal Only */}
      <TouchableOpacity
        style={[styles.purchaseButton, styles.adRemovalButton]}
        onPress={() => handlePurchase(PRODUCT_IDS.AD_REMOVAL)}
        disabled={purchasing}
      >
        <View style={styles.purchaseButtonContent}>
          <Text style={styles.purchaseTitle}>{t.adRemoval}</Text>
          <Text style={styles.purchaseDesc}>{t.adRemovalDesc}</Text>
        </View>
        <Text style={styles.purchasePrice}>
          {getProductPrice(PRODUCT_IDS.AD_REMOVAL)}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.crown}>👑</Text>
              <Text style={styles.title}>{t.title}</Text>
              <Text style={styles.subtitle}>{t.subtitle}</Text>
            </View>

            {loading ? (
              <ActivityIndicator size="large" color="#10B981" style={styles.loader} />
            ) : userIsPremium ? (
              <View style={styles.premiumActive}>
                <Text style={styles.premiumActiveIcon}>✨</Text>
                <Text style={styles.premiumActiveTitle}>{t.premiumActive}</Text>
                <Text style={styles.premiumActiveDesc}>{t.premiumActiveDesc}</Text>
              </View>
            ) : (
              <>
                {renderFeatureList()}
                {renderPurchaseOptions()}
              </>
            )}

            {/* Restore */}
            <TouchableOpacity
              style={styles.restoreButton}
              onPress={handleRestore}
              disabled={loading}
            >
              <Text style={styles.restoreText}>{t.restore}</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Close button */}
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>{t.close}</Text>
          </TouchableOpacity>

          {purchasing && (
            <View style={styles.purchasingOverlay}>
              <ActivityIndicator size="large" color="#10B981" />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxHeight: '90%',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  crown: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
  },
  featureList: {
    marginBottom: 24,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureCheck: {
    color: '#10B981',
    fontSize: 16,
    marginRight: 12,
    fontWeight: 'bold',
  },
  featureText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  purchaseOptions: {
    gap: 12,
    marginBottom: 16,
  },
  purchaseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
  },
  lifetimeButton: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: '#10B981',
  },
  monthlyButton: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderColor: '#3B82F6',
  },
  adRemovalButton: {
    backgroundColor: 'rgba(148, 163, 184, 0.1)',
    borderColor: '#475569',
  },
  purchaseButtonContent: {
    flex: 1,
  },
  purchaseTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  purchaseDesc: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 4,
  },
  purchasePrice: {
    color: '#10B981',
    fontSize: 18,
    fontWeight: 'bold',
  },
  restoreButton: {
    alignItems: 'center',
    padding: 12,
    marginTop: 8,
  },
  restoreText: {
    color: '#64748B',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  closeButton: {
    alignItems: 'center',
    padding: 16,
    marginTop: 8,
    backgroundColor: '#334155',
    borderRadius: 12,
  },
  closeText: {
    color: '#94A3B8',
    fontSize: 16,
    fontWeight: '600',
  },
  loader: {
    marginVertical: 40,
  },
  premiumActive: {
    alignItems: 'center',
    padding: 24,
  },
  premiumActiveIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  premiumActiveTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#10B981',
    marginBottom: 8,
  },
  premiumActiveDesc: {
    fontSize: 14,
    color: '#94A3B8',
  },
  purchasingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
  },
});

export default PremiumModal;
