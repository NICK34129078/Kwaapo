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
  Text,
  TextInput,
  useWindowDimensions,
  View,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { ResizeMode, Video } from "expo-av";
import {
  useUserUploads,
  type UserVideoPost,
} from "../context/UserUploadsContext";
import { useLikes } from "../context/LikesContext";
import { formatGridViewsCount } from "../data/placeholder";
import {
  fetchMyPostStats,
  type PostStats,
} from "../services/postStatsService";
import { isPersistablePostId } from "../services/postLikesService";
import { useCloudImageCarouselUpload } from "../hooks/useCloudImageCarouselUpload";
import { useCloudVideoUpload } from "../hooks/useCloudVideoUpload";
import type { AppTheme } from "../constants/themeTokens";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import { useAuth } from "../context/AuthContext";
import { useSellerFulfillment } from "../context/SellerFulfillmentContext";
import { useAuthPrompt } from "../context/AuthPromptContext";
import { EditProfileScreen } from "./EditProfileScreen";
import { useAvatarPicker } from "../hooks/useAvatarPicker";
import { getReadableErrorMessage } from "../utils/getReadableErrorMessage";
import { supabase } from "../lib/supabase";
import { fetchUserPosts } from "../services/postsService";
import { parseHashtagInput } from "../utils/hashtags";
import { fetchMyLinkableProducts } from "../services/productsService";
import {
  canSellerManageProducts,
  fetchMySellerOnboarding,
} from "../services/sellerOnboardingService";
import type { Product } from "../types/product";
import { formatPriceEur } from "../utils/formatPrice";
import {
  normalizeAccountType,
  type AccountType,
} from "../services/profileService";
import {
  ProfileContentTabs,
  type ProfileContentTab,
} from "../components/ProfileContentTabs";
import { ProfileShopGrid } from "../components/ProfileShopGrid";
import { SavedPostsGrid } from "../components/SavedPostsGrid";
import { AvatarImage } from "../components/AvatarImage";
import { FullScreenImageModal } from "../components/FullScreenImageModal";
import { hasProfileAvatar } from "../utils/resolveAvatarSource";
import {
  AudioPickerCard,
  AUDIO_VOLUME_NORMAL,
} from "../components/AudioPickerCard";
import { UploadProductPickerPanel } from "../components/UploadProductPickerPanel";
import { SETTINGS_LEGAL_LINKS, SUPPORT_EMAIL } from "../constants/appPolicies";

const GAP = 2;
type ProfileRow = {
  avatar_url: string | null;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  account_type: string | null;
};

type FollowListMode = "followers" | "following";
type UploadDraftMedia =
  | { kind: "video"; asset: ImagePicker.ImagePickerAsset }
  | { kind: "photos"; assets: ImagePicker.ImagePickerAsset[] };
type FollowListProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

