import React, { useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  NavigationContainer,
  DefaultTheme,
  NavigationContainerRef,
} from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as Linking from "expo-linking";

import { ReelsScreen } from "./src/screens/ReelsScreen";
import { ShopScreen } from "./src/screens/ShopScreen";
import { SearchScreen } from "./src/screens/SearchScreen";
import { ActivityTabScreen } from "./src/screens/TabScreens";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { PublicProfileScreen } from "./src/screens/PublicProfileScreen";
import { ProfileReelsScreen } from "./src/screens/ProfileReelsScreen";
import { SoundReelsScreen } from "./src/screens/SoundReelsScreen";
import { SharedPostScreen } from "./src/screens/SharedPostScreen";
import { CreatorStatsScreen } from "./src/screens/CreatorStatsScreen";
import { MyShopScreen } from "./src/screens/MyShopScreen";
import { ProductFormScreen } from "./src/screens/ProductFormScreen";
import { ProductDetailScreen } from "./src/screens/ProductDetailScreen";
import { OrderDetailScreen } from "./src/screens/OrderDetailScreen";
import { OrderSuccessScreen } from "./src/screens/OrderSuccessScreen";
import { OrderShippedSuccessScreen } from "./src/screens/OrderShippedSuccessScreen";
import { MyOrdersScreen } from "./src/screens/MyOrdersScreen";
import { SellerOrdersScreen } from "./src/screens/SellerOrdersScreen";
import { CheckoutReviewScreen } from "./src/screens/CheckoutReviewScreen";
import { CheckoutFailedScreen } from "./src/screens/CheckoutFailedScreen";
import { CheckoutInfoScreen } from "./src/screens/CheckoutInfoScreen";
import { SellerOnboardingScreen } from "./src/screens/SellerOnboardingScreen";
import { FeedInterestsOnboardingScreen } from "./src/screens/FeedInterestsOnboardingScreen";
import { PolicyDocumentScreen } from "./src/screens/PolicyDocumentScreen";
import { AccountDeletionScreen } from "./src/screens/AccountDeletionScreen";
import { BlockedUsersScreen } from "./src/screens/BlockedUsersScreen";
import { LanguageSettingsScreen } from "./src/screens/LanguageSettingsScreen";
import { ContactSupportScreen } from "./src/screens/ContactSupportScreen";
import { ContactSupportSuccessScreen } from "./src/screens/ContactSupportSuccessScreen";
import { ResetPasswordScreen } from "./src/screens/ResetPasswordScreen";
import { PasswordRecoveryNavigator } from "./src/navigation/PasswordRecoveryNavigator";
import { SellerFulfillmentProvider } from "./src/context/SellerFulfillmentContext";
import { NotificationCenterProvider } from "./src/context/NotificationCenterContext";
import { InAppNotificationProvider } from "./src/context/InAppNotificationContext";
import { BottomNavbar } from "./src/components/BottomNavbar";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { AuthPromptProvider } from "./src/context/AuthPromptContext";
import { GlobalFeedProvider } from "./src/context/GlobalFeedContext";
import { LikesProvider } from "./src/context/LikesContext";
import { UserUploadsProvider } from "./src/context/UserUploadsContext";
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import { LanguageProvider, useLanguage } from "./src/context/LanguageContext";
import { PUBLIC_SHARE_BASE } from "./src/constants/shareLinks";
import { needsFeedInterestOnboarding } from "./src/services/feedInterestsService";
import {
  configurePushNotificationHandlers,
  parsePushOrderDeepLink,
  registerPushTokenIfEnabled,
} from "./src/services/pushNotificationService";

const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();

const linking = {
  prefixes: [Linking.createURL("/"), "lumen-fashion://", PUBLIC_SHARE_BASE],
  config: {
    screens: {
      MainTabs: {
        path: "",
        screens: {
          Home: "home",
        },
      },
      SharedPost: "post/:postId",
      ResetPassword: "auth/reset-password",
      OrderDetail: "order/:orderId",
    },
  },
};

function ThemedNavigationContainer({
  children,
  navigationRef,
  onReady,
}: {
  children: React.ReactNode;
  navigationRef: React.RefObject<NavigationContainerRef<any> | null>;
  onReady: () => void;
}) {
  const { theme } = useTheme();
  const navigationTheme = useMemo(
    () => ({
      ...DefaultTheme,
      colors: {
        ...DefaultTheme.colors,
        background: theme.bg,
        card: theme.bg,
        text: theme.text,
        border: theme.border,
        primary: theme.accent,
      },
    }),
    [theme]
  );

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navigationTheme}
      linking={linking as any}
      onReady={onReady}
    >
      {children}
    </NavigationContainer>
  );
}

