import React, { useCallback } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../constants/theme";

type FailureReason = "cancelled" | "failed" | "pending";

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.bg,
      paddingHorizontal: 20,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: "center",
    },
    iconWrap: {
      alignItems: "center",
      marginBottom: 20,
    },
    iconCircle: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: theme.bgElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      alignItems: "center",
      justifyContent: "center",
    },
    title: {
      color: theme.text,
      fontSize: 26,
      fontWeight: "900",
      textAlign: "center",
      marginBottom: 10,
    },
    message: {
      color: theme.textMuted,
      fontSize: 15,
      lineHeight: 22,
      textAlign: "center",
      marginBottom: 28,
      paddingHorizontal: 8,
    },
    primaryBtn: {
      minHeight: 52,
      borderRadius: 14,
      backgroundColor: theme.accent,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    primaryBtnText: {
      color: theme.bg,
      fontSize: 16,
      fontWeight: "900",
    },
    secondaryBtn: {
      minHeight: 52,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      backgroundColor: theme.bgElevated,
    },
    secondaryBtnText: {
      color: theme.text,
      fontSize: 16,
      fontWeight: "800",
    },
  });
}

export function CheckoutFailedScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const reasonParam = route.params?.reason;
  const reason: FailureReason =
    reasonParam === "failed"
      ? "failed"
      : reasonParam === "pending"
        ? "pending"
        : "cancelled";
  const orderId: string | undefined = route.params?.orderId;
  const productId: string | undefined = route.params?.productId;
  const pendingMessage: string | undefined = route.params?.message;

  const title =
    reason === "pending"
      ? "Betaling wordt verwerkt"
      : reason === "cancelled"
        ? "Betaling niet afgerond"
        : "Betaling mislukt";
  const message =
    reason === "pending"
      ? (pendingMessage ??
        "Je betaling kan nog worden verwerkt. Voorraad blijft tijdelijk gereserveerd tot Stripe de sessie afsluit.")
      : reason === "cancelled"
        ? "De betaling is niet afgerond. Er is nog niets in rekening gebracht. Voorraad wordt vrijgegeven zodra de betaalsessie verloopt."
        : "De betaling kon niet worden voltooid. Er is nog niets in rekening gebracht.";

  const onRetry = useCallback(() => {
    if (orderId) {
      navigation.replace("OrderDetail", { orderId });
      return;
    }
    if (productId) {
      navigation.replace("CheckoutReview", { productId });
      return;
    }
    navigation.goBack();
  }, [navigation, orderId, productId]);

  const onBackToProduct = useCallback(() => {
    if (productId) {
      navigation.replace("ProductDetail", { productId });
      return;
    }
    navigation.goBack();
  }, [navigation, productId]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 24 }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.iconWrap}>
          <View style={styles.iconCircle}>
            <Ionicons
              name={
                reason === "pending"
                  ? "time-outline"
                  : reason === "cancelled"
                    ? "close"
                    : "alert-circle-outline"
              }
              size={44}
              color={theme.textMuted}
            />
          </View>
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>

        <Pressable
          style={styles.primaryBtn}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Opnieuw proberen"
        >
          <Text style={styles.primaryBtnText}>
            {reason === "pending" ? "Bekijk bestelling" : "Opnieuw proberen"}
          </Text>
        </Pressable>
        <Pressable
          style={styles.secondaryBtn}
          onPress={onBackToProduct}
          accessibilityRole="button"
          accessibilityLabel="Terug naar product"
        >
          <Text style={styles.secondaryBtnText}>Terug naar product</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
