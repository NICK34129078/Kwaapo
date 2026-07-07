import React, { useEffect, useRef } from "react";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";
import { StyleSheet, View } from "react-native";
import { Video, ResizeMode } from "expo-av";

type Props = {
  videoUrl: string;
  videoId: string;
};

/**
 * iOS / Android: expo-av with a real remote MP4 `uri` (public Worker URL).
 */
export function FullscreenVideoPlayer({ videoUrl, videoId }: Props) {
  const styles = useThemedStyles(createStyles);

  const avRef = useRef<InstanceType<typeof Video> | null>(null);

  useEffect(() => {
    if (__DEV__) {
      console.log("[VideoViewer] mount, videoId:", videoId);
      console.log("[VideoViewer] before render, videoUrl:", videoUrl);
    }
  }, [videoId, videoUrl]);

  useEffect(() => {
    return () => {
      void avRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  return (
    <View style={styles.nativeWrap}>
      <Video
        key={`${videoId}:remote`}
        ref={avRef as React.MutableRefObject<InstanceType<typeof Video> | null>}
        source={{ uri: videoUrl }}
        style={styles.nativeVideo}
        resizeMode={ResizeMode.CONTAIN}
        useNativeControls
        shouldPlay
        isLooping={false}
        onLoad={() => {
          if (__DEV__) {
            console.log("[VideoViewer] expo-av onLoad", videoUrl);
          }
        }}
        onError={(e) => {
          if (__DEV__) {
            console.warn("[VideoViewer] videoUrl playback failed", e, "url", videoUrl);
          }
        }}
      />
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  nativeWrap: {
    flex: 1,
    width: "100%",
  },
  nativeVideo: {
    width: "100%",
    flex: 1,
    minHeight: 200,
    backgroundColor: theme.bg,
  },
});
}

