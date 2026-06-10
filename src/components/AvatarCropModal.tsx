import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  clampAvatarCropOffset,
  cropAvatarImage,
  getDisplayScale,
  getFitScale,
  MAX_AVATAR_SCALE_FACTOR,
  MIN_AVATAR_SCALE_FACTOR,
  type AvatarCropTransform,
} from "../utils/cropAvatarImage";
import { getReadableErrorMessage } from "../utils/getReadableErrorMessage";

type Props = {
  visible: boolean;
  imageUri: string;
  imageWidth: number;
  imageHeight: number;
  onCancel: () => void;
  onConfirm: (croppedUri: string) => void | Promise<void>;
};

function touchDistance(
  touches: ReadonlyArray<{ pageX: number; pageY: number }>
): number {
  if (touches.length < 2) {
    return 0;
  }
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

type SharpImageLayerProps = {
  imageUri: string;
  displayWidth: number;
  displayHeight: number;
  offsetX: number;
  offsetY: number;
  anchorX: number;
  anchorY: number;
};

function SharpImageLayer({
  imageUri,
  displayWidth,
  displayHeight,
  offsetX,
  offsetY,
  anchorX,
  anchorY,
}: SharpImageLayerProps) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: anchorX - displayWidth / 2 + offsetX,
        top: anchorY - displayHeight / 2 + offsetY,
        width: displayWidth,
        height: displayHeight,
      }}
    >
      <Image
        source={{ uri: imageUri }}
        style={{ width: displayWidth, height: displayHeight }}
        contentFit="fill"
      />
    </View>
  );
}

