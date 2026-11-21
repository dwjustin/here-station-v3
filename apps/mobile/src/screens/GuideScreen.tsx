import { useState } from 'react';
import { Redirect } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { tokens } from '../theme/token';
import { useRouteSession } from '../state/RouteSession';
import GuideCamera from '../components/GuideCamera';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { calculateCompassDirection } from '../navigation/calculateCompassDirection';
import { advanceGuidance, type GuidanceEvent, type GuidancePhase } from '../navigation/advanceGuidance';
import type { RouteResponse } from '../api/routes';

export default function GuideScreen() {
  const { route } = useRouteSession();
  if (!route || route.legs.length !== 2) return <Redirect href="/stations" />;
  return <GuidanceView route={route} />;
}

function GuidanceView({ route }: { route: RouteResponse }) {
  const [phase, setPhase] = useState<GuidancePhase>('originWalk');
  const { trip } = route;
  const leg = phase === 'originWalk' ? route.legs[0] : phase === 'destinationWalk' ? route.legs[1] : null;
  const direction = calculateCompassDirection({
    // TODO(위치 추정 팀): 현재 구간의 지도·방향장에 정렬한 위치와 카메라 방위를 연결한다.
    pose: null,
    target: leg ? {
      stationId: leg.station_id,
      mapRevision: leg.map_revision,
      level: leg.goal.level,
      position: { x: leg.goal.x, z: leg.goal.z, h: leg.goal.h },
    } : null,
    movementKind: leg ? 'walk' : null,
  });
  const instructions: Record<GuidancePhase, string> = {
    originWalk: `${trip.origin_station_name}역 1번 출구에서 ${trip.direction} 방면 승강장으로 이동하세요.`,
    platform: `${trip.direction} 방면 열차를 타세요. 추천 승차 위치는 ${trip.door_no}입니다.`,
    onTrain: `${trip.destination_station_name}역에서 내리세요.`,
    destinationPosition: `${route.legs[1].platform?.access_name} 앞에서 계단을 올라가는 방향을 바라봐 주세요.`,
    destinationWalk: `${trip.destination_station_name}역 1번 출구로 이동하세요.`,
    arrived: '목적지에 도착했습니다.',
  };
  const actions: Partial<Record<GuidancePhase, { label: string; event: GuidanceEvent }>> = {
    originWalk: { label: '승강장에 도착했어요', event: 'platformReached' },
    platform: { label: '탔어요', event: 'boarded' },
    onTrain: { label: '내렸어요', event: 'alighted' },
    destinationPosition: { label: '계단 앞에서 안내 시작', event: 'positionConfirmed' },
    destinationWalk: { label: '1번 출구에 도착했어요', event: 'exitReached' },
  };
  const action = actions[phase];

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
      <View style={styles.camera}>
        <GuideCamera rotationDeg={leg ? direction.rotationDeg : null} />
      </View>
      <View style={styles.cardArea}>
        <Card style={styles.card}>
          <ScrollView contentContainerStyle={styles.cardContent}>
            <Text style={styles.description}>
              {trip.origin_station_name} → {trip.destination_station_name} · {trip.line_name} {trip.up_down}
            </Text>
            <Text style={styles.title} accessibilityLiveRegion="polite">{instructions[phase]}</Text>
            <Text style={styles.description}>
              출발역 보행 {Math.round(trip.origin_walk_m)}m · 도착역 보행 {Math.round(trip.destination_walk_m)}m
            </Text>
            {phase !== 'arrived' ? (
              <Text style={styles.description}>현재 위치는 자동으로 확인되지 않습니다. 위치와 승강장 표지판을 직접 확인한 뒤 진행해 주세요.</Text>
            ) : null}
            {/* shortcut: 도착을 사용자가 확인하며, 위치 추정 연결 시 보행 도착 이벤트를 자동 판정한다. */}
            {action ? <Button label={action.label} onPress={() => setPhase((current) => advanceGuidance(current, action.event))} /> : null}
          </ScrollView>
        </Card>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.background },
  camera: { flex: 7, minHeight: 180 },
  cardArea: { flex: 3, minHeight: 180, padding: tokens.spacing.md },
  card: { flex: 1 },
  cardContent: { gap: tokens.spacing.sm },
  title: { color: tokens.colors.text, fontSize: tokens.fontSize.body, fontWeight: '700' },
  description: { color: tokens.colors.muted, fontSize: tokens.fontSize.body },
});
