# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Add any project specific keep options here:

# Posture Guard native modules
-keep class com.allofdaniel.postureguard.PipModule { *; }
-keep class com.allofdaniel.postureguard.WidgetModule { *; }
-keep class com.allofdaniel.postureguard.PostureWidgetProvider { *; }
-keep class com.allofdaniel.postureguard.PipPackage { *; }
-keep class com.allofdaniel.postureguard.WidgetPackage { *; }

# Vision Camera
-keep class com.mrousavy.camera.** { *; }
-keep class com.mrousavy.camera.core.** { *; }

# Google Mobile Ads
-keep class com.google.android.gms.ads.** { *; }
-keep class com.google.ads.** { *; }

# React Native IAP
-keep class com.dooboolab.rniap.** { *; }

# Worklets Core
-keep class com.margelo.worklets.** { *; }

# Keep JavaScript interface methods
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod *;
}
