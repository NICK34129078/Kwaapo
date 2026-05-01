import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PressableScale } from "./PressableScale";
import { theme } from "../constants/theme";
import { useCloudVideoUpload } from "../hooks/useCloudVideoUpload";

/** Floating "+" for cloud video upload; sits above the tab bar on the home reels feed. */
export function ReelsVideoUploadFab() {
  const insets = useSafeAreaInsets();
  const { isUploading, pickAndUploadVideo } = useCloudVideoUpload();

  const bottomOffset = insets.bottom + 56;

  return (
    <>
      {isUploading ? (
        <View
          style={[styles.uploadBanner, { paddingTop: insets.top + 12 }]}
          pointerEvents="none"
        >
          <ActivityIndicator size="small" color={theme.text} />
          <Text style={styles.uploadBannerText}>Uploading...</Text>
        </View>
      ) : null}

      <View
        style={[styles.fabWrap, { bottom: bottomOffset, right: 16 }]}
        pointerEvents="box-none"
      >
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Upload video"
          accessibilityState={{ disabled: isUploading }}
          onPress={pickAndUploadVideo}
          disabled={isUploading}
          style={[styles.fab, isUploading && styles.fabDisabled]}
          scaleTo={0.94}
        >
          <Ionicons name="add" size={32} color={theme.text} />
        </PressableScale>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  uploadBanner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingBottom: 10,
    backgroundColor: "rgba(11,11,11,0.85)",
  },
  uploadBannerText: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "600",
  },
  fabWrap: {
    position: "absolute",
    zIndex: 30,
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.22)",
  },
  fabDisabled: {
    opacity: 0.55,
  },
});
