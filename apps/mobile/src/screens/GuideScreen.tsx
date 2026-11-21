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
import { advanceGuidance } from '../navigation/advanceGuidance';
import type { RouteResponse } from '../api/routes';

export default function GuideScreen() {
  const { route } = useRouteSession();
  if (!route || route.nodes.length === 0) return <Redirect href="/stations" />;
  return <GuidanceView route={route} />;
}

function GuidanceView({ route }: { route: RouteResponse }) {
  const [currentNodeIndex, setCurrentNodeIndex] = useState(0);
  const current = route.nodes[currentNodeIndex];
  const target = route.nodes[currentNodeIndex + 1];
  const edge = route.edges[currentNodeIndex];
  const arrived = !target;
  const maps: Record<string, { content_sha256: string }> = route.maps;
  const targetMap = target ? maps[target.station_id] : undefined;
  const direction = calculateCompassDirection({
    // TODO(위치 추정 팀): GPS 없이 추정한 위치와 지도에 정렬된 카메라 방위를 연결한다.
    pose: null,
    target: target && targetMap ? {
      stationId: target.station_id,
      mapRevision: targetMap.content_sha256,
      level: target.level,
      position: target.position,
    } : null,
    movementKind: edge?.kind ?? null,
  });

  function handleNodeArrival(nodeId: string) {
    setCurrentNodeIndex((index) => advanceGuidance(route, index, nodeId));
  }
  // TODO(위치 추정 팀): 같은 역·지도·층에서 arrival_radius와 추적 상태로 도착을 판정한 뒤
  // handleNodeArrival(target.id)를 호출한다. 열차·층 이동은 별도 판정하고 구독은 종료 시 해제한다.

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
      <View style={styles.camera}>
        <GuideCamera rotationDeg={arrived ? null : direction.rotationDeg} />
      </View>
      <View style={styles.cardArea}>
        <Card style={styles.card}>
          <ScrollView contentContainerStyle={styles.cardContent}>
            <Text style={styles.description}>
              {route.is_mock ? '예시 경로 · ' : ''}
              {arrived ? '안내 완료' : `구간 ${currentNodeIndex + 1} / ${route.edges.length}`}
            </Text>
            <Text style={styles.title} accessibilityLiveRegion="polite">
              {arrived ? '목적지에 도착했습니다.' : edge?.instruction ?? '다음 지점으로 이동하세요.'}
            </Text>
            <Text style={styles.description}>
              {current.name} ({current.level})
              {target ? ` → ${target.name} (${target.level})` : ''}
            </Text>
            {/* shortcut: 도착 판정 연결 전 개발용 수동 진행이며, 실제 위치 추정 연결 시 제거한다. */}
            {__DEV__ && target ? (
              <Button label="다음 노드 도달 테스트" onPress={() => handleNodeArrival(target.id)} />
            ) : null}
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
