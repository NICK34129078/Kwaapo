import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { ReelsScreen } from "./src/screens/ReelsScreen";
import { ActivityTabScreen } from "./src/screens/TabScreens";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { AuthScreen } from "./src/screens/AuthScreen";
import { BottomNavbar } from "./src/components/BottomNavbar";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { LikesProvider } from "./src/context/LikesContext";
import { UserUploadsProvider } from "./src/context/UserUploadsContext";
import { theme } from "./src/constants/theme";

const Tab = createBottomTabNavigator();

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
    <NavigationContainer theme={navTheme}>
      <StatusBar style="light" />
      <Tab.Navigator
        initialRouteName="Home"
        tabBar={(props) => <BottomNavbar {...props} />}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Tab.Screen name="Home" component={ReelsScreen} />
        <Tab.Screen name="Activity" component={ActivityTabScreen} />
        <Tab.Screen name="Profile" component={ProfileScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

function AppGate() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  if (user == null) {
    return <AuthScreen />;
  }

  return (
    <UserUploadsProvider>
      <LikesProvider>
        <MainTabs />
      </LikesProvider>
    </UserUploadsProvider>
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
