import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { tokens } from '../theme/token';
import { RouteSessionProvider } from '../state/RouteSession';

export default function RootLayout() {
  return (
    <RouteSessionProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{
        contentStyle: { backgroundColor: tokens.colors.background },
        headerTintColor: tokens.colors.text,
        headerTransparent: false,
        headerStyle: { backgroundColor: tokens.colors.background },
      }}>
        <Stack.Screen name="index" options={{ title: '홈', headerShown: false }} />
        <Stack.Screen name="guide" options={{ title: '길 안내' }} />
        <Stack.Screen name="stations" options={{ title: '역 선택' }} />
        <Stack.Screen name="preview" options={{ title: '경로 미리보기' }} />
        <Stack.Screen name="voice" options={{ title: '말로 길 찾기' }} />
      </Stack>
    </RouteSessionProvider>
  );
}
