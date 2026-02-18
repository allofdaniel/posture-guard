// Premium Features Manager for Posture Guard
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as RNIap from 'react-native-iap';

// Product IDs - must match Google Play Console
export const PRODUCT_IDS = {
  PREMIUM_LIFETIME: 'posture_guard_premium_lifetime',
  PREMIUM_MONTHLY: 'posture_guard_premium_monthly',
  AD_REMOVAL: 'posture_guard_ad_removal',
};

// Premium feature definitions
export const PREMIUM_FEATURES = {
  AD_FREE: 'ad_free',
  UNLIMITED_SESSIONS: 'unlimited_sessions',
  ADVANCED_STATS: 'advanced_stats',
  CUSTOM_THEMES: 'custom_themes',
  DATA_EXPORT: 'data_export',
  BACKGROUND_MONITORING: 'background_monitoring',
};

// Storage keys
const STORAGE_KEYS = {
  PREMIUM_STATUS: 'premium_status',
  PURCHASE_HISTORY: 'purchase_history',
};

class PremiumManager {
  constructor() {
    this.isInitialized = false;
    this.products = [];
    this.purchasedProducts = [];
    this.purchaseUpdateSubscription = null;
    this.purchaseErrorSubscription = null;
  }

  async initialize() {
    if (Platform.OS !== 'android') {
      console.log('IAP only supported on Android');
      return false;
    }

    try {
      await RNIap.initConnection();
      this.isInitialized = true;

      // Set up purchase listeners
      this.purchaseUpdateSubscription = RNIap.purchaseUpdatedListener(
        async (purchase) => {
          await this.handlePurchaseUpdate(purchase);
        }
      );

      this.purchaseErrorSubscription = RNIap.purchaseErrorListener(
        (error) => {
          console.warn('Purchase error:', error);
        }
      );

      // Load products
      await this.loadProducts();

      // Restore purchases
      await this.restorePurchases();

      return true;
    } catch (error) {
      console.error('IAP initialization error:', error);
      return false;
    }
  }

  async loadProducts() {
    try {
      const productIds = Object.values(PRODUCT_IDS);

      // Get non-subscription products
      const products = await RNIap.getProducts({ skus: productIds });

      // Get subscription products
      const subscriptions = await RNIap.getSubscriptions({
        skus: [PRODUCT_IDS.PREMIUM_MONTHLY],
      });

      this.products = [...products, ...subscriptions];
      return this.products;
    } catch (error) {
      console.error('Load products error:', error);
      return [];
    }
  }

  async handlePurchaseUpdate(purchase) {
    try {
      if (purchase.purchaseStateAndroid === 1) {
        // Purchase successful
        await RNIap.acknowledgePurchaseAndroid({ token: purchase.purchaseToken });

        // Save purchase locally
        await this.savePurchase(purchase);

        // Update purchased products list
        this.purchasedProducts.push(purchase.productId);
      }
    } catch (error) {
      console.error('Handle purchase update error:', error);
    }
  }

  async savePurchase(purchase) {
    try {
      const history = await this.getPurchaseHistory();
      history.push({
        productId: purchase.productId,
        purchaseToken: purchase.purchaseToken,
        purchaseTime: purchase.transactionDate,
      });
      await AsyncStorage.setItem(STORAGE_KEYS.PURCHASE_HISTORY, JSON.stringify(history));
      await this.updatePremiumStatus();
    } catch (error) {
      console.error('Save purchase error:', error);
    }
  }

  async getPurchaseHistory() {
    try {
      const history = await AsyncStorage.getItem(STORAGE_KEYS.PURCHASE_HISTORY);
      return history ? JSON.parse(history) : [];
    } catch (error) {
      return [];
    }
  }

  async updatePremiumStatus() {
    const isPremium = await this.checkPremiumStatus();
    await AsyncStorage.setItem(
      STORAGE_KEYS.PREMIUM_STATUS,
      JSON.stringify({ isPremium, lastChecked: Date.now() })
    );
  }

  async checkPremiumStatus() {
    // Check if user has any premium purchase
    return this.purchasedProducts.some(
      (id) =>
        id === PRODUCT_IDS.PREMIUM_LIFETIME ||
        id === PRODUCT_IDS.PREMIUM_MONTHLY
    );
  }

  async hasFeature(feature) {
    // Ad removal is separate from premium
    if (feature === PREMIUM_FEATURES.AD_FREE) {
      return this.purchasedProducts.includes(PRODUCT_IDS.AD_REMOVAL) ||
             this.purchasedProducts.includes(PRODUCT_IDS.PREMIUM_LIFETIME) ||
             this.purchasedProducts.includes(PRODUCT_IDS.PREMIUM_MONTHLY);
    }

    // All other features require premium
    return await this.checkPremiumStatus();
  }

  async purchaseProduct(productId) {
    if (!this.isInitialized) {
      throw new Error('IAP not initialized');
    }

    try {
      if (productId === PRODUCT_IDS.PREMIUM_MONTHLY) {
        // Subscription purchase
        await RNIap.requestSubscription({
          sku: productId,
          subscriptionOffers: [{ sku: productId, offerToken: '' }],
        });
      } else {
        // One-time purchase
        await RNIap.requestPurchase({ skus: [productId] });
      }
    } catch (error) {
      console.error('Purchase error:', error);
      throw error;
    }
  }

  async restorePurchases() {
    if (!this.isInitialized) {
      return [];
    }

    try {
      const purchases = await RNIap.getAvailablePurchases();
      this.purchasedProducts = purchases.map((p) => p.productId);
      await this.updatePremiumStatus();
      return purchases;
    } catch (error) {
      console.error('Restore purchases error:', error);
      return [];
    }
  }

  getProducts() {
    return this.products;
  }

  getProductById(productId) {
    return this.products.find((p) => p.productId === productId);
  }

  async isPremium() {
    try {
      const status = await AsyncStorage.getItem(STORAGE_KEYS.PREMIUM_STATUS);
      if (status) {
        const { isPremium } = JSON.parse(status);
        return isPremium;
      }
      return await this.checkPremiumStatus();
    } catch (error) {
      return false;
    }
  }

  async isAdFree() {
    return await this.hasFeature(PREMIUM_FEATURES.AD_FREE);
  }

  cleanup() {
    if (this.purchaseUpdateSubscription) {
      this.purchaseUpdateSubscription.remove();
    }
    if (this.purchaseErrorSubscription) {
      this.purchaseErrorSubscription.remove();
    }
    if (this.isInitialized) {
      RNIap.endConnection();
    }
  }
}

// Singleton instance
const premiumManager = new PremiumManager();
export default premiumManager;

// Helper functions for easy access
export const initializePremium = () => premiumManager.initialize();
export const isPremium = () => premiumManager.isPremium();
export const isAdFree = () => premiumManager.isAdFree();
export const hasFeature = (feature) => premiumManager.hasFeature(feature);
export const purchaseProduct = (productId) => premiumManager.purchaseProduct(productId);
export const restorePurchases = () => premiumManager.restorePurchases();
export const getProducts = () => premiumManager.getProducts();
export const cleanupPremium = () => premiumManager.cleanup();
