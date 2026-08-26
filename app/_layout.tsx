import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConversationsProvider } from '@/context/ConversationsContext';
import { RecordingProvider } from '@/context/RecordingContext';
import { ensureSession } from '@/lib/supabase';
import { colors } from '@/theme/theme';

export default function RootLayout() {
  // Sign in anonymously in the background so uploads/transcripts work later.
  useEffect(() => {
    ensureSession();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <ConversationsProvider>
          <RecordingProvider>
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.bg },
                animation: 'slide_from_right',
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="new" options={{ animation: 'slide_from_bottom' }} />
              <Stack.Screen name="record/[id]" options={{ gestureEnabled: false }} />
              <Stack.Screen name="conversation/[id]" />
            </Stack>
          </RecordingProvider>
        </ConversationsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