export function AvatarCropModal({
  visible,
  imageUri,
  imageWidth,
  imageHeight,
  onCancel,
  onConfirm,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const [stageSize, setStageSize] = useState({ width: screenWidth, height: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scaleFactor, setScaleFactor] = useState(1);
  const [saving, setSaving] = useState(false);

  const offsetRef = useRef(offset);
  const scaleRef = useRef(scaleFactor);
  const pinchStartDistance = useRef<number | null>(null);
  const pinchStartScale = useRef(1);
  const panStartOffset = useRef({ x: 0, y: 0 });
  const fitScaleRef = useRef(1);

  const cropSize = useMemo(() => {
    if (stageSize.height <= 0) {
      return screenWidth * 0.82;
    }
    return Math.min(screenWidth * 0.82, stageSize.height * 0.72);
  }, [screenWidth, stageSize.height]);

  const fitScale = useMemo(
    () =>
      getFitScale(
        imageWidth,
        imageHeight,
        stageSize.width,
        stageSize.height
      ),
    [imageHeight, imageWidth, stageSize.height, stageSize.width]
  );

  fitScaleRef.current = fitScale;

  const applyTransform = useCallback(
    (nextOffset: { x: number; y: number }, nextScale: number) => {
      const clampedScale = Math.min(
        MAX_AVATAR_SCALE_FACTOR,
        Math.max(MIN_AVATAR_SCALE_FACTOR, nextScale)
      );
      const clamped = clampAvatarCropOffset(
        nextOffset.x,
        nextOffset.y,
        imageWidth,
        imageHeight,
        cropSize,
        fitScaleRef.current,
        clampedScale
      );
      const clampedOffset = { x: clamped.offsetX, y: clamped.offsetY };
      offsetRef.current = clampedOffset;
      scaleRef.current = clampedScale;
      setOffset(clampedOffset);
      setScaleFactor(clampedScale);
    },
    [cropSize, imageHeight, imageWidth]
  );

  const displayScale = getDisplayScale(fitScale, scaleFactor);
  const displayWidth = imageWidth * displayScale;
  const displayHeight = imageHeight * displayScale;

  const cropLeft = (stageSize.width - cropSize) / 2;
  const cropTop = (stageSize.height - cropSize) / 2;
  const stageCenterX = stageSize.width / 2;
  const stageCenterY = stageSize.height / 2;
  const cropCenterX = cropLeft + cropSize / 2;
  const cropCenterY = cropTop + cropSize / 2;

  const onStageLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setStageSize({ width, height });
    const nextFit = getFitScale(imageWidth, imageHeight, width, height);
    const nextCrop = Math.min(width * 0.82, height * 0.72);
    const clamped = clampAvatarCropOffset(
      offsetRef.current.x,
      offsetRef.current.y,
      imageWidth,
      imageHeight,
      nextCrop,
      nextFit,
      scaleRef.current
    );
    const nextOffset = { x: clamped.offsetX, y: clamped.offsetY };
    offsetRef.current = nextOffset;
    setOffset(nextOffset);
  }, [imageHeight, imageWidth]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !saving,
        onMoveShouldSetPanResponder: () => !saving,
        onPanResponderGrant: (evt) => {
          panStartOffset.current = { ...offsetRef.current };
          if (evt.nativeEvent.touches.length >= 2) {
            pinchStartDistance.current = touchDistance(evt.nativeEvent.touches);
            pinchStartScale.current = scaleRef.current;
          } else {
            pinchStartDistance.current = null;
          }
        },
        onPanResponderMove: (evt, gestureState) => {
          if (evt.nativeEvent.touches.length >= 2) {
            const distance = touchDistance(evt.nativeEvent.touches);
            if (!pinchStartDistance.current) {
              pinchStartDistance.current = distance;
              pinchStartScale.current = scaleRef.current;
              return;
            }
            const ratio = distance / pinchStartDistance.current;
            applyTransform(offsetRef.current, pinchStartScale.current * ratio);
            return;
          }

          applyTransform(
            {
              x: panStartOffset.current.x + gestureState.dx,
              y: panStartOffset.current.y + gestureState.dy,
            },
            scaleRef.current
          );
        },
        onPanResponderRelease: () => {
          pinchStartDistance.current = null;
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [applyTransform, saving]
  );

  const onUsePhoto = useCallback(async () => {
    const transform: AvatarCropTransform = {
      offsetX: offsetRef.current.x,
      offsetY: offsetRef.current.y,
      scaleFactor: scaleRef.current,
      fitScale: fitScaleRef.current,
    };
    try {
      setSaving(true);
      const croppedUri = await cropAvatarImage(
        imageUri,
        imageWidth,
        imageHeight,
        cropSize,
        transform
      );
      await onConfirm(croppedUri);
    } catch (e) {
      if (__DEV__) {
        console.warn("[AvatarCropModal] crop failed:", e);
      }
      Alert.alert(
        "Bijsnijden mislukt",
        getReadableErrorMessage(e, "Kon de profielfoto niet bijsnijden.")
      );
    } finally {
      setSaving(false);
    }
  }, [cropSize, imageHeight, imageUri, imageWidth, onConfirm]);

  const blurImageStyle = useMemo(
    () =>
      Platform.OS === "web"
        ? ({ filter: "blur(28px) brightness(0.55)" } as Record<string, string>)
        : undefined,
    []
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onCancel}
    >
      <View style={styles.root}>
        <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
          <Text style={styles.headerTitle}>Verplaats en wijzig grootte</Text>
        </View>

        <View
          style={styles.stage}
          onLayout={onStageLayout}
          {...panResponder.panHandlers}
        >
          {stageSize.height > 0 ? (
            <>
              <Image
                source={{ uri: imageUri }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
              {Platform.OS === "ios" ? (
                <Image
                  source={{ uri: imageUri }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  blurRadius={36}
                />
              ) : Platform.OS === "web" ? (
                <Image
                  source={{ uri: imageUri }}
                  style={[StyleSheet.absoluteFill, blurImageStyle]}
                  contentFit="cover"
                />
              ) : (
                <BlurView
                  intensity={85}
                  tint="dark"
                  style={StyleSheet.absoluteFill}
                />
              )}

              <SharpImageLayer
                imageUri={imageUri}
                displayWidth={displayWidth}
                displayHeight={displayHeight}
                offsetX={offset.x}
                offsetY={offset.y}
                anchorX={stageCenterX}
                anchorY={stageCenterY}
              />

              <View
                pointerEvents="none"
                style={styles.dimOverlay}
              />

              <View
                pointerEvents="none"
                style={[
                  styles.cropWindow,
                  {
                    left: cropLeft,
                    top: cropTop,
                    width: cropSize,
                    height: cropSize,
                    borderRadius: cropSize / 2,
                  },
                ]}
              >
                <SharpImageLayer
                  imageUri={imageUri}
                  displayWidth={displayWidth}
                  displayHeight={displayHeight}
                  offsetX={offset.x}
                  offsetY={offset.y}
                  anchorX={cropCenterX - cropLeft}
                  anchorY={cropCenterY - cropTop}
                />
              </View>

              <View
                pointerEvents="none"
                style={[
                  styles.cropRing,
                  {
                    left: cropLeft,
                    top: cropTop,
                    width: cropSize,
                    height: cropSize,
                    borderRadius: cropSize / 2,
                  },
                ]}
              />
            </>
          ) : null}
        </View>

        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(insets.bottom, 18) },
          ]}
        >
          <Pressable
            onPress={onCancel}
            disabled={saving}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Annuleer"
          >
            <Text style={styles.footerAction}>Annuleer</Text>
          </Pressable>

          <Pressable
            onPress={() => void onUsePhoto()}
            disabled={saving}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Kies"
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.footerAction}>Kies</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000000",
  },
  header: {
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 14,
    backgroundColor: "#000000",
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  stage: {
    flex: 1,
    position: "relative",
    overflow: "hidden",
    backgroundColor: "#000000",
  },
  dimOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  cropWindow: {
    position: "absolute",
    overflow: "hidden",
    backgroundColor: "#000000",
  },
  cropRing: {
    position: "absolute",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.55)",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingTop: 14,
    backgroundColor: "#000000",
  },
  footerAction: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "500",
  },
});
