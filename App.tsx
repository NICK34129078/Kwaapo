import React from "react";
import { StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { ReelsScreen } from "./src/screens/ReelsScreen";
import { ActivityTabScreen } from "./src/screens/TabScreens";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { BottomNavbar } from "./src/components/BottomNavbar";
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

export default function App() {
  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <SafeAreaProvider>
        <UserUploadsProvider>
        <LikesProvider>
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
        </LikesProvider>
        </UserUploadsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
});
