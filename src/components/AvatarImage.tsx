import React from "react";
import { Image as ExpoImage, type ImageContentFit } from "expo-image";
import { type ImageStyle, type StyleProp } from "react-native";
import { resolveAvatarSource } from "../utils/resolveAvatarSource";

type Props = {
  uri?: string | null;
  style: StyleProp<ImageStyle>;
  /** Gebruik expo-image (feed) of react-native Image (profiel e.d.). */
  variant?: "expo" | "native";
  contentFit?: ImageContentFit;
};

export function AvatarImage({
  uri,
  style,
  variant = "native",
  contentFit = "cover",
}: Props) {
  const source = resolveAvatarSource(uri);

  const cachePolicy =
    typeof uri === "string" && uri.trim().length > 0 ? "none" : "memory-disk";

  if (variant === "expo") {
    return (
      <ExpoImage
        source={source}
        style={style}
        contentFit={contentFit}
        cachePolicy={cachePolicy}
      />
    );
  }

  return (
    <ExpoImage
      source={source}
      style={style}
      contentFit={contentFit}
      cachePolicy={cachePolicy}
    />
  );
}
