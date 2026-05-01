import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useUserUploads,
  type UserVideoPost,
} from "../context/UserUploadsContext";
import { FullscreenVideoPlayer } from "../components/FullscreenVideoPlayer";
import { useCloudVideoUpload } from "../hooks/useCloudVideoUpload";
import { PROFILE_POSTS } from "../data/placeholder";
import { theme } from "../constants/theme";

const GAP = 2;
type ProfilePost = {
  uri: string;
  kind: "image" | "video";
  fileName?: string;
  thumbUri?: string;
};

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cellSize = (width - GAP * 2) / 3;
  const [profilePosts, setProfilePosts] = useState<ProfilePost[]>(
    PROFILE_POSTS.map((uri) => ({ uri, kind: "image" }))
  );
  const { uploadedVideoPosts, deleteUserVideoPost } = useUserUploads();
  const uploads = useMemo(
    () =>
      uploadedVideoPosts.filter(
        (post) => typeof post.videoUrl === "string" && post.videoUrl.length > 0
      ),
    [uploadedVideoPosts]
  );
  const gridItems = useMemo(
    () =>
      [
        ...uploads.map((p) => ({
          kind: "cloudVideo" as const,
          post: p,
        })),
        ...profilePosts.map((p) => ({
          kind: "local" as const,
          post: p,
        })),
      ],
    [uploads, profilePosts]
  );
  const [activeVideoPost, setActiveVideoPost] = useState<UserVideoPost | null>(
    null
  );
  const closeVideoViewer = useCallback(() => {
    setActiveVideoPost(null);
  }, []);

  useEffect(() => {
    if (__DEV__ && activeVideoPost) {
      console.log("[Profile] open viewer, selectedPost:", activeVideoPost);
      console.log("[Profile] selectedPost.videoUrl:", activeVideoPost.videoUrl);
    }
  }, [activeVideoPost]);

  useLayoutEffect(() => {
    if (__DEV__ && activeVideoPost) {
      console.log(
        "[Profile] before <video> / native player, videoUrl:",
        activeVideoPost.videoUrl
      );
    }
  }, [activeVideoPost]);

  useEffect(() => {
    if (!__DEV__) {
      return;
    }
    console.log("[Profile] restored uploads count", uploads.length);
    for (const post of uploads) {
      console.log("[Profile] grid item", {
        id: post.id,
        videoUrl: post.videoUrl,
        thumbnailUrl: post.thumbnailUrl ?? null,
      });
    }
  }, [uploads]);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [darkModeEnabled, setDarkModeEnabled] = useState(true);
  const { isUploading, pickAndUploadVideo } = useCloudVideoUpload();

  const showStubMessage = (label: string) => {
    Alert.alert(label, "Deze optie is alvast voorbereid als placeholder.");
  };

  const confirmDeleteCloudVideo = useCallback(
    (p: UserVideoPost) => {
      Alert.alert(
        "Video verwijderen?",
        "Deze actie is permanent in je account. Je kunt dit niet ongedaan maken.",
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
    [activeVideoPost?.id, deleteUserVideoPost]
  );

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: 120 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topActions}>
          <Pressable
            style={styles.iconButton}
            onPress={() => setSettingsVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
          >
            <Ionicons name="settings-outline" size={22} color={theme.text} />
          </Pressable>
        </View>

        <View style={styles.header}>
          <Image
            source={{
              uri: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&q=80",
            }}
            style={styles.avatar}
          />
          <Text style={styles.name}>@mara.veldt</Text>
          <Text style={styles.bio}>
            Editorial stylist · slow fashion · Berlin
          </Text>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statNum}>128</Text>
              <Text style={styles.statLabel}>looks</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statNum}>42k</Text>
              <Text style={styles.statLabel}>saved</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statNum}>1.1k</Text>
              <Text style={styles.statLabel}>following</Text>
            </View>

            <Pressable
              style={styles.statsAddButton}
              onPress={pickAndUploadVideo}
              disabled={isUploading}
              accessibilityRole="button"
              accessibilityLabel="Upload video"
            >
              <View style={styles.statsAddCircle}>
                {isUploading ? (
                  <ActivityIndicator size="small" color={theme.text} />
                ) : (
                  <Ionicons name="add" size={24} color={theme.text} />
                )}
              </View>
              <Text style={styles.statsAddText}>
                {isUploading ? "Uploaden..." : "Uploaden"}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.grid}>
          {gridItems.map((item, i) => {
            if (item.kind === "cloudVideo") {
              const p = item.post;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => {
                    if (__DEV__) {
                      console.log("[Profile] opening viewer, selectedPost:", p);
                      console.log("[Profile] videoUrl to play:", p.videoUrl);
                    }
                    setActiveVideoPost(p);
                  }}
                  onLongPress={() => confirmDeleteCloudVideo(p)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open video ${p.filename}`}
                  accessibilityHint="Dubbel tik om te openen, lang indrukken om te verwijderen"
                  style={[
                    styles.cell,
                    { width: cellSize },
                    { marginRight: i % 3 === 2 ? 0 : GAP, marginBottom: GAP },
                  ]}
                >
                  <View style={styles.thumbWithOverlay}>
                    {p.thumbnailUrl ? (
                      <Image
                        source={{ uri: p.thumbnailUrl }}
                        style={styles.thumb}
                      />
                    ) : (
                      <View style={styles.videoThumb}>
                        <Ionicons name="play-circle" size={24} color={theme.text} />
                      </View>
                    )}
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
                  </View>
                </Pressable>
              );
            }

            const post = item.post;
            return (
              <View
                key={`${post.uri}-${i}`}
                style={[
                  styles.cell,
                  { width: cellSize },
                  { marginRight: i % 3 === 2 ? 0 : GAP, marginBottom: GAP },
                ]}
              >
                {post.kind === "image" ? (
                  <Image source={{ uri: post.uri }} style={styles.thumb} />
                ) : post.thumbUri ? (
                  <Image source={{ uri: post.thumbUri }} style={styles.thumb} />
                ) : post.fileName ? (
                  <View style={styles.videoThumb}>
                    <Ionicons name="play-circle" size={24} color={theme.text} />
                  </View>
                ) : (
                  <View style={styles.videoThumb}>
                    <Ionicons name="play-circle" size={24} color={theme.text} />
                  </View>
                )}
              </View>
            );
          })}
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
          <Pressable
            onPress={closeVideoViewer}
            style={[
              styles.videoCloseButton,
              { top: insets.top + 6, right: 12 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Sluit video"
            hitSlop={12}
          >
            <Ionicons name="close" size={30} color={theme.text} />
          </Pressable>
          {activeVideoPost ? (
            <View style={styles.videoStage}>
              <FullscreenVideoPlayer
                videoId={activeVideoPost.id}
                videoUrl={activeVideoPost.videoUrl}
              />
            </View>
          ) : null}
        </View>
      </Modal>

      <Modal
        visible={settingsVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSettingsVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
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
                onPress={() => showStubMessage("Account settings")}
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
              onPress={() => showStubMessage("Log out")}
            >
              <Text style={styles.logoutText}>Log out</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  content: {
    paddingHorizontal: 0,
  },
  topActions: {
    alignItems: "flex-end",
    paddingHorizontal: 12,
    marginBottom: 8,
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
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: theme.border,
  },
  name: {
    marginTop: 14,
    color: theme.text,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.3,
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
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
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
  videoModalRoot: {
    flex: 1,
    backgroundColor: "#000",
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
});
