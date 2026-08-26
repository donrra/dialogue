import React, { useEffect } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, radius, spacing } from '@/theme/theme';
import { useConversations } from '@/context/ConversationsContext';
import { useRecording } from '@/context/RecordingContext';
import { getTranscription } from '@/lib/transcription';
import { Button } from '@/components/Button';
import { ConversationCard } from '@/components/ConversationCard';
import { LiveBanner } from '@/components/LiveBanner';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { conversations, loading, update } = useConversations();
  const { activeConversationId } = useRecording();

  // Poll transcription status while on screen
  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      const interval = setInterval(async () => {
        if (!active) return;
        for (const c of conversations) {
          if (c.status === 'recorded') {
            const tr = await getTranscription(c.id);
            if (active && tr?.status === 'done') {
              update(c.id, { status: 'transcribed' });
            }
          }
        }
      }, 3000);
      return () => {
        active = false;
        clearInterval(interval);
      };
    }, [conversations, update]),
  );

  return (
    <View style={styles.root}>
      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{
          paddingTop: insets.top + spacing.lg,
          paddingHorizontal: spacing.xl,
          paddingBottom: 120,
        }}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.kicker}>SAMTALER</Text>
            <Text style={styles.title}>Dialogue</Text>
            {activeConversationId && (
              <LiveBanner
                onPress={() => router.push(`/record/${activeConversationId}`)}
              />
            )}
          </View>
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
          !loading ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Text style={styles.emptyGlyph}>🎙️</Text>
              </View>
              <Text style={styles.emptyTitle}>Ingen samtaler endnu</Text>
              <Text style={styles.emptyBody}>
                Start en ny samtale, tilføj hvem der er med, og optag — også med
                slukket skærm.
              </Text>
            </View>
          ) : null
        }
        showsVerticalScrollIndicator={false}
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button
          label="Ny samtale"
          onPress={() => router.push('/new')}
          icon={<Text style={styles.plus}>＋</Text>}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { marginBottom: spacing.lg },
  kicker: {
    color: colors.accentSoft,
    fontSize: font.size.xs,
    fontWeight: font.weight.bold,
    letterSpacing: 2,
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: font.size.display,
    fontWeight: font.weight.bold,
    letterSpacing: -1,
  },
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: spacing.lg },
  emptyIcon: {
    width: 84,
    height: 84,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  emptyGlyph: { fontSize: 36 },
  emptyTitle: {
    color: colors.text,
    fontSize: font.size.lg,
    fontWeight: font.weight.semibold,
    marginBottom: spacing.sm,
  },
  emptyBody: {
    color: colors.textMuted,
    fontSize: font.size.md,
    textAlign: 'center',
    lineHeight: 22,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  plus: { color: colors.white, fontSize: font.size.lg, fontWeight: font.weight.bold },
});