function GuestProfileScreen() {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
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
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { width, height: windowHeight } = useWindowDimensions();
  const settingsSheetMaxHeight = useMemo(
    () => Math.round(windowHeight * 0.88),
    [windowHeight]
  );
  const settingsScrollMaxHeight = useMemo(
    () => Math.max(240, settingsSheetMaxHeight - 56),
    [settingsSheetMaxHeight]
  );
  const cellSize = (width - GAP * 2) / 3;
  const { uploadedVideoPosts, deleteUserVideoPost } = useUserUploads();
  const uploads = uploadedVideoPosts;
  const [otherProfileUploads, setOtherProfileUploads] = useState<UserVideoPost[]>(
    []
  );
  const [otherUploadsLoading, setOtherUploadsLoading] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [editProfileVisible, setEditProfileVisible] = useState(false);
  const { isUploading, uploadVideoAsset } = useCloudVideoUpload();
  const { isUploading: isCarouselUploading, uploadCarouselAssets } =
    useCloudImageCarouselUpload();
  const [uploadFlowBusy, setUploadFlowBusy] = useState(false);
  const isUploadBusy = isUploading || isCarouselUploading || uploadFlowBusy;
  const { signOut, user } = useAuth();
  const { actionCount: sellerOrdersToShipCount } = useSellerFulfillment();
  const { syncFeedLikeState } = useLikes();
  const targetProfileId = profileId ?? user?.id ?? null;
  const isOwnProfile = !!user?.id && user.id === targetProfileId;
  const visibleUploads = isOwnProfile ? uploads : otherProfileUploads;

  useEffect(() => {
    if (visibleUploads.length > 0) {
      syncFeedLikeState(visibleUploads);
    }
  }, [visibleUploads, syncFeedLikeState]);
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
  const [avatarViewerVisible, setAvatarViewerVisible] = useState(false);
  const [profileUsername, setProfileUsername] = useState<string>("");
  const [profileDisplayName, setProfileDisplayName] = useState<string>("");
  const [profileBio, setProfileBio] = useState<string>("");
  const [profileAccountType, setProfileAccountType] =
    useState<AccountType>("consumer");
  const [profileContentTab, setProfileContentTab] =
    useState<ProfileContentTab>("posts");
  const isBusinessProfile = profileAccountType === "business";
  const profileTabs = useMemo<ProfileContentTab[]>(
    () =>
      isBusinessProfile
        ? ["posts", "shop", "saved"]
        : ["posts", "saved"],
    [isBusinessProfile]
  );
  const plusPulse = useRef(new Animated.Value(1)).current;

  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [uploadDraftMedia, setUploadDraftMedia] = useState<UploadDraftMedia | null>(
    null
  );
  const [captionDraft, setCaptionDraft] = useState("");
  const [hashtagsDraft, setHashtagsDraft] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedAudioUri, setSelectedAudioUri] = useState<string | null>(null);
  const [selectedAudioName, setSelectedAudioName] = useState<string | null>(null);
  const [selectedAudioVolume, setSelectedAudioVolume] = useState(AUDIO_VOLUME_NORMAL);
  const [productPickerVisible, setProductPickerVisible] = useState(false);
  const [uploadProducts, setUploadProducts] = useState<Product[]>([]);
  const [uploadProductsLoading, setUploadProductsLoading] = useState(false);
  const [uploadProductsLoadError, setUploadProductsLoadError] = useState(false);
  const [sellerCanLinkProducts, setSellerCanLinkProducts] = useState(false);
  const [productPickerQuery, setProductPickerQuery] = useState("");
  const selectedUploadProduct = useMemo(
    () => uploadProducts.find((product) => product.id === selectedProductId) ?? null,
    [selectedProductId, uploadProducts]
  );
  const parsedHashtagsPreview = useMemo(
    () => parseHashtagInput(hashtagsDraft),
    [hashtagsDraft],
  );
  const hashtagInputOverMax = useMemo(() => {
    const input = hashtagsDraft.trim();
    if (!input) {
      return false;
    }
    const tokens = input.split(/\s+/).filter(Boolean);
    const seen = new Set<string>();
    let count = 0;
    for (const tok of tokens) {
      let t = tok.replace(/^#+/, "").trim().toLowerCase();
      t = t.replace(/[^a-z0-9_]/g, "");
      if (!t || seen.has(t)) {
        continue;
      }
      seen.add(t);
      count += 1;
      if (count > 10) {
        return true;
      }
    }
    return false;
  }, [hashtagsDraft]);
  const [postStatsById, setPostStatsById] = useState<Record<string, PostStats>>(
    {}
  );

  useEffect(() => {
    if (!isOwnProfile) {
      setPostStatsById({});
      return;
    }

    const ids = visibleUploads
      .map((p) => p.id)
      .filter(isPersistablePostId);
    if (ids.length === 0) {
      setPostStatsById({});
      return;
    }

    let cancelled = false;
    void (async () => {
      const map = await fetchMyPostStats(ids);
      if (!cancelled) {
        setPostStatsById(map);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOwnProfile, visibleUploads]);

  const openProfileReels = useCallback(
    (post: UserVideoPost) => {
      if (!targetProfileId || visibleUploads.length === 0) {
        return;
      }
      navigation.navigate("ProfileReels", {
        profileId: targetProfileId,
        initialPostId: post.id,
        posts: visibleUploads,
        isOwnProfile,
      });
    },
    [navigation, targetProfileId, visibleUploads, isOwnProfile]
  );

  const resetUploadDrafts = useCallback(() => {
    setUploadDraftMedia(null);
    setCaptionDraft("");
    setHashtagsDraft("");
    setSelectedProductId(null);
    setSelectedAudioUri(null);
    setSelectedAudioName(null);
    setSelectedAudioVolume(AUDIO_VOLUME_NORMAL);
    setProductPickerVisible(false);
  }, []);

  useEffect(() => {
    if (!uploadModalVisible || !isOwnProfile || !isBusinessProfile) {
      setSellerCanLinkProducts(false);
      return;
    }
    let cancelled = false;
    void fetchMySellerOnboarding()
      .then((row) => {
        if (!cancelled) {
          setSellerCanLinkProducts(canSellerManageProducts(row));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSellerCanLinkProducts(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isBusinessProfile, isOwnProfile, uploadModalVisible]);

  useEffect(() => {
    if (!uploadDraftMedia || !sellerCanLinkProducts) {
      setUploadProducts([]);
      setUploadProductsLoading(false);
      setUploadProductsLoadError(false);
      return;
    }
    let cancelled = false;
    setUploadProductsLoading(true);
    setUploadProductsLoadError(false);
    void fetchMyLinkableProducts()
      .then((rows) => {
        if (!cancelled) {
          setUploadProducts(rows);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUploadProducts([]);
          setUploadProductsLoadError(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setUploadProductsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sellerCanLinkProducts, uploadDraftMedia]);

  useEffect(() => {
    if (!productPickerVisible || !sellerCanLinkProducts) {
      return;
    }
    let cancelled = false;
    setUploadProductsLoading(true);
    setUploadProductsLoadError(false);
    void fetchMyLinkableProducts()
      .then((rows) => {
        if (!cancelled) {
          setUploadProducts(rows);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUploadProducts([]);
          setUploadProductsLoadError(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setUploadProductsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [productPickerVisible, sellerCanLinkProducts]);

  const filteredUploadProducts = useMemo(() => {
    const q = productPickerQuery.trim().toLowerCase();
    if (!q) {
      return uploadProducts;
    }
    return uploadProducts.filter((product) => {
      const haystack = [product.name, product.brand, product.category]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [productPickerQuery, uploadProducts]);

  const dismissUploadModal = useCallback(() => {
    if (productPickerVisible) {
      setProductPickerVisible(false);
      return;
    }
    setUploadModalVisible(false);
    resetUploadDrafts();
  }, [productPickerVisible, resetUploadDrafts]);

  const openProductPicker = useCallback(() => {
    if (!sellerCanLinkProducts) {
      return;
    }
    setProductPickerQuery("");
    setProductPickerVisible(true);
  }, [sellerCanLinkProducts]);

  const selectUploadProduct = useCallback((product: Product) => {
    setSelectedProductId(product.id);
    setProductPickerVisible(false);
  }, []);

  const buildUploadOptions = useCallback(() => {
    return {
      hashtagsRaw: hashtagsDraft,
      caption: captionDraft,
      ...(selectedProductId ? { productId: selectedProductId } : {}),
    };
  }, [captionDraft, hashtagsDraft, selectedProductId]);

  const handleChooseUploadVideo = useCallback(() => {
    void (async () => {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Toegang nodig",
          "Sta toegang tot je fotobibliotheek toe om een video te kiezen."
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: false,
        quality: 0.6,
        videoMaxDuration: 30,
      });
      if (result.canceled || !result.assets[0]?.uri) {
        return;
      }
      setUploadDraftMedia({ kind: "video", asset: result.assets[0] });
    })();
  }, []);

  const handleChooseUploadPhotos = useCallback(() => {
    void (async () => {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Toegang nodig",
          "Sta toegang tot je fotobibliotheek toe om foto's te kiezen."
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.9,
      });
      if (result.canceled) {
        return;
      }
      const assets = (result.assets ?? []).filter((asset) => asset?.uri).slice(0, 10);
      if (assets.length === 0) {
        return;
      }
      setUploadDraftMedia({ kind: "photos", assets });
    })();
  }, []);

  const handlePlacePost = useCallback(() => {
    if (!uploadDraftMedia) {
      return;
    }
    const opts = buildUploadOptions();
    Keyboard.dismiss();
    setUploadModalVisible(false);

    const delayMs = Platform.OS === "ios" ? 700 : 500;
    setTimeout(() => {
      void (async () => {
        try {
          setUploadFlowBusy(true);
          const audioOption = selectedAudioUri
            ? {
                audio: {
                  localUri: selectedAudioUri,
                  displayName: selectedAudioName ?? "Eigen audio",
                  volume: selectedAudioVolume,
                },
              }
            : {};
          if (uploadDraftMedia.kind === "video") {
            await uploadVideoAsset(uploadDraftMedia.asset, {
              ...opts,
              ...audioOption,
            });
          } else {
            await uploadCarouselAssets(uploadDraftMedia.assets, {
              ...opts,
              ...audioOption,
            });
          }
        } finally {
          setUploadFlowBusy(false);
          resetUploadDrafts();
        }
      })();
    }, delayMs);
  }, [
    buildUploadOptions,
    resetUploadDrafts,
    uploadCarouselAssets,
    selectedAudioName,
    selectedAudioUri,
    selectedAudioVolume,
    uploadDraftMedia,
    uploadVideoAsset,
  ]);

  const loadProfile = useCallback(async () => {
    if (!targetProfileId) {
      setProfileAvatarUrl(null);
      setProfileUsername("");
      setProfileDisplayName("");
      setProfileBio("");
      setProfileAccountType("consumer");
      return;
    }
    const { data, error } = await supabase
      .from("profiles")
      .select("avatar_url, username, display_name, bio, account_type")
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
    setProfileAccountType(normalizeAccountType(data?.account_type));
  }, [targetProfileId]);

  const {
    uploading: avatarUploading,
    showPicker: onAvatarPress,
    cropModal: avatarCropModal,
  } = useAvatarPicker({
    userId: isOwnProfile ? user?.id : undefined,
    onSuccess: (publicUrl) => {
      setProfileAvatarUrl(publicUrl);
      void loadProfile();
    },
  });

  const handleAvatarPress = useCallback(() => {
    if (isOwnProfile) {
      void onAvatarPress();
      return;
    }
    if (hasProfileAvatar(profileAvatarUrl)) {
      setAvatarViewerVisible(true);
    }
  }, [isOwnProfile, onAvatarPress, profileAvatarUrl]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    setProfileContentTab("posts");
    setAvatarViewerVisible(false);
  }, [targetProfileId]);

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
    [deleteUserVideoPost, isOwnProfile]
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

  const onMakeBusinessAccount = useCallback(() => {
    if (!isOwnProfile || profileAccountType === "business") {
      return;
    }
    setSettingsVisible(false);
    navigation.navigate("SellerOnboarding");
  }, [isOwnProfile, navigation, profileAccountType]);

  const openSupportEmail = useCallback(() => {
    const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Kwaapo support")}`;
    void Linking.openURL(mailto).catch(() => {
      Alert.alert("Contact", `Mail ons op ${SUPPORT_EMAIL}`);
    });
  }, []);

  const openPolicy = useCallback(
    (policyId: (typeof SETTINGS_LEGAL_LINKS)[number]["policyId"]) => {
      setSettingsVisible(false);
      if (policyId === "account_deletion") {
        navigation.navigate("AccountDeletion");
        return;
      }
      if (policyId === "seller") {
        navigation.navigate("SellerTerms");
        return;
      }
      navigation.navigate("PolicyDocument", { policyId });
    },
    [navigation]
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
            onPress={handleAvatarPress}
            disabled={
              avatarUploading ||
              (!isOwnProfile && !hasProfileAvatar(profileAvatarUrl))
            }
            style={styles.avatarPressable}
            accessibilityRole="button"
            accessibilityLabel={
              isOwnProfile
                ? "Profielfoto kiezen"
                : hasProfileAvatar(profileAvatarUrl)
                  ? "Profielfoto vergroten"
                  : "Profielfoto van gebruiker"
            }
          >
            <AvatarImage uri={profileAvatarUrl} style={styles.avatar} />
            {isOwnProfile && !profileAvatarUrl ? (
              <View style={styles.avatarAddBadge}>
                <Animated.View style={{ transform: [{ scale: plusPulse }] }}>
                  <Ionicons name="add-circle" size={30} color={theme.accent} />
                </Animated.View>
              </View>
            ) : null}
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
          <View style={styles.statsRow}>
            <View style={styles.statsGroup}>
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
              {isOwnProfile && profileContentTab === "posts" ? (
                <Pressable
                  style={styles.stat}
                  onPress={() => {
                    if (isUploadBusy) return;
                    resetUploadDrafts();
                    setUploadModalVisible(true);
                  }}
                  disabled={isUploadBusy}
                  accessibilityRole="button"
                  accessibilityLabel="Uploaden"
                >
                  <View style={styles.uploadStatIcon}>
                    {isUploadBusy ? (
                      <ActivityIndicator size="small" color={theme.text} />
                    ) : (
                      <Ionicons name="add" size={20} color={theme.text} />
                    )}
                  </View>
                  <Text style={styles.statLabel}>
                    {isUploadBusy ? "Uploaden..." : "Uploaden"}
                  </Text>
                </Pressable>
              ) : null}
            </View>
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

        <ProfileContentTabs
          active={profileContentTab}
          onChange={setProfileContentTab}
          tabs={profileTabs}
        />

        {profileContentTab === "shop" && isBusinessProfile && targetProfileId ? (
          <ProfileShopGrid
            ownerId={targetProfileId}
            cellSize={cellSize}
            isOwnProfile={isOwnProfile}
          />
        ) : profileContentTab === "saved" && targetProfileId ? (
          <SavedPostsGrid
            userId={targetProfileId}
            cellSize={cellSize}
            isOwnProfile={isOwnProfile}
          />
        ) : (
        <View style={styles.grid}>
          {!isOwnProfile && otherUploadsLoading ? (
            <View style={styles.otherUploadsLoadingWrap}>
              <ActivityIndicator size="small" color={theme.accent} />
            </View>
          ) : null}
          {visibleUploads.map((p, i) => (
            <Pressable
              key={p.id}
              onPress={() => openProfileReels(p)}
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
                {isOwnProfile ? (
                  <View style={styles.gridViewsOverlay} pointerEvents="none">
                    <Ionicons
                      name="eye-outline"
                      size={13}
                      color="rgba(255,255,255,0.95)"
                    />
                    <Text style={styles.gridViewsText}>
                      {formatGridViewsCount(
                        postStatsById[p.id]?.viewsCount ?? 0
                      )}
                    </Text>
                    <Ionicons
                      name="heart-outline"
                      size={13}
                      color="rgba(255,255,255,0.95)"
                    />
                    <Text style={styles.gridViewsText}>
                      {formatGridViewsCount(p.likesCount ?? 0)}
                    </Text>
                    <Ionicons
                      name="chatbubble-outline"
                      size={12}
                      color="rgba(255,255,255,0.95)"
                    />
                    <Text style={styles.gridViewsText}>
                      {formatGridViewsCount(p.commentsCount ?? 0)}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
        )}
      </ScrollView>

      {isOwnProfile ? (
        <Modal
          visible={settingsVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setSettingsVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View
              style={[
                styles.modalSheet,
                styles.settingsModalSheet,
                { maxHeight: settingsSheetMaxHeight },
              ]}
            >
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

              <ScrollView
                style={[
                  styles.settingsModalScroll,
                  { maxHeight: settingsScrollMaxHeight },
                ]}
                contentContainerStyle={[
                  styles.settingsModalScrollContent,
                  { paddingBottom: insets.bottom + 24 },
                ]}
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
                bounces
                nestedScrollEnabled
              >
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Account</Text>
              <Pressable
                style={styles.rowButton}
                onPress={() => {
                  setSettingsVisible(false);
                  navigation.navigate("MyOrders");
                }}
              >
                <Text style={styles.rowLabel}>Mijn bestellingen</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
              </Pressable>
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
                onPress={() => openPolicy("account_deletion")}
              >
                <Text style={[styles.rowLabel, styles.dangerLabel]}>
                  Account verwijderen
                </Text>
                <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
              </Pressable>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Juridisch & privacy</Text>
              {SETTINGS_LEGAL_LINKS.filter((l) => l.policyId !== "account_deletion").map(
                (link) => (
                  <Pressable
                    key={link.policyId}
                    style={styles.rowButton}
                    onPress={() => openPolicy(link.policyId)}
                  >
                    <Text style={styles.rowLabel}>{link.label}</Text>
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={theme.textMuted}
                    />
                  </Pressable>
                )
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Mijn Winkel</Text>
              {isBusinessProfile ? (
                <>
                  <Pressable
                    style={styles.rowButton}
                    onPress={() => {
                      setSettingsVisible(false);
                      navigation.navigate("MyShop", {
                        initialTab: "orders",
                        orderFilter: "action_required",
                      });
                    }}
                  >
                    <Text style={styles.rowLabel}>Bestellingen</Text>
                    <View style={styles.rowButtonTrailing}>
                      {sellerOrdersToShipCount > 0 ? (
                        <View style={styles.settingsCountBadge}>
                          <Text style={styles.settingsCountBadgeText}>
                            {sellerOrdersToShipCount > 99
                              ? "99+"
                              : sellerOrdersToShipCount}
                          </Text>
                        </View>
                      ) : null}
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={theme.textMuted}
                      />
                    </View>
                  </Pressable>
                  <Pressable
                    style={styles.rowButton}
                    onPress={() => {
                      setSettingsVisible(false);
                      navigation.navigate("SellerTerms");
                    }}
                  >
                    <Text style={styles.rowLabel}>Seller-voorwaarden</Text>
                    <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
                  </Pressable>
                  <Pressable
                    style={styles.rowButton}
                    onPress={() => {
                      setSettingsVisible(false);
                      navigation.navigate("SellerOnboarding");
                    }}
                  >
                    <Text style={styles.rowLabel}>Verkoopaccount</Text>
                    <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
                  </Pressable>
                  <Pressable
                    style={styles.rowButton}
                    onPress={() => {
                      setSettingsVisible(false);
                      navigation.navigate("CreatorStats");
                    }}
                  >
                    <Text style={styles.rowLabel}>Shop statistieken</Text>
                    <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
                  </Pressable>
                </>
              ) : (
                <Pressable
                  style={styles.rowButton}
                  onPress={onMakeBusinessAccount}
                >
                  <Text style={styles.rowLabel}>Word verkoper</Text>
                  <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
                </Pressable>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Support</Text>
              <Pressable style={styles.rowButton} onPress={openSupportEmail}>
                <Text style={styles.rowLabel}>Contact & support</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
              </Pressable>
              <Pressable
                style={styles.rowButton}
                onPress={() => openPolicy("contact")}
              >
                <Text style={styles.rowLabel}>Privacyverzoeken</Text>
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
              </ScrollView>
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

      {avatarCropModal}

      <FullScreenImageModal
        visible={avatarViewerVisible}
        imageUri={profileAvatarUrl}
        onClose={() => setAvatarViewerVisible(false)}
      />

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
                  {
                    maxHeight: windowHeight - insets.top - 12,
                    paddingBottom: Math.max(insets.bottom, 16) + 8,
                  },
                ]}
                collapsable={false}
              >
                <Text style={styles.uploadSheetTitle}>Uploaden</Text>
                <ScrollView
                  style={styles.uploadSheetScroll}
                  contentContainerStyle={styles.uploadSheetScrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                {!uploadDraftMedia ? (
                  <View style={styles.uploadChoiceStack}>
                    <Pressable
                      style={styles.uploadChoiceButton}
                      onPress={(e) => {
                        e?.stopPropagation?.();
                        handleChooseUploadVideo();
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Video kiezen"
                    >
                      <Ionicons name="videocam-outline" size={24} color={theme.accent} />
                      <Text style={styles.uploadChoiceText}>Video kiezen</Text>
                    </Pressable>
                    <Pressable
                      style={styles.uploadChoiceButton}
                      onPress={(e) => {
                        e?.stopPropagation?.();
                        handleChooseUploadPhotos();
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Foto's kiezen"
                    >
                      <Ionicons name="images-outline" size={24} color={theme.accent} />
                      <Text style={styles.uploadChoiceText}>Foto's kiezen</Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <Text style={styles.uploadSheetSectionLabel}>
                      Voorvertoning
                    </Text>
                    {uploadDraftMedia.kind === "video" ? (
                      <Video
                        source={{ uri: uploadDraftMedia.asset.uri }}
                        style={styles.uploadPreviewVideo}
                        resizeMode={ResizeMode.COVER}
                        shouldPlay={false}
                        isMuted
                        useNativeControls
                      />
                    ) : (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.uploadPreviewPhotoRow}
                      >
                        {uploadDraftMedia.assets.map((asset, index) => (
                          <Image
                            key={`${asset.uri}-${index}`}
                            source={{ uri: asset.uri }}
                            style={styles.uploadPreviewPhoto}
                          />
                        ))}
                      </ScrollView>
                    )}
                <AudioPickerCard
                  selectedUri={selectedAudioUri}
                  selectedName={selectedAudioName}
                  volume={selectedAudioVolume}
                  onSelected={(uri, name) => {
                    setSelectedAudioUri(uri);
                    setSelectedAudioName(name);
                  }}
                  onClear={() => {
                    setSelectedAudioUri(null);
                    setSelectedAudioName(null);
                    setSelectedAudioVolume(AUDIO_VOLUME_NORMAL);
                  }}
                  onVolumeChange={setSelectedAudioVolume}
                />
                <Text style={styles.uploadSheetLabel}>Beschrijving</Text>
                <TextInput
                  style={[styles.uploadSheetInput, styles.uploadSheetCaptionInput]}
                  placeholder="Vertel iets over je outfit..."
                  placeholderTextColor={theme.placeholder}
                  value={captionDraft}
                  onChangeText={setCaptionDraft}
                  maxLength={150}
                  multiline
                />
                <Text style={styles.uploadSheetLabel}>Hashtags</Text>
                <Text style={styles.uploadSheetHashtagHelp}>
                  Maximaal 10 hashtags. Gebruik bijvoorbeeld #summer #sport.
                </Text>
                <TextInput
                  style={[styles.uploadSheetInput, styles.uploadSheetHashtagInput]}
                  placeholder="#oldmoney #zomervibe #classy"
                  placeholderTextColor={theme.placeholder}
                  value={hashtagsDraft}
                  onChangeText={setHashtagsDraft}
                  autoCorrect={false}
                  autoCapitalize="none"
                  multiline
                />
                <View style={styles.uploadSheetHashtagMeta}>
                  {parsedHashtagsPreview.length > 0 ? (
                    <View style={styles.uploadSheetChipRow}>
                      {parsedHashtagsPreview.map((tag) => (
                        <View key={tag} style={styles.uploadSheetChip}>
                          <Text style={styles.uploadSheetChipText}>#{tag}</Text>
                        </View>
                      ))}
                    </View>
                  ) : hashtagsDraft.trim().length === 0 ? (
                    <Text style={styles.uploadSheetHashtagHint}>
                      Voeg 1–3 hashtags toe voor betere aanbevelingen.
                    </Text>
                  ) : null}
                  {hashtagsDraft.trim().length > 0 &&
                  parsedHashtagsPreview.length === 0 ? (
                    <Text style={styles.uploadSheetHashtagWarn}>
                      Geen geldige hashtags gevonden. Gebruik alleen letters, cijfers
                      en _.
                    </Text>
                  ) : null}
                  {hashtagInputOverMax ? (
                    <Text style={styles.uploadSheetHashtagLimit}>
                      Maximaal 10 hashtags worden opgeslagen.
                    </Text>
                  ) : null}
                </View>
                {sellerCanLinkProducts ? (
                  <>
                    <Text style={styles.uploadSheetSectionLabel}>Product toevoegen</Text>
                    <Text style={styles.uploadSheetHashtagHelp}>
                      Maak je video direct shoppable door een product te koppelen.
                    </Text>
                    {uploadProductsLoading && uploadProducts.length === 0 ? (
                      <View style={styles.uploadProductLoadingRow}>
                        <ActivityIndicator size="small" color={theme.accent} />
                        <Text style={styles.uploadProductLoadingText}>
                          Producten laden…
                        </Text>
                      </View>
                    ) : selectedUploadProduct ? (
                      <View style={styles.linkedProductCard}>
                        <Text style={styles.linkedProductEyebrow}>Gekoppeld product</Text>
                        <View style={styles.linkedProductPreviewRow}>
                          {selectedUploadProduct.images[0] ? (
                            <Image
                              source={{ uri: selectedUploadProduct.images[0] }}
                              style={styles.linkedProductThumb}
                            />
                          ) : (
                            <View
                              style={[
                                styles.linkedProductThumb,
                                styles.linkedProductThumbFallback,
                              ]}
                            >
                              <Ionicons
                                name="bag-outline"
                                size={18}
                                color={theme.textMuted}
                              />
                            </View>
                          )}
                          <View style={styles.linkedProductPreviewText}>
                            <Text style={styles.linkedProductName} numberOfLines={1}>
                              {selectedUploadProduct.name}
                            </Text>
                            <Text style={styles.linkedProductPrice}>
                              {formatPriceEur(selectedUploadProduct.price)}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.linkedProductActions}>
                          <Pressable
                            style={styles.linkedProductAction}
                            onPress={openProductPicker}
                            accessibilityRole="button"
                            accessibilityLabel="Product wijzigen"
                          >
                            <Text style={styles.linkedProductActionText}>Wijzigen</Text>
                          </Pressable>
                          <Pressable
                            style={styles.linkedProductAction}
                            onPress={() => setSelectedProductId(null)}
                            accessibilityRole="button"
                            accessibilityLabel="Product verwijderen"
                          >
                            <Text style={styles.linkedProductRemoveText}>
                              Verwijderen
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <View style={styles.uploadProductChoices}>
                        <Pressable
                          style={styles.addProductTagButton}
                          onPress={openProductPicker}
                          accessibilityRole="button"
                          accessibilityLabel="Product toevoegen"
                        >
                          <Ionicons name="pricetag-outline" size={18} color={theme.accent} />
                          <Text style={styles.addProductTagText}>Product toevoegen</Text>
                        </Pressable>
                        {!uploadProductsLoading &&
                        !uploadProductsLoadError &&
                        uploadProducts.length === 0 ? (
                          <Text style={styles.uploadProductEmptyHint}>
                            Je hebt nog geen producten in je shop. Voeg eerst een product
                            toe om het aan je video te koppelen.
                          </Text>
                        ) : null}
                      </View>
                    )}
                  </>
                ) : null}
                <View style={styles.uploadSheetStack}>
                  <Pressable
                    style={[styles.uploadSheetBtnPrimary, styles.uploadSheetFullWidth]}
                    onPress={(e) => {
                      e?.stopPropagation?.();
                      handlePlacePost();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Plaatsen"
                  >
                    <Text style={styles.uploadSheetBtnPrimaryText}>Plaatsen</Text>
                  </Pressable>
                </View>
                  </>
                )}
                <Pressable
                  style={[styles.uploadSheetBtnSecondary, styles.uploadSheetCancelBelow]}
                  onPress={dismissUploadModal}
                  accessibilityRole="button"
                  accessibilityLabel="Annuleren"
                >
                  <Text style={styles.uploadSheetBtnSecondaryText}>Annuleren</Text>
                </Pressable>
                </ScrollView>
                {sellerCanLinkProducts ? (
                  <UploadProductPickerPanel
                    visible={productPickerVisible}
                    bottomInset={insets.bottom}
                    products={filteredUploadProducts}
                    loading={uploadProductsLoading}
                    loadError={uploadProductsLoadError}
                    query={productPickerQuery}
                    onQueryChange={setProductPickerQuery}
                    selectedProductId={selectedProductId}
                    onSelect={selectUploadProduct}
                    onClose={() => setProductPickerVisible(false)}
                  />
                ) : null}
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
                    <AvatarImage uri={item.avatar_url} style={styles.followAvatar} />

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

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
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
  avatarAddBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
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
  statsRow: {
    marginTop: 18,
    width: "100%",
    alignItems: "center",
  },
  statsGroup: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 22,
  },
  stat: {
    alignItems: "center",
    minWidth: 52,
  },
  statNum: {
    color: theme.text,
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 22,
  },
  statLabel: {
    marginTop: 2,
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  uploadStatIcon: {
    height: 22,
    alignItems: "center",
    justifyContent: "center",
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
  gridViewsOverlay: {
    position: "absolute",
    left: 8,
    bottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  gridViewsText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
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
  settingsModalSheet: {
    width: "100%",
  },
  settingsModalScroll: {
    flexShrink: 1,
  },
  settingsModalScrollContent: {
    flexGrow: 1,
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
  dangerLabel: {
    color: "#ff8a84",
  },
  rowButtonTrailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  settingsCountBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsCountBadgeText: {
    color: theme.bg,
    fontSize: 12,
    fontWeight: "900",
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
  productPickerSubtitle: {
    color: theme.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  productPickerLoading: {
    minHeight: 140,
    alignItems: "center",
    justifyContent: "center",
  },
  productPickerList: {
    paddingBottom: 8,
  },
  productPickerRow: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  productPickerThumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: theme.bgElevated,
  },
  productPickerThumbFallback: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  productPickerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  productPickerName: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "700",
  },
  productPickerPrice: {
    color: theme.accent,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 3,
  },
  productPickerSelected: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.accent,
  },
  productPickerEmpty: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
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
    flexShrink: 1,
    position: "relative",
    overflow: "hidden",
  },
  uploadSheetScroll: {
    flexShrink: 1,
  },
  uploadSheetScrollContent: {
    paddingBottom: 4,
  },
  uploadSheetTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 14,
  },
  uploadChoiceStack: {
    gap: 12,
    marginBottom: 14,
  },
  uploadChoiceButton: {
    minHeight: 56,
    borderRadius: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  uploadChoiceText: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "800",
  },
  uploadPreviewVideo: {
    height: 220,
    borderRadius: 14,
    backgroundColor: "#000",
    marginBottom: 14,
    overflow: "hidden",
  },
  uploadPreviewPhotoRow: {
    gap: 8,
    marginBottom: 14,
  },
  uploadPreviewPhoto: {
    width: 110,
    height: 140,
    borderRadius: 12,
    backgroundColor: theme.bg,
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
  uploadSheetHashtagHelp: {
    color: theme.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 6,
    marginTop: -2,
  },
  uploadSheetHashtagInput: {
    minHeight: 48,
    marginBottom: 8,
  },
  uploadSheetHashtagMeta: {
    marginBottom: 14,
    gap: 6,
  },
  uploadSheetChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  uploadSheetChip: {
    backgroundColor: theme.accentSoft,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.accentBorder,
  },
  uploadSheetChipText: {
    color: theme.accent,
    fontSize: 12,
    fontWeight: "600",
  },
  uploadSheetHashtagHint: {
    color: theme.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  uploadSheetHashtagWarn: {
    color: "rgba(255, 160, 140, 0.95)",
    fontSize: 12,
    lineHeight: 17,
  },
  uploadSheetHashtagLimit: {
    color: theme.textMuted,
    fontSize: 12,
    lineHeight: 17,
    fontStyle: "italic",
  },
  uploadSheetSectionLabel: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 2,
  },
  addProductTagButton: {
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    backgroundColor: "rgba(255,255,255,0.04)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  addProductTagText: {
    flex: 1,
    color: theme.text,
    fontSize: 14,
    fontWeight: "700",
  },
  addProductTagOptional: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  uploadProductChoices: {
    gap: 8,
    marginBottom: 14,
  },
  skipProductBtn: {
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  skipProductBtnText: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: "700",
  },
  productPickerSearch: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: theme.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    color: theme.text,
    paddingHorizontal: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  linkedProductCard: {
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.accentBorder,
    backgroundColor: theme.accentLight,
  },
  linkedProductHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  linkedProductEyebrow: {
    color: theme.accent,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  linkedProductPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  linkedProductThumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: theme.bg,
  },
  linkedProductThumbFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  linkedProductPreviewText: {
    flex: 1,
    minWidth: 0,
  },
  uploadProductLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
    paddingVertical: 8,
  },
  uploadProductLoadingText: {
    color: theme.textMuted,
    fontSize: 13,
  },
  uploadProductEmptyHint: {
    color: theme.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  linkedProductName: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "800",
  },
  linkedProductPrice: {
    color: theme.accent,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 3,
  },
  linkedProductActions: {
    flexDirection: "row",
    gap: 16,
    marginTop: 10,
  },
  linkedProductAction: {
    paddingVertical: 4,
  },
  linkedProductActionText: {
    color: theme.text,
    fontSize: 13,
    fontWeight: "700",
  },
  linkedProductRemoveText: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: "700",
  },
  uploadSheetProductInput: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: theme.text,
    fontSize: 14,
    marginBottom: 8,
  },
  uploadSheetProductRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 6,
  },
  uploadSheetProductHalf: {
    flex: 1,
    marginBottom: 0,
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
    color: theme.accentText,
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
}
