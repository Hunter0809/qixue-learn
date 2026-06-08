import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../styles/theme";

export function MobileCard({
  title,
  meta,
  children,
  onPress
}: {
  title: string;
  meta?: string;
  children?: ReactNode;
  onPress?: () => void;
}) {
  const content = (
    <>
      <View style={styles.header}>
        <Text numberOfLines={1} style={styles.title}>{title}</Text>
        {meta ? <Text numberOfLines={1} style={styles.meta}>{meta}</Text> : null}
      </View>
      {children ? <View style={styles.body}>{children}</View> : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
        {content}
      </Pressable>
    );
  }

  return (
    <View style={styles.card}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm
  },
  pressed: {
    borderColor: colors.blue,
    backgroundColor: "#f3ead2"
  },
  header: {
    gap: 4
  },
  title: {
    ...typography.title,
    color: colors.text
  },
  meta: {
    ...typography.meta,
    color: colors.blue
  },
  body: {
    gap: spacing.sm
  }
});
