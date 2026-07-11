import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { spacing } from "../../constants/theme";
import { useThemedStyles } from "../../hooks/useThemedStyles";
import type { AppTheme } from "../../constants/theme";
import { BackToTopButton } from "./BackToTopButton";
import { LegalBulletList } from "./LegalBulletList";
import { LegalNotice } from "./LegalNotice";
import type { TermsBlock } from "../../constants/termsOfUseContent";

type Props = {
  id: string;
  number: number;
  title: string;
  blocks: TermsBlock[];
  onLayout?: (id: string, y: number) => void;
  onBackToTop: () => void;
  testID?: string;
};

export function LegalSection({
  id,
  number,
  title,
  blocks,
  onLayout,
  onBackToTop,
  testID,
}: Props) {
  const styles = useThemedStyles(createStyles);

  return (
    <View
      style={styles.section}
      testID={testID ?? `terms-section-${id}`}
      onLayout={(e) => onLayout?.(id, e.nativeEvent.layout.y)}
    >
      <Text style={styles.chapterLabel} accessibilityRole="header">
        Hoofdstuk {number}
      </Text>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.divider} />

      {blocks.map((block, index) => {
        const key = `${id}-block-${index}`;
        if (block.type === "paragraph") {
          return (
            <Text key={key} style={styles.paragraph}>
              {block.text}
            </Text>
          );
        }
        if (block.type === "subsection") {
          return (
            <View key={key} style={styles.subsection}>
              <Text style={styles.subsectionTitle}>{block.title}</Text>
              {block.paragraphs.map((p, pi) => (
                <Text key={`${key}-p-${pi}`} style={styles.paragraph}>
                  {p}
                </Text>
              ))}
              {block.bullets ? <LegalBulletList items={block.bullets} /> : null}
            </View>
          );
        }
        if (block.type === "numbered") {
          return (
            <View key={key} style={styles.numberedWrap}>
              {block.items.map((item, ni) => (
                <View key={`${key}-n-${ni}`} style={styles.numberedRow}>
                  <Text style={styles.numberedIndex}>{ni + 1}.</Text>
                  <Text style={styles.numberedText}>{item}</Text>
                </View>
              ))}
            </View>
          );
        }
        if (block.type === "bullets") {
          return <LegalBulletList key={key} items={block.items} />;
        }
        if (block.type === "notice") {
          return (
            <LegalNotice key={key} title={block.title} body={block.body} />
          );
        }
        return null;
      })}

      <BackToTopButton onPress={onBackToTop} />
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    section: {
      marginBottom: spacing.xl,
    },
    chapterLabel: {
      color: theme.accent,
      fontSize: 13,
      fontWeight: "700",
      letterSpacing: 0.4,
      marginBottom: spacing.xs,
      textTransform: "uppercase",
    },
    title: {
      color: theme.text,
      fontSize: 22,
      fontWeight: "800",
      lineHeight: 28,
      marginBottom: spacing.sm,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.border,
      marginBottom: spacing.md,
    },
    subsection: {
      marginBottom: spacing.md,
    },
    subsectionTitle: {
      color: theme.text,
      fontSize: 17,
      fontWeight: "700",
      lineHeight: 24,
      marginBottom: spacing.xs,
    },
    paragraph: {
      color: theme.textMuted,
      fontSize: 16,
      lineHeight: 24,
      marginBottom: spacing.md,
    },
    numberedWrap: {
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    numberedRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
    },
    numberedIndex: {
      color: theme.accent,
      fontSize: 15,
      fontWeight: "700",
      width: 22,
      lineHeight: 22,
    },
    numberedText: {
      flex: 1,
      color: theme.textMuted,
      fontSize: 16,
      lineHeight: 24,
    },
  });
}
