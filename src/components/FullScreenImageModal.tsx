import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../constants/theme";

type Props = {
  visible: boolean;
  imageUri: string | null | undefined;
  onClose: () => void;
};

function getContainedSize(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number
) {
  if (imageWidth <= 0 || imageHeight <= 0) {
    return { width: containerWidth, height: containerHeight };
  }

  const scale = Math.min(
    containerWidth / imageWidth,
    containerHeight / imageHeight
  );

  return {
    width: imageWidth * scale,
    height: imageHeight * scale,
  };
}

export function FullScreenImageModal({ visible, imageUri, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const uri = typeof imageUri === "string" ? imageUri.trim() : "";
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    setNaturalSize({ width: 0, height: 0 });
  }, [uri, visible]);

  const containerWidth = width;
  const containerHeight = height - insets.top - insets.bottom;
  const displaySize = useMemo(
    () =>
      getContainedSize(
        containerWidth,
        containerHeight,
        naturalSize.width,
        naturalSize.height
      ),
    [containerHeight, containerWidth, naturalSize.height, naturalSize.width]
  );
  const imageHitboxReady = naturalSize.width > 0 && naturalSize.height > 0;

  if (!uri) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Sluiten"
        />

        <View
          style={[styles.imageStage, { height: containerHeight }]}
          pointerEvents="box-none"
        >
          <View
            style={{
              width: displaySize.width,
              height: displaySize.height,
            }}
            pointerEvents={imageHitboxReady ? "auto" : "none"}
          >
            <Image
              source={{ uri }}
              style={styles.image}
              contentFit="contain"
              cachePolicy="none"
              accessibilityLabel="Profielfoto op volledig scherm"
              onLoad={(event) => {
                const { width: loadedWidth, height: loadedHeight } =
                  event.source;
                if (loadedWidth > 0 && loadedHeight > 0) {
                  setNaturalSize({
                    width: loadedWidth,
                    height: loadedHeight,
                  });
                }
              }}
            />
          </View>
        </View>

        <Pressable
          style={[styles.closeBtn, { top: insets.top + 8 }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Sluiten"
        >
          <Ionicons name="close" size={28} color={theme.text} />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
  },
  imageStage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  closeBtn: {
    position: "absolute",
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
});
