import React from 'react';
import { StyleSheet, View, ScrollView, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '@/theme/theme';

interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  /** Apply the bottom safe-area inset as padding (off when a fixed footer handles it). */
  padBottom?: boolean;
  contentStyle?: ViewStyle;
}

/** Page wrapper: dark background + safe-area handling, optionally scrollable. */
export function Screen({ children, scroll, padBottom = true, contentStyle }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const pad = {
    paddingTop: insets.top,
    paddingBottom: padBottom ? insets.bottom : 0,
  };

  if (scroll) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: padBottom ? insets.bottom + spacing.xl : spacing.xl },
            contentStyle,
          ]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </View>
    );
  }

  return <View style={[styles.root, pad, contentStyle]}>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
});
