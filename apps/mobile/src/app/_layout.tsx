import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { colors } from '../theme/token';
import { RouteSessionProvider } from '../state/RouteSession';

export default function RootLayout() {
  return (
    <RouteSessionProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{
        contentStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerStyle: { backgroundColor: colors.background },
        // 제목은 화면 안의 큰 글씨가 맡는다. 상단 막대는 뒤로 가기만 남긴다
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        headerTitle: '',
      }}>
        <Stack.Screen name="index" options={{ title: '홈', headerShown: false }} />
        {/* 카메라가 화면 전체를 쓰고 뒤로 가기는 화면 안의 둥근 버튼이 맡는다 */}
        <Stack.Screen name="guide" options={{ title: '길 안내', headerShown: false }} />
        <Stack.Screen name="stations" options={{ title: '역 선택' }} />
      </Stack>
    </RouteSessionProvider>
  );
}
