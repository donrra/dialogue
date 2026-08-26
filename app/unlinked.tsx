import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, spacing } from '@/theme/theme';
import { useConversations } from '@/context/ConversationsContext';
import { ConversationCard } from '@/components/ConversationCard';

/** Older sessions that don't belong to a client folder yet. */
export default function UnlinkedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { conversations } = useConversations();
  const unlinked = conversations.filter((c) => !c.clientId);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
          <Text style={styles.iconText}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Uden klient</Text>
        <View style={{ width: 32 }} />
      </View>

      <FlatList
        data={unlinked}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + 40 }}
        ListHeaderComponent={
          <Text style={styles.hint}>
            Sessioner uden mappe. Åbn en session og vælg en klient for at flytte
            den på plads.
          </Text>
        }
        renderItem={({ item }) => (
          <ConversationCard
            conversation={item}
            onPress={() =>
              router.push(
                item.status === 'recording'
                  ? `/record/${item.id}`
                  : `/conversation/${item.id}`,
              )
            }
          />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>Alle sessioner ligger i en klient-mappe.</Text>
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  iconBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  iconText: { color: colors.text, fontSize: 30, lineHeight: 30 },
  headerTitle: { color: colors.text, fontSize: font.size.lg, fontWeight: font.weight.semibold },
  hint: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  empty: { color: colors.textFaint, fontSize: font.size.sm, textAlign: 'center', marginTop: 40 },
});
