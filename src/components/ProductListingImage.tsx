import { Image, type ImageContentFit } from "expo-image";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, View, type ImageStyle, type StyleProp } from "react-native";

type Props = {
  uri?: string | null;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  recyclingKey?: string;
};

/**
 * Betrouwbare productfoto (Shop / profiel-winkel / detail).
 * Geen opacity-0 fade — voorkomt zwart scherm op web wanneer onLoad niet opnieuw firet.
 */
export function ProductListingImage({
  uri,
  style,
  contentFit = "cover",
  recyclingKey,
}: Props) {
  const { theme } = useTheme();

  const styles = useThemedStyles(createStyles);

  if (!uri) {
    return (
      <View style={[styles.fallback, style]}>
        <Ionicons name="image-outline" size={30} color={theme.textMuted} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[styles.image, style]}
      contentFit={contentFit}
      transition={150}
      cachePolicy="memory-disk"
      recyclingKey={recyclingKey ?? uri}
    />
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  image: {
    width: "100%",
    height: "100%",
  },
  fallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.bgElevated,
  },
});
}

