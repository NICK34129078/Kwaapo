import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";

type Props = {
  videoUrl: string;
  videoId: string;
};

/**
 * Web: native HTML5 &lt;video&gt; so the browser can decode and play the remote MP4.
 */
export function FullscreenVideoPlayer({ videoUrl, videoId }: Props) {
  useEffect(() => {
    if (__DEV__) {
      console.log("[VideoViewer] mount, videoId:", videoId);
      console.log("[VideoViewer] before render, videoUrl:", videoUrl);
    }
  }, [videoId, videoUrl]);

  if (__DEV__) {
    console.log("[VideoViewer] rendering <video> src =", videoUrl);
  }

  return (
    <View style={styles.wrap}>
      <video
        key={videoId}
        style={styles.video as object}
        src={videoUrl}
        controls
        autoPlay
        playsInline
        muted
        crossOrigin="anonymous"
        onLoadedData={() => {
          if (__DEV__) {
            console.log("[VideoViewer] web onLoadedData OK", videoUrl);
          }
        }}
        onError={() => {
          if (__DEV__) {
            console.warn("[VideoViewer] web onError", videoUrl);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    width: "100%",
    minHeight: 200,
  },
  video: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    backgroundColor: "#000",
  },
});