function MainTabs() {
  const { theme } = useTheme();
  return (
    <>
      <StatusBar style={theme.statusBarStyle} />
      <Tab.Navigator
        initialRouteName="Home"
        tabBar={(props) => <BottomNavbar {...props} />}
        screenOptions={{
          headerShown: false,
          lazy: true,
        }}
      >
        <Tab.Screen name="Home" component={ReelsScreen} />
        <Tab.Screen name="Shop" component={ShopScreen} />
        <Tab.Screen name="Search" component={SearchScreen} />
        <Tab.Screen name="Activity" component={ActivityTabScreen} />
        <Tab.Screen name="Profile" component={ProfileScreen} />
      </Tab.Navigator>
    </>
  );
}

function AppGate() {
  const { loading, user, loginRequired } = useAuth();
  const { theme, isReady: themeReady } = useTheme();
  const { isReady: languageReady } = useLanguage();
  const navigationRef = useRef<NavigationContainerRef<any>>(null);
  const [navigationReady, setNavigationReady] = useState(false);
  const interestOnboardingCheckedRef = useRef<string | null>(null);

  const navigatorChoice =
    loading || !themeReady || !languageReady
      ? "LoadingSpinner"
      : "MainAppNavigator";

  React.useEffect(() => {
    console.log("[AppGate] navigator state", {
      navigator: navigatorChoice,
      userId: user?.id ?? null,
      bootstrapLoading: loading,
      loginRequired,
      themeReady,
      languageReady,
    });
  }, [
    navigatorChoice,
    user?.id,
    loading,
    loginRequired,
    themeReady,
    languageReady,
  ]);

  React.useEffect(() => {
    void configurePushNotificationHandlers();
  }, []);

  // Cold-start: show the interest picker once for brand-new users. Fails closed
  // (any error → skip), and never re-checks the same user within a session.
  React.useEffect(() => {
    if (!user?.id || !navigationReady) {
      return;
    }
    if (interestOnboardingCheckedRef.current === user.id) {
      return;
    }
    interestOnboardingCheckedRef.current = user.id;
    void (async () => {
      const needs = await needsFeedInterestOnboarding();
      if (needs && navigationRef.current != null) {
        navigationRef.current.navigate("FeedInterestsOnboarding");
      }
    })();
  }, [navigationReady, user?.id]);

  React.useEffect(() => {
    if (!user?.id || !navigationReady) {
      return;
    }
    void registerPushTokenIfEnabled();
  }, [navigationReady, user?.id]);

  React.useEffect(() => {
    if (!navigationReady) {
      return;
    }
    let subscription: { remove: () => void } | null = null;
    void (async () => {
      try {
        const Notifications = await import("expo-notifications");
        subscription = Notifications.addNotificationResponseReceivedListener(
          (response) => {
            const data = response.notification.request.content
              .data as Record<string, unknown> | undefined;
            const deepLink = parsePushOrderDeepLink(data);
            if (!deepLink) {
              return;
            }
            navigationRef.current?.navigate("OrderDetail", {
              orderId: deepLink.orderId,
              focusTracking: deepLink.focusTracking === true,
            });
          }
        );
      } catch {
        // Push module unavailable in Expo Go — in-app banners cover staging tests.
      }
    })();
    return () => subscription?.remove();
  }, [navigationReady]);

  if (loading || !themeReady || !languageReady) {
    console.log("[AppGate] rendering LoadingSpinner", {
      bootstrapLoading: loading,
      userId: user?.id ?? null,
      loginRequired,
    });
    return (
      <View style={[styles.loadingRoot, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  console.log("[AppGate] rendering MainAppNavigator", {
    bootstrapLoading: loading,
    userId: user?.id ?? null,
    loginRequired,
  });

  return (
    <AuthPromptProvider>
      <SellerFulfillmentProvider>
      <NotificationCenterProvider>
      <LikesProvider>
        <GlobalFeedProvider>
          <UserUploadsProvider>
            <InAppNotificationProvider navigationRef={navigationRef}>
            <ThemedNavigationContainer
              navigationRef={navigationRef}
              onReady={() => setNavigationReady(true)}
            >
              <PasswordRecoveryNavigator
                navigationRef={navigationRef}
                navigationReady={navigationReady}
              />
              <RootStack.Navigator
                screenOptions={{
                  headerShown: false,
                }}
              >
                <RootStack.Screen name="MainTabs" component={MainTabs} />
                <RootStack.Screen
                  name="SharedPost"
                  component={SharedPostScreen}
                  options={{
                    animation: "fade",
                    presentation: "fullScreenModal",
                  }}
                />
                <RootStack.Screen
                  name="PublicProfile"
                  component={PublicProfileScreen}
                />
                <RootStack.Screen
                  name="ProfileReels"
                  component={ProfileReelsScreen}
                  options={{
                    animation: "fade",
                    presentation: "fullScreenModal",
                  }}
                />
                <RootStack.Screen
                  name="SoundReels"
                  component={SoundReelsScreen}
                  options={{
                    animation: "fade",
                    presentation: "fullScreenModal",
                  }}
                />
                <RootStack.Screen
                  name="CreatorStats"
                  component={CreatorStatsScreen}
                />
                <RootStack.Screen name="MyShop" component={MyShopScreen} />
                <RootStack.Screen
                  name="ProductForm"
                  component={ProductFormScreen}
                  options={{ presentation: "modal", animation: "slide_from_bottom" }}
                />
                <RootStack.Screen
                  name="ProductDetail"
                  component={ProductDetailScreen}
                  options={{ animation: "slide_from_right" }}
                />
                <RootStack.Screen
                  name="CheckoutReview"
                  component={CheckoutReviewScreen}
                  options={{ animation: "slide_from_right" }}
                />
                <RootStack.Screen
                  name="CheckoutInfo"
                  component={CheckoutInfoScreen}
                  options={{ animation: "slide_from_right" }}
                />
                <RootStack.Screen
                  name="CheckoutFailed"
                  component={CheckoutFailedScreen}
                  options={{ animation: "fade" }}
                />
                <RootStack.Screen
                  name="OrderDetail"
                  component={OrderDetailScreen}
                  options={{ animation: "slide_from_right" }}
                />
                <RootStack.Screen
                  name="OrderSuccess"
                  component={OrderSuccessScreen}
                  options={{ animation: "fade" }}
                />
                <RootStack.Screen
                  name="OrderShippedSuccess"
                  component={OrderShippedSuccessScreen}
                  options={{ animation: "fade" }}
                />
                <RootStack.Screen
                  name="MyOrders"
                  component={MyOrdersScreen}
                  options={{ animation: "slide_from_right" }}
                />
                <RootStack.Screen
                  name="SellerOrders"
                  component={SellerOrdersScreen}
                  options={{ animation: "slide_from_right" }}
                />
                <RootStack.Screen
                  name="SellerOnboarding"
                  component={SellerOnboardingScreen}
                  options={{ animation: "slide_from_right" }}
                />
                <RootStack.Screen
                  name="FeedInterestsOnboarding"
                  component={FeedInterestsOnboardingScreen}
                  options={{
                    animation: "slide_from_bottom",
                    presentation: "fullScreenModal",
                    gestureEnabled: false,
                  }}
                />
                <RootStack.Screen
                  name="PolicyDocument"
                  component={PolicyDocumentScreen}
                  options={{ animation: "slide_from_right" }}
                />
                <RootStack.Screen
                  name="AccountDeletion"
                  component={AccountDeletionScreen}
                  options={{ animation: "slide_from_right" }}
                />
                <RootStack.Screen
                  name="BlockedUsers"
                  component={BlockedUsersScreen}
                  options={{ animation: "slide_from_right" }}
                />
                <RootStack.Screen
                  name="LanguageSettings"
                  component={LanguageSettingsScreen}
                  options={{ animation: "slide_from_right" }}
                />
                <RootStack.Screen
                  name="ContactSupport"
                  component={ContactSupportScreen}
                  options={{ animation: "slide_from_right" }}
                />
                <RootStack.Screen
                  name="ContactSupportSuccess"
                  component={ContactSupportSuccessScreen}
                  options={{ animation: "slide_from_right" }}
                />
                <RootStack.Screen
                  name="ResetPassword"
                  component={ResetPasswordScreen}
                  options={{
                    animation: "slide_from_bottom",
                    presentation: "modal",
                  }}
                />
              </RootStack.Navigator>
            </ThemedNavigationContainer>
            </InAppNotificationProvider>
          </UserUploadsProvider>
        </GlobalFeedProvider>
      </LikesProvider>
      </NotificationCenterProvider>
      </SellerFulfillmentProvider>
    </AuthPromptProvider>
  );
}

export default function App() {
  console.log("[App] root layout mounted", {
    authProviderImport: "./src/context/AuthContext",
    entry: "index.js → App.tsx",
  });

  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <SafeAreaProvider>
        <LanguageProvider>
          <ThemeProvider>
            <AuthProvider>
              <AppGate />
            </AuthProvider>
          </ThemeProvider>
        </LanguageProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  loadingRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
