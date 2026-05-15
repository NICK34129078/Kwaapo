import React, {
  useRef,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Alert,
  Easing,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import {
  useUserUploads,
  type UserVideoPost,
} from "../context/UserUploadsContext";
import type { ProfilePostMediaItem } from "../types/userVideoPost";
import { FullscreenVideoPlayer } from "../components/FullscreenVideoPlayer";
import { useCloudImageCarouselUpload } from "../hooks/useCloudImageCarouselUpload";
import { useCloudVideoUpload } from "../hooks/useCloudVideoUpload";
import { theme } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { useAuthPrompt } from "../context/AuthPromptContext";
import { EditProfileScreen } from "./EditProfileScreen";
import { supabase } from "../lib/supabase";
import { fetchUserPosts } from "../services/postsService";
import {
  fetchMyTagPreferences,
  type MyTagPreference,
} from "../services/algorithmInsightsService";

const GAP = 2;
type ProfileRow = {
  avatar_url: string | null;
  username: string | null;
  display_name: string | null;
  bio: string | null;
};

type FollowListMode = "followers" | "following";
type FollowListProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

function getReadableErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  if (error && typeof error === "object") {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim().length > 0) {
      return maybeMessage;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function GuestProfileScreen() {
  const insets = useSafeAreaInsets();
  const { openAuthPrompt } = useAuthPrompt();

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.content,
        {
          flexGrow: 1,
          paddingTop: insets.top + 32,
          paddingBottom: 120,
          paddingHorizontal: 24,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.guestHero}>
        <Ionicons
          name="person-circle-outline"
          size={72}
          color={theme.textMuted}
        />
        <Text style={styles.guestTitle}>Jouw profiel</Text>
        <Text style={styles.guestSubtitle}>
          Log in om videos te uploaden, je profiel aan te passen en instellingen te
          openen.
        </Text>
        <Pressable
          style={styles.guestBtnPrimary}
          onPress={() =>
            openAuthPrompt({ message: "Log hieronder in om verder te gaan." })
          }
          accessibilityRole="button"
          accessibilityLabel="Inloggen"
        >
          <Text style={styles.guestBtnPrimaryText}>Inloggen</Text>
        </Pressable>
        <Pressable
          style={styles.guestBtnOutline}
          onPress={() =>
            openAuthPrompt({
              message:
                "Maak een gratis account om te uploaden, liken en reageren.",
            })
          }
          accessibilityRole="button"
          accessibilityLabel="Account maken"
        >
          <Text style={styles.guestBtnOutlineText}>Account maken</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function ProfileAuthenticatedScreen({
  profileId,
}: {
  profileId?: string;
}) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const cellSize = (width - GAP * 2) / 3;
  const { uploadedVideoPosts, deleteUserVideoPost } = useUserUploads();
  const uploads = uploadedVideoPosts;
  const [otherProfileUploads, setOtherProfileUploads] = useState<UserVideoPost[]>(
    []
  );
  const [otherUploadsLoading, setOtherUploadsLoading] = useState(false);
  const [activeVideoPost, setActiveVideoPost] = useState<UserVideoPost | null>(
    null
  );
  const [activeCarouselPost, setActiveCarouselPost] = useState<UserVideoPost | null>(
    null
  );
  const [carouselViewerIndex, setCarouselViewerIndex] = useState(0);

  const carouselSlides = useMemo((): ProfilePostMediaItem[] => {
    if (!activeCarouselPost) {
      return [];
    }
    const items = activeCarouselPost.mediaItems;
    if (items && items.length > 0) {
      return [...items].sort((a, b) => a.sortOrder - b.sortOrder);
    }
    const url =
      activeCarouselPost.thumbnailUrl && activeCarouselPost.thumbnailUrl.length > 0
        ? activeCarouselPost.thumbnailUrl
        : activeCarouselPost.imageUrl;
    if (url && url.length > 0) {
      return [{ url, mediaType: "image", sortOrder: 0 }];
    }
    return [];
  }, [activeCarouselPost]);

  useEffect(() => {
    if (activeCarouselPost) {
      setCarouselViewerIndex(0);
    }
  }, [activeCarouselPost?.id]);

  const closeVideoViewer = useCallback(() => {
    setActiveVideoPost(null);
  }, []);
  const closeCarouselViewer = useCallback(() => {
    setActiveCarouselPost(null);
  }, []);

  const [settingsVisible, setSettingsVisible] = useState(false);
  const [editProfileVisible, setEditProfileVisible] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [darkModeEnabled, setDarkModeEnabled] = useState(true);
  const { isUploading, pickAndUploadVideo } = useCloudVideoUpload();
  const { isUploading: isCarouselUploading, pickAndUploadCarousel } =
    useCloudImageCarouselUpload();
  const [uploadFlowBusy, setUploadFlowBusy] = useState(false);
  const isUploadBusy = isUploading || isCarouselUploading || uploadFlowBusy;
  const { signOut, user } = useAuth();
  const targetProfileId = profileId ?? user?.id ?? null;
  const isOwnProfile = !!user?.id && user.id === targetProfileId;
  const visibleUploads = isOwnProfile ? uploads : otherProfileUploads;
  const uploadsCount = visibleUploads.length;
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [followListVisible, setFollowListVisible] = useState(false);
  const [followListMode, setFollowListMode] = useState<FollowListMode>("followers");
  const [followListLoading, setFollowListLoading] = useState(false);
  const [followListProfiles, setFollowListProfiles] = useState<FollowListProfile[]>(
    []
  );

  const [logoutBusy, setLogoutBusy] = useState(false);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [profileUsername, setProfileUsername] = useState<string>("");
  const [profileDisplayName, setProfileDisplayName] = useState<string>("");
  const [profileBio, setProfileBio] = useState<string>("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const plusPulse = useRef(new Animated.Value(1)).current;

  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [captionDraft, setCaptionDraft] = useState("");
  const [hashtagsDraft, setHashtagsDraft] = useState("");
  const [myTagPrefs, setMyTagPrefs] = useState<MyTagPreference[]>([]);
  const [myTagPrefsLoaded, setMyTagPrefsLoaded] = useState(false);
  const [algoExpanded, setAlgoExpanded] = useState(false);

  const carouselLayout = useMemo(() => {
    const topChrome = insets.top + 44;
    const bottomChrome = insets.bottom + 52;
    const pageHeight = Math.max(240, height - topChrome - bottomChrome);
    return { topChrome, bottomChrome, pageHeight };
  }, [height, insets.top, insets.bottom]);

  const dismissUploadModal = useCallback(() => {
    setUploadModalVisible(false);
    setCaptionDraft("");
    setHashtagsDraft("");
  }, []);

  const handleChooseUploadVideo = useCallback(() => {
    const raw = hashtagsDraft;
    const cap = captionDraft;
    Keyboard.dismiss();
    setUploadModalVisible(false);

    const delayMs = Platform.OS === "ios" ? 700 : 500;
    setTimeout(() => {
      void (async () => {
        try {
          setUploadFlowBusy(true);
          await pickAndUploadVideo({ hashtagsRaw: raw, caption: cap });
        } finally {
          setUploadFlowBusy(false);
          setCaptionDraft("");
          setHashtagsDraft("");
        }
      })();
    }, delayMs);
  }, [captionDraft, hashtagsDraft, pickAndUploadVideo]);

  const handleChooseUploadPhotos = useCallback(() => {
    const raw = hashtagsDraft;
    const cap = captionDraft;
    Keyboard.dismiss();
    setUploadModalVisible(false);
    const delayMs = Platform.OS === "ios" ? 700 : 500;
    setTimeout(() => {
      void (async () => {
        try {
          setUploadFlowBusy(true);
          await pickAndUploadCarousel({ hashtagsRaw: raw, caption: cap });
        } finally {
          setUploadFlowBusy(false);
          setCaptionDraft("");
          setHashtagsDraft("");
        }
      })();
    }, delayMs);
  }, [captionDraft, hashtagsDraft, pickAndUploadCarousel]);

  const loadProfile = useCallback(async () => {
    if (!targetProfileId) {
      setProfileAvatarUrl(null);
      setProfileUsername("");
      setProfileDisplayName("");
      setProfileBio("");
      return;
    }
    const { data, error } = await supabase
      .from("profiles")
      .select("avatar_url, username, display_name, bio")
      .eq("id", targetProfileId)
      .maybeSingle<ProfileRow>();
    if (error) {
      if (__DEV__) {
        console.warn("[Profile] load profile error:", error.message);
      }
      return;
    }
    setProfileAvatarUrl(data?.avatar_url ?? null);
    setProfileUsername((data?.username ?? "").trim());
    setProfileDisplayName((data?.display_name ?? "").trim());
    setProfileBio((data?.bio ?? "").trim());
  }, [targetProfileId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!isOwnProfile) {
      setMyTagPrefs([]);
      setMyTagPrefsLoaded(false);
      return;
    }
    let cancelled = false;
    setMyTagPrefsLoaded(false);
    void (async () => {
      const rows = await fetchMyTagPreferences();
      if (!cancelled) {
        setMyTagPrefs(rows);
        setMyTagPrefsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOwnProfile]);

  useEffect(() => {
    if (!isOwnProfile) {
      setAlgoExpanded(false);
    }
  }, [isOwnProfile]);

  useEffect(() => {
    if (!__DEV__) {
      return;
    }
    console.log("Supabase URL:", process.env.EXPO_PUBLIC_SUPABASE_URL);
  }, [targetProfileId]);

  useEffect(() => {
    if (isOwnProfile || !targetProfileId) {
      setOtherProfileUploads([]);
      setOtherUploadsLoading(false);
      return;
    }

    let cancelled = false;
    setOtherUploadsLoading(true);

    void (async () => {
      try {
        const rows = await fetchUserPosts(targetProfileId, "global");
        if (!cancelled) {
          setOtherProfileUploads(rows ?? []);
        }
      } catch (e) {
        if (__DEV__) {
          console.warn("[Profile] load other profile uploads error:", e);
        }
        if (!cancelled) {
          setOtherProfileUploads([]);
        }
      } finally {
        if (!cancelled) {
          setOtherUploadsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOwnProfile, targetProfileId]);

  const loadFollowMeta = useCallback(async () => {
    if (!targetProfileId) {
      setFollowersCount(0);
      setFollowingCount(0);
      setIsFollowing(false);
      return;
    }

    const [followersRes, followingRes] = await Promise.all([
      supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("following_id", targetProfileId),
      supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("follower_id", targetProfileId),
    ]);

    if (!followersRes.error) {
      setFollowersCount(followersRes.count ?? 0);
    }
    if (!followingRes.error) {
      setFollowingCount(followingRes.count ?? 0);
    }

    if (isOwnProfile || !user?.id) {
      setIsFollowing(false);
      return;
    }

    const { data, error } = await supabase
      .from("follows")
      .select("follower_id")
      .eq("follower_id", user.id)
      .eq("following_id", targetProfileId)
      .maybeSingle();

    if (!error) {
      setIsFollowing(!!data);
    }
  }, [isOwnProfile, targetProfileId, user?.id]);

  useEffect(() => {
    void loadFollowMeta();
  }, [loadFollowMeta]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(plusPulse, {
          toValue: 1.15,
          duration: 650,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(plusPulse, {
          toValue: 1,
          duration: 650,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [plusPulse]);

  const uploadAvatarAsset = useCallback(
    async (asset: ImagePicker.ImagePickerAsset) => {
      if (!isOwnProfile || !user?.id || !asset.uri) {
        return;
      }
      try {
        setAvatarUploading(true);
        const response = await fetch(asset.uri);
        if (!response.ok) {
          throw new Error("Kon het geselecteerde bestand niet lezen.");
        }
        const fileBuffer = await response.arrayBuffer();
        const ext =
          asset.fileName?.split(".").pop()?.toLowerCase() ||
          asset.mimeType?.split("/").pop()?.toLowerCase() ||
          "jpg";
        const path = `${user.id}/avatar.${ext}`;
        if (__DEV__) {
          console.log("Uploading avatar to bucket: avatars");
        }

        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(path, fileBuffer, {
            upsert: true,
            contentType: asset.mimeType ?? "image/jpeg",
          });

        if (uploadError) {
          throw uploadError;
        }

        const publicUrl = supabase.storage.from("avatars").getPublicUrl(path)
          .data.publicUrl;

        const { error: updateError } = await supabase
          .from("profiles")
          .update({ avatar_url: publicUrl })
          .eq("id", user.id);

        if (updateError) {
          throw updateError;
        }

        await loadProfile();
      } catch (e) {
        const msg = getReadableErrorMessage(e, "Upload mislukt.");
        if (__DEV__) {
          console.warn("[Profile] avatar upload error:", e);
        }
        Alert.alert(
          "Profielfoto uploaden mislukt",
          msg.includes("avatars")
            ? `${msg}\n\nControleer of bucket 'avatars' bestaat en upload policy actief is.`
            : msg
        );
      } finally {
        setAvatarUploading(false);
      }
    },
    [isOwnProfile, loadProfile, user?.id]
  );

  const pickAvatarFromGallery = useCallback(async () => {
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
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (result.canceled || !result.assets[0]) {
      return;
    }
    await uploadAvatarAsset(result.assets[0]);
  }, [uploadAvatarAsset]);

  const takeAvatarPhoto = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Toegang nodig",
        "Sta camera-toegang toe om een profielfoto te maken."
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
      mediaTypes: ["images"],
    });
    if (result.canceled || !result.assets[0]) {
      return;
    }
    await uploadAvatarAsset(result.assets[0]);
  }, [uploadAvatarAsset]);

  const onAvatarPress = useCallback(() => {
    if (!isOwnProfile) {
      return;
    }
    Alert.alert("Profielfoto", "Kies hoe je je profielfoto wilt instellen.", [
      { text: "Annuleren", style: "cancel" },
      { text: "Galerij", onPress: () => void pickAvatarFromGallery() },
      { text: "Camera", onPress: () => void takeAvatarPhoto() },
    ]);
  }, [isOwnProfile, pickAvatarFromGallery, takeAvatarPhoto]);

  const handleLogout = useCallback(async () => {
    setLogoutBusy(true);
    try {
      const { error } = await signOut();
      if (error) {
        Alert.alert("Uitloggen mislukt", error.message);
      } else {
        setSettingsVisible(false);
      }
    } finally {
      setLogoutBusy(false);
    }
  }, [signOut]);

  const showStubMessage = (label: string) => {
    Alert.alert(label, "Deze optie is alvast voorbereid als placeholder.");
  };

  const confirmDeleteCloudVideo = useCallback(
    (p: UserVideoPost) => {
      if (!isOwnProfile) {
        return;
      }
      Alert.alert(
        "Post verwijderen?",
        "Weet je zeker dat je deze post wilt verwijderen?",
        [
          { text: "Annuleren", style: "cancel" },
          {
            text: "Verwijderen",
            style: "destructive",
            onPress: () => {
              void (async () => {
                try {
                  if (activeVideoPost?.id === p.id) {
                    setActiveVideoPost(null);
                  }
                  if (activeCarouselPost?.id === p.id) {
                    setActiveCarouselPost(null);
                  }
                  await deleteUserVideoPost(p.id);
                } catch (e) {
                  const msg = e instanceof Error ? e.message : "Verwijderen mislukt";
                  Alert.alert("Fout", msg);
                }
              })();
            },
          },
        ]
      );
    },
    [activeVideoPost?.id, activeCarouselPost?.id, deleteUserVideoPost, isOwnProfile]
  );

  const onToggleFollow = useCallback(async () => {
    if (!user?.id || !targetProfileId || isOwnProfile) {
      return;
    }
    setFollowBusy(true);
    try {
      if (isFollowing) {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", user.id)
          .eq("following_id", targetProfileId);
        if (error) {
          throw error;
        }
        setIsFollowing(false);
        setFollowersCount((prev) => Math.max(0, prev - 1));
      } else {
        const { error } = await supabase.from("follows").insert({
          follower_id: user.id,
          following_id: targetProfileId,
        });
        if (error) {
          if (error.code === "23505") {
            setIsFollowing(true);
            return;
          }
          throw error;
        }
        setIsFollowing(true);
        setFollowersCount((prev) => prev + 1);
      }
    } catch (e) {
      const msg = getReadableErrorMessage(e, "Volgen mislukt.");
      Alert.alert("Fout", msg);
    } finally {
      setFollowBusy(false);
    }
  }, [isFollowing, isOwnProfile, targetProfileId, user?.id]);

  const loadFollowList = useCallback(
    async (mode: FollowListMode) => {
      if (!targetProfileId) {
        setFollowListProfiles([]);
        return;
      }
      setFollowListLoading(true);
      try {
        const isFollowersMode = mode === "followers";
        const sourceColumn = isFollowersMode ? "follower_id" : "following_id";
        const matchColumn = isFollowersMode ? "following_id" : "follower_id";

        const { data: followRows, error: followsError } = await supabase
          .from("follows")
          .select(`${sourceColumn}, created_at`)
          .eq(matchColumn, targetProfileId)
          .order("created_at", { ascending: false });

        if (followsError) {
          throw followsError;
        }

        const ids = (followRows ?? [])
          .map((row) => (row as Record<string, unknown>)[sourceColumn])
          .filter((value): value is string => typeof value === "string" && value.length > 0);

        if (ids.length === 0) {
          setFollowListProfiles([]);
          return;
        }

        const uniqueIds = Array.from(new Set(ids));
        const { data: profileRows, error: profilesError } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .in("id", uniqueIds);

        if (profilesError) {
          throw profilesError;
        }

        const profileMap = new Map(
          ((profileRows ?? []) as FollowListProfile[]).map((profile) => [profile.id, profile])
        );
        const orderedProfiles = ids
          .map((id) => profileMap.get(id))
          .filter((profile): profile is FollowListProfile => !!profile);
        setFollowListProfiles(orderedProfiles);
      } catch (e) {
        const msg = getReadableErrorMessage(e, "Lijst laden mislukt.");
        Alert.alert("Fout", msg);
      } finally {
        setFollowListLoading(false);
      }
    },
    [targetProfileId]
  );

  const openFollowList = useCallback(
    (mode: FollowListMode) => {
      setFollowListMode(mode);
      setFollowListVisible(true);
      void loadFollowList(mode);
    },
    [loadFollowList]
  );

  const onPressFollowListProfile = useCallback(
    (profile: FollowListProfile) => {
      setFollowListVisible(false);
      if (profile.id === user?.id) {
        navigation.navigate("MainTabs", { screen: "Profile" });
        return;
      }
      navigation.navigate("PublicProfile", { profileId: profile.id });
    },
    [navigation, user?.id]
  );

  return (
    <>
      {isOwnProfile && isUploadBusy ? (
        <View
          style={[styles.uploadProgressBanner, { paddingTop: insets.top + 8 }]}
          pointerEvents="none"
        >
          <ActivityIndicator size="small" color={theme.text} />
          <Text style={styles.uploadProgressText}>Uploaden...</Text>
        </View>
      ) : null}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: 120 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {isOwnProfile ? (
          <View style={styles.topActions}>
            <Pressable
              style={styles.iconButton}
              onPress={() => setSettingsVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Open settings"
            >
              <Ionicons name="settings-outline" size={22} color={theme.text} />
            </Pressable>
            <Pressable
              style={styles.iconButton}
              onPress={() => void handleLogout()}
              disabled={logoutBusy}
              accessibilityRole="button"
              accessibilityLabel="Uitloggen"
            >
              {logoutBusy ? (
                <ActivityIndicator size="small" color={theme.text} />
              ) : (
                <Ionicons name="log-out-outline" size={22} color={theme.text} />
              )}
            </Pressable>
          </View>
        ) : null}

        <View style={styles.header}>
          <Pressable
            onPress={() => void onAvatarPress()}
            disabled={avatarUploading || !isOwnProfile}
            style={styles.avatarPressable}
            accessibilityRole="button"
            accessibilityLabel={
              isOwnProfile ? "Profielfoto kiezen" : "Profielfoto van gebruiker"
            }
          >
            {profileAvatarUrl ? (
              <Image source={{ uri: profileAvatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarFallbackText}>Profielfoto</Text>
                {isOwnProfile ? (
                  <Animated.View style={{ transform: [{ scale: plusPulse }] }}>
                    <Ionicons name="add-circle" size={30} color={theme.accent} />
                  </Animated.View>
                ) : null}
              </View>
            )}
            {avatarUploading && isOwnProfile ? (
              <View style={styles.avatarUploadingOverlay}>
                <ActivityIndicator size="small" color={theme.text} />
              </View>
            ) : null}
          </Pressable>
          <Text style={styles.name}>
            {profileUsername.length > 0 ? `@${profileUsername}` : "@gebruiker"}
          </Text>
          {isOwnProfile && profileUsername.length === 0 ? (
            <Text style={styles.usernamePrompt}>
              Kies een accountnaam via profiel bewerken zodat anderen je kunnen
              vinden.
            </Text>
          ) : null}
          <Text style={styles.bio}>
            {profileBio.length > 0
              ? profileBio
              : profileDisplayName.length > 0
                ? profileDisplayName
                : isOwnProfile
                  ? "Voeg een bio toe via profiel bewerken"
                  : "Deze gebruiker heeft nog geen bio toegevoegd."}
          </Text>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{uploadsCount}</Text>
              <Text style={styles.statLabel}>uploads</Text>
            </View>
            <Pressable
              style={styles.stat}
              onPress={() => openFollowList("followers")}
              accessibilityRole="button"
              accessibilityLabel="Bekijk volgers"
            >
              <Text style={styles.statNum}>{followersCount}</Text>
              <Text style={styles.statLabel}>volgers</Text>
            </Pressable>
            <Pressable
              style={styles.stat}
              onPress={() => openFollowList("following")}
              accessibilityRole="button"
              accessibilityLabel="Bekijk volgend"
            >
              <Text style={styles.statNum}>{followingCount}</Text>
              <Text style={styles.statLabel}>volgend</Text>
            </Pressable>

            {isOwnProfile ? (
              <Pressable
                style={styles.statsAddButton}
                onPress={() => {
                  if (isUploadBusy) return;
                  setCaptionDraft("");
                  setHashtagsDraft("");
                  setUploadModalVisible(true);
                }}
                disabled={isUploadBusy}
                accessibilityRole="button"
                accessibilityLabel="Uploaden"
              >
                <View style={styles.statsAddCircle}>
                  {isUploadBusy ? (
                    <ActivityIndicator size="small" color={theme.text} />
                  ) : (
                    <Ionicons name="add" size={24} color={theme.text} />
                  )}
                </View>
                <Text style={styles.statsAddText}>
                  {isUploadBusy ? "Uploaden..." : "Uploaden"}
                </Text>
              </Pressable>
            ) : null}
          </View>
          {!isOwnProfile ? (
            <Pressable
              style={[styles.followProfileBtn, followBusy && styles.followProfileBtnDisabled]}
              onPress={() => void onToggleFollow()}
              disabled={followBusy}
              accessibilityRole="button"
              accessibilityLabel={isFollowing ? "Ontvolgen" : "Volgen"}
            >
              {followBusy ? (
                <ActivityIndicator size="small" color={theme.bg} />
              ) : (
                <Text style={styles.followProfileBtnText}>
                  {isFollowing ? "Volgend" : "Volgen"}
                </Text>
              )}
            </Pressable>
          ) : null}
        </View>

        {isOwnProfile && myTagPrefsLoaded ? (
          <View style={styles.algoCard}>
            <Pressable
              style={styles.algoToggleRow}
              onPress={() => setAlgoExpanded((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={
                algoExpanded ? "Mijn algoritme inklappen" : "Mijn algoritme bekijken"
              }
            >
              <Text style={styles.algoToggleText}>
                {algoExpanded ? "Mijn algoritme" : "Mijn algoritme bekijken"}
              </Text>
              <Ionicons
                name={algoExpanded ? "chevron-up" : "chevron-down"}
                size={18}
                color={theme.textMuted}
              />
            </Pressable>
            {algoExpanded ? (
              <View style={styles.algoExpanded}>
                {myTagPrefs.length === 0 ? (
                  <Text style={styles.algoEmptyInline}>Nog geen algoritme-data</Text>
                ) : (
                  myTagPrefs.slice(0, 5).map((row) => {
                    const label = row.tag.startsWith("#")
                      ? row.tag
                      : `#${row.tag}`;
                    return (
                      <Text key={row.tag} style={styles.algoTagLine}>
                        {label}  score {row.score}
                      </Text>
                    );
                  })
                )}
                <Pressable
                  style={styles.algoHideBtn}
                  onPress={() => setAlgoExpanded(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Verbergen"
                >
                  <Text style={styles.algoHideText}>Verbergen</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.grid}>
          {!isOwnProfile && otherUploadsLoading ? (
            <View style={styles.otherUploadsLoadingWrap}>
              <ActivityIndicator size="small" color={theme.accent} />
            </View>
          ) : null}
          {visibleUploads.map((p, i) => (
            <Pressable
              key={p.id}
              onPress={() => {
                if (p.type === "image_carousel") {
                  setActiveCarouselPost(p);
                } else {
                  setActiveVideoPost(p);
                }
              }}
              onLongPress={isOwnProfile ? () => confirmDeleteCloudVideo(p) : undefined}
              accessibilityRole="button"
              accessibilityLabel={
                p.type === "image_carousel"
                  ? `Open fotoserie ${p.filename ?? ""}`
                  : `Open video ${p.filename ?? ""}`
              }
              accessibilityHint="Dubbel tik om te openen, lang indrukken om te verwijderen"
              style={[
                styles.cell,
                { width: cellSize },
                { marginRight: i % 3 === 2 ? 0 : GAP, marginBottom: GAP },
              ]}
            >
              <View style={styles.thumbWithOverlay}>
                {p.thumbnailUrl || p.imageUrl ? (
                  <Image
                    source={{ uri: p.thumbnailUrl ?? p.imageUrl }}
                    style={styles.thumb}
                  />
                ) : (
                  <View style={styles.videoThumb}>
                    <Ionicons name="play-circle" size={24} color={theme.text} />
                  </View>
                )}
                {p.type === "image_carousel" ? (
                  <View style={styles.carouselGridBadge} pointerEvents="none">
                    <Ionicons
                      name="albums-outline"
                      size={18}
                      color="rgba(255,255,255,0.95)"
                    />
                  </View>
                ) : (
                  <View
                    style={styles.playIconOverlay}
                    pointerEvents="none"
                  >
                    <Ionicons
                      name="play-circle"
                      size={24}
                      color="rgba(255,255,255,0.95)"
                    />
                  </View>
                )}
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Modal
        visible={activeVideoPost !== null}
        animationType="fade"
        presentationStyle="fullScreen"
        statusBarTranslucent
        onRequestClose={closeVideoViewer}
        supportedOrientations={["portrait", "landscape"]}
      >
        <View style={styles.videoModalRoot}>
          <View
            style={[
              styles.viewerTopBar,
              { top: insets.top + 6, left: 12, right: 12 },
            ]}
          >
            {isOwnProfile && activeVideoPost ? (
              <Pressable
                onPress={() => confirmDeleteCloudVideo(activeVideoPost)}
                style={styles.viewerTopBarBtn}
                accessibilityRole="button"
                accessibilityLabel="Post verwijderen"
                hitSlop={12}
              >
                <Ionicons name="trash-outline" size={26} color={theme.text} />
              </Pressable>
            ) : (
              <View style={styles.viewerTopBarSpacer} />
            )}
            <Pressable
              onPress={closeVideoViewer}
              style={styles.viewerTopBarBtn}
              accessibilityRole="button"
              accessibilityLabel="Sluit video"
              hitSlop={12}
            >
              <Ionicons name="close" size={30} color={theme.text} />
            </Pressable>
          </View>
          {activeVideoPost ? (
            <View style={styles.videoStage}>
              <FullscreenVideoPlayer
                videoId={activeVideoPost.id}
                videoUrl={activeVideoPost.videoUrl ?? ""}
              />
            </View>
          ) : null}
        </View>
      </Modal>

      <Modal
        visible={activeCarouselPost !== null}
        animationType="fade"
        presentationStyle="fullScreen"
        statusBarTranslucent
        onRequestClose={closeCarouselViewer}
        supportedOrientations={["portrait", "landscape"]}
      >
        <View style={styles.carouselModalRoot}>
          <View
            style={[
              styles.carouselTopBar,
              { height: carouselLayout.topChrome, paddingTop: insets.top + 6 },
            ]}
          >
            {isOwnProfile && activeCarouselPost ? (
              <Pressable
                onPress={() => confirmDeleteCloudVideo(activeCarouselPost)}
                style={styles.carouselTopBarHit}
                accessibilityRole="button"
                accessibilityLabel="Post verwijderen"
                hitSlop={12}
              >
                <Ionicons name="trash-outline" size={26} color="#fff" />
              </Pressable>
            ) : (
              <View style={styles.viewerTopBarSpacer} />
            )}
            <Pressable
              onPress={closeCarouselViewer}
              style={styles.carouselTopBarHit}
              accessibilityRole="button"
              accessibilityLabel="Sluit fotoserie"
              hitSlop={12}
            >
              <Ionicons name="close" size={30} color="#fff" />
            </Pressable>
          </View>

          {activeCarouselPost && carouselSlides.length > 0 ? (
            <FlatList
              key={activeCarouselPost.id}
              style={{ height: carouselLayout.pageHeight }}
              data={carouselSlides}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              bounces={false}
              removeClippedSubviews={false}
              keyExtractor={(item) => `${item.url}-${item.sortOrder}`}
              getItemLayout={(_, index) => ({
                length: width,
                offset: width * index,
                index,
              })}
              {...(Platform.OS === "android"
                ? {
                    snapToInterval: width,
                    snapToAlignment: "start" as const,
                    disableIntervalMomentum: true,
                  }
                : {})}
              onMomentumScrollEnd={(ev) => {
                const page = Math.round(ev.nativeEvent.contentOffset.x / width);
                const max = Math.max(0, carouselSlides.length - 1);
                setCarouselViewerIndex(Math.min(Math.max(0, page), max));
              }}
              renderItem={({ item }) => (
                <View
                  style={{
                    width,
                    height: carouselLayout.pageHeight,
                    justifyContent: "center",
                    alignItems: "center",
                    backgroundColor: "#000",
                  }}
                >
                  <Image
                    source={{ uri: item.url }}
                    style={{
                      width,
                      height: carouselLayout.pageHeight,
                    }}
                    resizeMode="contain"
                  />
                </View>
              )}
            />
          ) : null}

          <View
            style={[
              styles.carouselBottomBar,
              {
                height: carouselLayout.bottomChrome,
                paddingBottom: insets.bottom,
              },
            ]}
            pointerEvents="box-none"
          >
            <Text style={styles.carouselCounterText} accessibilityLiveRegion="polite">
              {carouselSlides.length > 0
                ? `${carouselViewerIndex + 1} / ${carouselSlides.length}`
                : ""}
            </Text>
            <Pressable
              onPress={closeCarouselViewer}
              style={styles.carouselDismissTextWrap}
              accessibilityRole="button"
              accessibilityLabel="Sluiten"
            >
              <Text style={styles.carouselDismissText}>Sluiten</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {isOwnProfile ? (
        <Modal
          visible={settingsVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setSettingsVisible(false)}
        >
          <View
            style={[styles.modalOverlay, { paddingBottom: insets.bottom + 16 }]}
          >
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Settings</Text>
                <Pressable
                  style={styles.iconButton}
                  onPress={() => setSettingsVisible(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Close settings"
                >
                  <Ionicons name="close" size={22} color={theme.text} />
                </Pressable>
              </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Account</Text>
              <Pressable
                style={styles.rowButton}
                onPress={() => {
                  setSettingsVisible(false);
                  setEditProfileVisible(true);
                }}
              >
                <Text style={styles.rowLabel}>Account settings</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
              </Pressable>
              <Pressable
                style={styles.rowButton}
                onPress={() => showStubMessage("Privacy")}
              >
                <Text style={styles.rowLabel}>Privacy</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
              </Pressable>
              <Pressable
                style={styles.rowButton}
                onPress={() => showStubMessage("Security")}
              >
                <Text style={styles.rowLabel}>Security & login</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
              </Pressable>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Preferences</Text>
              <View style={styles.rowSwitch}>
                <Text style={styles.rowLabel}>Dark mode</Text>
                <Switch value={darkModeEnabled} onValueChange={setDarkModeEnabled} />
              </View>
              <View style={styles.rowSwitch}>
                <Text style={styles.rowLabel}>Push notifications</Text>
                <Switch value={pushEnabled} onValueChange={setPushEnabled} />
              </View>
              <View style={styles.rowSwitch}>
                <Text style={styles.rowLabel}>Email updates</Text>
                <Switch value={emailEnabled} onValueChange={setEmailEnabled} />
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Support</Text>
              <Pressable
                style={styles.rowButton}
                onPress={() => showStubMessage("Help center")}
              >
                <Text style={styles.rowLabel}>Help center</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
              </Pressable>
              <Pressable
                style={styles.rowButton}
                onPress={() => showStubMessage("Report a problem")}
              >
                <Text style={styles.rowLabel}>Report a problem</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
              </Pressable>
            </View>

              <Pressable
                style={styles.logoutButton}
                onPress={() => void handleLogout()}
                disabled={logoutBusy}
              >
                {logoutBusy ? (
                  <ActivityIndicator size="small" color="#ff8a84" />
                ) : (
                  <Text style={styles.logoutText}>Log out</Text>
                )}
              </Pressable>
            </View>
          </View>
        </Modal>
      ) : null}

      {isOwnProfile ? (
        <Modal
          visible={editProfileVisible}
          animationType="slide"
          presentationStyle="fullScreen"
          statusBarTranslucent
          onRequestClose={() => setEditProfileVisible(false)}
        >
          <EditProfileScreen
            onClose={() => setEditProfileVisible(false)}
            onSaved={() => {
              void loadProfile();
            }}
          />
        </Modal>
      ) : null}

      {isOwnProfile ? (
        <Modal
          visible={uploadModalVisible}
          transparent
          animationType="fade"
          presentationStyle={Platform.OS === "ios" ? "overFullScreen" : undefined}
          onRequestClose={dismissUploadModal}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.uploadSheetKb}
          >
            <View style={styles.uploadSheetOuter} collapsable={false}>
              <Pressable
                style={styles.uploadSheetFill}
                onPress={dismissUploadModal}
                accessibilityRole="button"
                accessibilityLabel="Sluiten"
              />
              <View
                style={[
                  styles.uploadSheetCard,
                  { paddingBottom: Math.max(insets.bottom, 16) + 8 },
                ]}
                collapsable={false}
              >
                <Text style={styles.uploadSheetTitle}>Uploaden</Text>
                <Text style={styles.uploadSheetLabel}>Beschrijving</Text>
                <TextInput
                  style={[styles.uploadSheetInput, styles.uploadSheetCaptionInput]}
                  placeholder="Vertel iets over je outfit..."
                  placeholderTextColor={theme.textMuted}
                  value={captionDraft}
                  onChangeText={setCaptionDraft}
                  maxLength={150}
                  multiline
                />
                <Text style={styles.uploadSheetLabel}>Hashtags</Text>
                <TextInput
                  style={styles.uploadSheetInput}
                  placeholder="#oldmoney #zomervibe #classy"
                  placeholderTextColor={theme.textMuted}
                  value={hashtagsDraft}
                  onChangeText={setHashtagsDraft}
                  autoCorrect={false}
                  autoCapitalize="none"
                  multiline
                />
                <View style={styles.uploadSheetStack}>
                  <Pressable
                    style={[styles.uploadSheetBtnPrimary, styles.uploadSheetFullWidth]}
                    onPress={(e) => {
                      e?.stopPropagation?.();
                      handleChooseUploadVideo();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Video uploaden"
                  >
                    <Text style={styles.uploadSheetBtnPrimaryText}>Video uploaden</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.uploadSheetBtnPrimary, styles.uploadSheetFullWidth]}
                    onPress={(e) => {
                      e?.stopPropagation?.();
                      handleChooseUploadPhotos();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Foto's uploaden"
                  >
                    <Text style={styles.uploadSheetBtnPrimaryText}>
                      Foto's uploaden (max. 10)
                    </Text>
                  </Pressable>
                </View>
                <Pressable
                  style={[styles.uploadSheetBtnSecondary, styles.uploadSheetCancelBelow]}
                  onPress={dismissUploadModal}
                  accessibilityRole="button"
                  accessibilityLabel="Annuleren"
                >
                  <Text style={styles.uploadSheetBtnSecondaryText}>Annuleren</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      ) : null}

      <Modal
        visible={followListVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFollowListVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {followListMode === "followers" ? "Volgers" : "Volgend"}
              </Text>
              <Pressable
                style={styles.iconButton}
                onPress={() => setFollowListVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Sluit lijst"
              >
                <Ionicons name="close" size={22} color={theme.text} />
              </Pressable>
            </View>

            {followListLoading ? (
              <View style={styles.followListEmptyWrap}>
                <ActivityIndicator size="small" color={theme.accent} />
              </View>
            ) : (
              <FlatList
                data={followListProfiles}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.followListContent}
                renderItem={({ item }) => (
                  <Pressable
                    style={styles.followRow}
                    onPress={() => onPressFollowListProfile(item)}
                    accessibilityRole="button"
                    accessibilityLabel="Open profiel"
                  >
                    {item.avatar_url ? (
                      <Image source={{ uri: item.avatar_url }} style={styles.followAvatar} />
                    ) : (
                      <View style={[styles.followAvatar, styles.followAvatarFallback]}>
                        <Text style={styles.followAvatarFallbackText}>Geen foto</Text>
                      </View>
                    )}

                    <View style={styles.followTextWrap}>
                      <Text style={styles.followUsername} numberOfLines={1}>
                        {item.username ? `@${item.username}` : "@gebruiker"}
                      </Text>
                      {item.display_name ? (
                        <Text style={styles.followDisplayName} numberOfLines={1}>
                          {item.display_name}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                )}
                ListEmptyComponent={
                  <View style={styles.followListEmptyWrap}>
                    <Text style={styles.followListEmptyText}>
                      {followListMode === "followers"
                        ? "Nog geen volgers"
                        : "Volgt nog niemand"}
                    </Text>
                  </View>
                }
              />
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

export function ProfileScreen() {
  const { user } = useAuth();
  const route = useRoute<any>();
  const routeProfileId: string | undefined = route?.params?.profileId;
  if (user == null) {
    return <GuestProfileScreen />;
  }
  return <ProfileAuthenticatedScreen profileId={routeProfileId} />;
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  content: {
    paddingHorizontal: 0,
  },
  guestHero: {
    alignItems: "center",
    gap: 18,
    maxWidth: 340,
    alignSelf: "center",
    width: "100%",
  },
  guestTitle: {
    color: theme.text,
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 4,
  },
  guestSubtitle: {
    color: theme.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 8,
  },
  guestBtnPrimary: {
    alignSelf: "stretch",
    minHeight: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.accent,
    marginTop: 4,
  },
  guestBtnPrimaryText: {
    color: theme.bg,
    fontSize: 16,
    fontWeight: "700",
  },
  guestBtnOutline: {
    alignSelf: "stretch",
    minHeight: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    backgroundColor: theme.bgElevated,
  },
  guestBtnOutlineText: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "700",
  },
  topActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: 12,
    marginBottom: 8,
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.bgElevated,
  },
  header: {
    alignItems: "center",
    paddingBottom: 28,
    paddingHorizontal: 20,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: theme.border,
  },
  avatarPressable: {
    width: 100,
    height: 100,
    borderRadius: 999,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarUploadingOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallback: {
    backgroundColor: theme.bgElevated,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 8,
  },
  avatarFallbackText: {
    color: theme.textMuted,
    fontSize: 12,
    textAlign: "center",
    fontWeight: "700",
  },
  name: {
    marginTop: 14,
    color: theme.text,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  usernamePrompt: {
    marginTop: 6,
    color: theme.textMuted,
    fontSize: 13,
    textAlign: "center",
    maxWidth: 290,
    lineHeight: 18,
  },
  bio: {
    marginTop: 8,
    color: theme.textMuted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 280,
  },
  stats: {
    flexDirection: "row",
    marginTop: 22,
    gap: 28,
    alignItems: "center",
  },
  stat: {
    alignItems: "center",
  },
  statNum: {
    color: theme.text,
    fontSize: 17,
    fontWeight: "800",
  },
  statLabel: {
    marginTop: 4,
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  statsAddButton: {
    height: 42,
    minWidth: 132,
    paddingLeft: 4,
    paddingRight: 14,
    borderRadius: 21,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.45)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  statsAddCircle: {
    height: 42,
    width: 42,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  statsAddText: {
    marginLeft: 4,
    color: theme.text,
    fontSize: 14,
    fontWeight: "700",
  },
  followProfileBtn: {
    marginTop: 12,
    minHeight: 44,
    minWidth: 180,
    paddingHorizontal: 22,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.accent,
  },
  followProfileBtnDisabled: {
    opacity: 0.75,
  },
  followProfileBtnText: {
    color: theme.bg,
    fontSize: 15,
    fontWeight: "800",
  },
  algoCard: {
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
  },
  algoToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  algoToggleText: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
    paddingRight: 8,
  },
  algoExpanded: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    paddingTop: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  algoEmptyInline: {
    color: theme.textMuted,
    fontSize: 13,
    lineHeight: 18,
    paddingBottom: 6,
  },
  algoTagLine: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
  },
  algoHideBtn: {
    alignSelf: "flex-start",
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 0,
  },
  algoHideText: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  otherUploadsLoadingWrap: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
  },
  cell: {
    width: "33.33%",
  },
  thumb: {
    width: "100%",
    aspectRatio: 0.78,
    backgroundColor: theme.bgElevated,
  },
  thumbWithOverlay: {
    width: "100%",
    position: "relative",
    aspectRatio: 0.78,
  },
  playIconOverlay: {
    position: "absolute",
    right: 4,
    bottom: 4,
  },
  carouselGridBadge: {
    position: "absolute",
    right: 4,
    bottom: 4,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 6,
    padding: 3,
  },
  videoModalRoot: {
    flex: 1,
    backgroundColor: "#000",
  },
  carouselModalRoot: {
    flex: 1,
    backgroundColor: "#000",
  },
  viewerTopBar: {
    position: "absolute",
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  viewerTopBarBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  viewerTopBarSpacer: {
    width: 44,
    height: 44,
  },
  carouselTopBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 12,
    backgroundColor: "#000",
  },
  carouselTopBarHit: {
    paddingVertical: 4,
    paddingLeft: 12,
  },
  carouselBottomBar: {
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 6,
  },
  carouselCounterText: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  carouselDismissTextWrap: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  carouselDismissText: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 15,
    fontWeight: "600",
  },
  videoCloseButton: {
    position: "absolute",
    zIndex: 2,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  videoStage: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
  },
  videoThumb: {
    width: "100%",
    aspectRatio: 0.78,
    backgroundColor: "#111820",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  modalSheet: {
    backgroundColor: theme.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 14,
    maxHeight: "88%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  modalTitle: {
    color: theme.text,
    fontSize: 20,
    fontWeight: "800",
  },
  section: {
    backgroundColor: theme.bgElevated,
    borderRadius: 14,
    paddingVertical: 4,
    marginTop: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  sectionTitle: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    textTransform: "uppercase",
  },
  rowButton: {
    minHeight: 48,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowSwitch: {
    minHeight: 52,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowLabel: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "600",
  },
  followListContent: {
    paddingBottom: 8,
  },
  followRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 10,
  },
  followAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: theme.bgElevated,
  },
  followAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    paddingHorizontal: 4,
  },
  followAvatarFallbackText: {
    color: theme.textMuted,
    fontSize: 9,
    textAlign: "center",
  },
  followTextWrap: {
    flex: 1,
  },
  followUsername: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "700",
  },
  followDisplayName: {
    color: theme.textMuted,
    marginTop: 1,
    fontSize: 13,
  },
  followListEmptyWrap: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  followListEmptyText: {
    color: theme.textMuted,
    fontSize: 14,
  },
  logoutButton: {
    marginTop: 16,
    marginBottom: 4,
    minHeight: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,59,48,0.14)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,59,48,0.45)",
  },
  logoutText: {
    color: "#ff8a84",
    fontSize: 15,
    fontWeight: "700",
  },
  uploadProgressBanner: {
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
  uploadProgressText: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "600",
  },
  uploadSheetKb: {
    flex: 1,
  },
  uploadSheetOuter: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  uploadSheetFill: {
    flex: 1,
  },
  uploadSheetCard: {
    backgroundColor: theme.bgElevated,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  uploadSheetTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 14,
  },
  uploadSheetLabel: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
  },
  uploadSheetInput: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.text,
    fontSize: 15,
    minHeight: 72,
    textAlignVertical: "top",
    marginBottom: 18,
  },
  uploadSheetCaptionInput: {
    minHeight: 56,
    marginBottom: 12,
  },
  uploadSheetActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  uploadSheetBtnSecondary: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  uploadSheetBtnSecondaryText: {
    color: theme.textMuted,
    fontSize: 16,
    fontWeight: "600",
  },
  uploadSheetBtnPrimary: {
    backgroundColor: theme.accent,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  uploadSheetBtnPrimaryText: {
    color: "#0B0B0B",
    fontSize: 16,
    fontWeight: "700",
  },
  uploadSheetStack: {
    gap: 10,
    marginBottom: 14,
  },
  uploadSheetFullWidth: {
    alignSelf: "stretch",
    alignItems: "center",
  },
  uploadSheetCancelBelow: {
    alignSelf: "center",
    marginBottom: 4,
  },
});
