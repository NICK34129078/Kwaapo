import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
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
import { MyOrdersScreen } from "./src/screens/MyOrdersScreen";
import { CheckoutReviewScreen } from "./src/screens/CheckoutReviewScreen";
import { CheckoutFailedScreen } from "./src/screens/CheckoutFailedScreen";
import { CheckoutInfoScreen } from "./src/screens/CheckoutInfoScreen";
import { SellerOnboardingScreen } from "./src/screens/SellerOnboardingScreen";
import { SellerTermsScreen } from "./src/screens/SellerTermsScreen";
import { PolicyDocumentScreen } from "./src/screens/PolicyDocumentScreen";
import { AccountDeletionScreen } from "./src/screens/AccountDeletionScreen";
import { SellerFulfillmentProvider } from "./src/context/SellerFulfillmentContext";
import { BottomNavbar } from "./src/components/BottomNavbar";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { AuthPromptProvider } from "./src/context/AuthPromptContext";
import { GlobalFeedProvider } from "./src/context/GlobalFeedContext";
import { LikesProvider } from "./src/context/LikesContext";
import { UserUploadsProvider } from "./src/context/UserUploadsContext";
import { theme } from "./src/constants/theme";
import { PUBLIC_SHARE_BASE } from "./src/constants/shareLinks";

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
    },
  },
};

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: theme.bg,
    card: theme.bg,
    text: theme.text,
    border: theme.border,
    primary: theme.accent,
  },
};

function MainTabs() {
  return (
    <>
      <StatusBar style="light" />
      <Tab.Navigator
        initialRouteName="Home"
        tabBar={(props) => <BottomNavbar {...props} />}
        screenOptions={{
          headerShown: false,
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
  const { loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <AuthPromptProvider>
      <SellerFulfillmentProvider>
      <LikesProvider>
        <GlobalFeedProvider>
          <UserUploadsProvider>
            <NavigationContainer
              theme={navTheme}
              linking={linking as any}
            >
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
                  name="MyOrders"
                  component={MyOrdersScreen}
                  options={{ animation: "slide_from_right" }}
                />
                <RootStack.Screen
                  name="SellerOnboarding"
                  component={SellerOnboardingScreen}
                  options={{ animation: "slide_from_right" }}
                />
                <RootStack.Screen
                  name="SellerTerms"
                  component={SellerTermsScreen}
                  options={{ animation: "slide_from_right" }}
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
              </RootStack.Navigator>
            </NavigationContainer>
          </UserUploadsProvider>
        </GlobalFeedProvider>
      </LikesProvider>
      </SellerFulfillmentProvider>
    </AuthPromptProvider>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <SafeAreaProvider>
        <AuthProvider>
          <AppGate />
        </AuthProvider>
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
    backgroundColor: theme.bg,
    alignItems: "center",
    justifyContent: "center",
  },
});
