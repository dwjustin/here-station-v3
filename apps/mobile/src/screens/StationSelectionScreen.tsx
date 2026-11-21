import { useRef, useState, type ComponentRef } from 'react';
import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CONTENT_MAX_WIDTH, colors, useUi } from '../theme/token';
import type { Station } from '../api/stations';
import { LineTabs, StationField, StationList, linesOf, useStationList } from '../components/StationPicker';
import Button from '../components/ui/Button';
import Yeokdu from '../components/ui/Yeokdu';
import { requestRoute } from '../api/routes';
import { useRouteSession } from '../state/RouteSession';

type Which = 'origin' | 'destination';
const LABEL: Record<Which, string> = { origin: '출발역', destination: '도착역' };

export default function StationSelectionScreen() {
  const ui = useUi();
  const [origin, setOrigin] = useState<Station | null>(null);
  const [destination, setDestination] = useState<Station | null>(null);
  const [loading, setLoading] = useState(false);
  const { setRoute } = useRouteSession();
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState<Which>('origin');
  const [line, setLine] = useState<string | null>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL ?? '';

  const list = useStationList(apiBaseUrl);
  const lines = linesOf(list.stations);
  const shownLine = line && lines.includes(line) ? line : lines[0] ?? null;
  const selected = { origin, destination };
  const sameStation = Boolean(origin && destination && origin.id === destination.id);

  /** 칸을 누르면 그 칸을 고르는 중으로 바꾸고, 이미 고른 역이 있으면 그 노선을 보여 준다 */
  function focus(which: Which) {
    setFocused(which);
    const current = selected[which];
    if (current && shownLine && !current.lines.includes(shownLine)) setLine(current.lines[0]);
  }

  function pick(station: Station) {
    if (__DEV__) console.log('[stations:selected]', { field: LABEL[focused], stationId: station.id });
    if (focused === 'origin') setOrigin(station);
    else setDestination(station);
    setRoute(null);
    setError(null);
    // 출발역을 고르면 바로 도착역 차례. 다 고르면 위로 올려 두 칸을 다시 보여 준다
    if (focused === 'origin' && !destination) setFocused('destination');
    scroll.current?.scrollTo({ y: 0, animated: true });
  }

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
      router.push('/preview');
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
      <ScrollView
        ref={scroll}
        contentInsetAdjustmentBehavior="automatic"
        // 3번째 자식(노선 배지 줄)은 스크롤해도 위에 붙어 있어 언제든 노선을 바꿀 수 있다
        stickyHeaderIndices={[3]}
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
            top: (ui.touch + ui.space.sm) / 2,
            bottom: (ui.touch + ui.space.sm) / 2,
            width: 2,
            backgroundColor: colors.border,
          }} />
          <StationField label="출발역" station={origin} marker="origin" active={focused === 'origin'}
            disabled={loading} onPress={() => focus('origin')} />
          <View style={{ height: 1, backgroundColor: colors.border, marginLeft: ui.px(14) + ui.space.md }} />
          <StationField label="도착역" station={destination} marker="destination" active={focused === 'destination'}
            disabled={loading} onPress={() => focus('destination')} />
        </View>

        <Text accessibilityLiveRegion="polite" style={[ui.type.label, { color: colors.muted, marginTop: ui.space.lg }]}>
          {LABEL[focused]}을 골라 주세요
        </Text>

        <View>
          {shownLine ? <LineTabs lines={lines} value={shownLine} onChange={setLine} /> : null}
        </View>

        <View>
          {list.loading ? (
            <Text style={[ui.type.body, { color: colors.muted, paddingVertical: ui.space.md }]}>역 목록을 불러오는 중…</Text>
          ) : list.error ? (
            <View style={{ gap: ui.space.md, paddingVertical: ui.space.md }}>
              <Text lineBreakStrategyIOS="hangul-word" style={[ui.type.body, { color: colors.danger }]}>{list.error}</Text>
              <Button label="다시 불러오기" variant="secondary" onPress={list.retry} />
            </View>
          ) : shownLine ? (
            <StationList stations={list.stations} line={shownLine} selectedId={selected[focused]?.id ?? null}
              label={LABEL[focused]} disabled={loading} onPick={pick} />
          ) : null}
        </View>
      </ScrollView>

      {/* 엄지가 닿는 하단에 고정 */}
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
    </SafeAreaView>
  );
}
