import React, { useCallback, useState } from "react";
import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { AvatarCropModal } from "../components/AvatarCropModal";
import { getReadableErrorMessage } from "../utils/getReadableErrorMessage";
import { resolveImageDimensions } from "../utils/cropAvatarImage";
import { uploadProfileAvatarUri } from "../utils/uploadProfileAvatar";

type Options = {
  userId: string | undefined;
  onSuccess?: (publicUrl: string) => void;
};

type PendingCrop = {
  uri: string;
  width: number;
  height: number;
};

export function useAvatarPicker({ userId, onSuccess }: Options) {
  const [uploading, setUploading] = useState(false);
  const [pendingCrop, setPendingCrop] = useState<PendingCrop | null>(null);

  const uploadUri = useCallback(
    async (uri: string) => {
      if (!userId) {
        return;
      }
      try {
        setUploading(true);
        const publicUrl = await uploadProfileAvatarUri(userId, uri);
        onSuccess?.(publicUrl);
        Alert.alert("Opgeslagen", "Je profielfoto is bijgewerkt.");
      } catch (e) {
        const msg = getReadableErrorMessage(e, "Upload mislukt.");
        if (__DEV__) {
          console.warn("[AvatarPicker] upload error:", e);
        }
        Alert.alert(
          "Profielfoto uploaden mislukt",
          msg.includes("avatars")
            ? `${msg}\n\nControleer of bucket 'avatars' bestaat en upload policy actief is.`
            : msg
        );
      } finally {
        setUploading(false);
      }
    },
    [onSuccess, userId]
  );

  const beginCrop = useCallback(
    async (asset: ImagePicker.ImagePickerAsset) => {
      if (!asset.uri) {
        return;
      }
      try {
        const dims = await resolveImageDimensions(
          asset.uri,
          asset.width,
          asset.height
        );
        setPendingCrop({
          uri: asset.uri,
          width: dims.width,
          height: dims.height,
        });
      } catch (e) {
        Alert.alert(
          "Foto laden mislukt",
          getReadableErrorMessage(e, "Kon de afmetingen van de foto niet lezen.")
        );
      }
    },
    []
  );

  const pickFromGallery = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Toegang nodig",
        "Sta toegang tot je galerij toe om een profielfoto te kiezen."
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) {
      return;
    }
    await beginCrop(result.assets[0]);
  }, [beginCrop]);

  const takePhoto = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Toegang nodig",
        "Sta camera-toegang toe om een profielfoto te maken."
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.9,
      mediaTypes: ["images"],
    });
    if (result.canceled || !result.assets[0]) {
      return;
    }
    await beginCrop(result.assets[0]);
  }, [beginCrop]);

  const showPicker = useCallback(() => {
    Alert.alert("Profielfoto", "Kies hoe je je profielfoto wilt instellen.", [
      { text: "Annuleren", style: "cancel" },
      { text: "Galerij", onPress: () => void pickFromGallery() },
      { text: "Camera", onPress: () => void takePhoto() },
    ]);
  }, [pickFromGallery, takePhoto]);

  const cropModal = pendingCrop ? (
    <AvatarCropModal
      key={pendingCrop.uri}
      visible
      imageUri={pendingCrop.uri}
      imageWidth={pendingCrop.width}
      imageHeight={pendingCrop.height}
      onCancel={() => setPendingCrop(null)}
      onConfirm={async (croppedUri) => {
        setPendingCrop(null);
        await uploadUri(croppedUri);
      }}
    />
  ) : null;

  return { uploading, showPicker, cropModal };
}
