import { useState } from 'react';
import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CONTENT_MAX_WIDTH, colors, useUi } from '../theme/token';
import type { Station } from '../api/stations';
import { StationInput, StationResults, useStationField } from '../components/StationPicker';
import Button from '../components/ui/Button';
import Yeokdu from '../components/ui/Yeokdu';
import { requestRoute } from '../api/routes';
import { useRouteSession } from '../state/RouteSession';

export default function StationSelectionScreen() {
  const ui = useUi();
  const [origin, setOrigin] = useState<Station | null>(null);
  const [destination, setDestination] = useState<Station | null>(null);
  const [loading, setLoading] = useState(false);
  const { setRoute } = useRouteSession();
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState<'origin' | 'destination'>('origin');
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL ?? '';

  const originField = useStationField('출발역', apiBaseUrl, origin, (station) => {
    setOrigin(station);
    setRoute(null);
    setError(null);
  });
  const destinationField = useStationField('도착역', apiBaseUrl, destination, (station) => {
    setDestination(station);
    setRoute(null);
    setError(null);
  });
  const sameStation = Boolean(origin && destination && origin.id === destination.id);

  async function handleFindRoute() {
    if (!origin || !destination || origin.id === destination.id || loading) return;
    setLoading(true);
    setRoute(null);
    setError(null);
    if (__DEV__) console.log('[routes:request]', {
      origin_station_id: origin.id,
      destination_station_id: destination.id,
    });
    try {
      const result = await requestRoute(apiBaseUrl, origin.id, destination.id);
      setRoute(result);
      if (__DEV__) console.log('[routes:response]', result);
      router.push('/guide');
    } catch (error) {
      const message = error instanceof Error ? error.message : '길 찾기에 실패했습니다.';
      setError(message);
      if (__DEV__) console.warn('[routes:error]', message);
    } finally {
      setLoading(false);
    }
  }

  const notice = error ?? (sameStation ? '출발역과 도착역은 다르게 선택해 주세요.' : null);
  const column = { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' } as const;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[column, { paddingHorizontal: ui.space.lg, paddingBottom: ui.space.lg }]}
        >
          <Text accessibilityRole="header" style={[ui.type.title, { marginTop: ui.space.sm, marginBottom: ui.space.lg }]}>
            어디로 가시나요?
          </Text>

          {/* 출발 → 도착을 세로 선 하나로 잇는다. 두 칸이 한 경로라는 걸 상자 없이 보여 준다 */}
          <View>
            <View accessible={false} style={{
              position: 'absolute',
              left: ui.px(7) - 1, // 표시 점(14) 가운데
              // 각 줄 가운데(표시 점)에서 시작하고 끝난다
              top: (ui.touch + ui.space.sm) / 2,
              bottom: (ui.touch + ui.space.sm) / 2,
              width: 2,
              backgroundColor: colors.border,
            }} />
            <StationInput field={originField} placeholder="예: 홍제" marker="origin" disabled={loading}
              onFocus={() => setFocused('origin')} autoFocus />
            <View style={{ height: 1, backgroundColor: colors.border, marginLeft: ui.px(14) + ui.space.md }} />
            <StationInput field={destinationField} placeholder="예: 잠원" marker="destination" disabled={loading}
              onFocus={() => setFocused('destination')} />
          </View>

          <View style={{ height: ui.space.md }} />
          <StationResults field={focused === 'origin' ? originField : destinationField} disabled={loading} />
        </ScrollView>

        {/* 고정 하단. 키보드가 올라오면 함께 올라와 버튼이 늘 보인다 */}
        <View style={[column, {
          paddingHorizontal: ui.space.lg,
          paddingTop: ui.space.sm,
          paddingBottom: ui.space.md,
          gap: ui.space.sm,
        }]}>
          <View accessibilityLiveRegion="polite">
            {notice ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: ui.space.sm }}>
                <Yeokdu pose="confused" size={ui.px(44)} />
                <Text lineBreakStrategyIOS="hangul-word" style={[ui.type.body, { flex: 1, color: error ? colors.danger : colors.muted }]}>{notice}</Text>
              </View>
            ) : null}
          </View>
          <Button
            label={loading ? '길 찾는 중…' : '길 찾기'}
            onPress={handleFindRoute}
            loading={loading}
            disabled={!origin || !destination || sameStation || loading}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
