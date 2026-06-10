import type { ImageSourcePropType } from "react-native";

/** Standaard Kwaapo-profielafbeelding wanneer geen upload is ingesteld. */
export const DEFAULT_AVATAR_SOURCE = require("../../assets/default-avatar.png") as ImageSourcePropType;

export function hasProfileAvatar(url?: string | null): url is string {
  return typeof url === "string" && url.trim().length > 0;
}

export function resolveAvatarSource(url?: string | null): ImageSourcePropType {
  if (hasProfileAvatar(url)) {
    return { uri: url.trim() };
  }
  return DEFAULT_AVATAR_SOURCE;
}
