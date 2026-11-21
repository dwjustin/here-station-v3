import { useEffect, useRef, useState } from 'react';
import { Redirect } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { tokens } from '../theme/token';
import { useRouteSession } from '../state/RouteSession';
import { usePdrSteps } from '../localization/usePdrSteps';
import ArView from '../components/ArView';
import CompassArrow from '../components/CompassArrow';
import GuidanceCard from '../components/GuidanceCard';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { decodeLeg, type RouteResponse } from '../api/routes';
import { createMapGrid } from '../navigation/mapGrid';
import { createArrowStabilizer } from '../navigation/guidance';
import { createLocalizer, type ArFrame, type Localizer } from '../localization/localizer';
import { activeLegIndex, nextTripPhase, type TripPhase } from '../navigation/trip';
import { virtualWalk } from '../localization/virtualWalk';

/** 가상 보행은 100ms마다 이만큼 프레임을 넣는다 (5배속, 홍제 구간 약 30초) */
const VIRTUAL_FRAMES_PER_TICK = 5;

export default function GuideScreen() {
  const { route } = useRouteSession();
  if (!route || route.legs.length !== 2) return <Redirect href="/stations" />;
  return <TripView route={route} />;
}

function TripView({ route }: { route: RouteResponse }) {
  // 응답은 안내 중 바뀌지 않으므로 구간마다 한 번만 디코딩한다
  const [legs] = useState(() => route.legs.map((raw) => {
    const leg = decodeLeg(raw);
    return { leg, grid: createMapGrid(leg) };
  }));
  const goals = [legs[0].leg.goal, legs[1].leg.goal] as const;

  const arrow = useRef<ReturnType<typeof createArrowStabilizer>>(null!);
  // 구간 시작 위치에 다시 뿌린 새 추정기. 사용자는 그 칸의 화살표를 보고 섰다고 가정한다
  function startLeg(i: 0 | 1): Localizer {
    arrow.current = createArrowStabilizer(legs[i].grid);
    const localizer = createLocalizer(legs[i].grid);
    localizer.reset(legs[i].leg.start, legs[i].leg.start.heading_deg);
    return localizer;
  }

  const localizer = useRef<Localizer | null>(null);
  localizer.current ??= startLeg(0);
  // 센서 콜백이 최신 단계를 읽도록 ref에도 둔다
  const phaseRef = useRef<TripPhase>('legA');
  const [phase, setPhase] = useState<TripPhase>('legA');
  const [rotationDeg, setRotationDeg] = useState<number | null>(null);
  const [virtual, setVirtual] = useState(false);
  const virtualRef = useRef(false);
  const legIndex = activeLegIndex(phase);

  function goTo(next: TripPhase) {
    phaseRef.current = next;
    setPhase(next);
  }

  /** t: 입력(AR 프레임·걸음)의 시각 (s) */
  function feed(input: (l: Localizer) => void, t: number) {
    if (activeLegIndex(phaseRef.current) === null) return; // 열차 안·도착 후는 위치를 넣지 않는다
    input(localizer.current!);
    const p = localizer.current!.pose();
    setRotationDeg(arrow.current(p, t));
    if (p) goTo(nextTripPhase(phaseRef.current, { type: 'pose', pose: p }, goals));
  }

  function alighted() {
    localizer.current = startLeg(1);
    setRotationDeg(null);
    goTo(nextTripPhase(phaseRef.current, { type: 'alighted' }, goals));
  }

  function toggleVirtual() {
    // 가상·실제 프레임은 시계가 달라 섞으면 안 된다. 바꿀 때 지금 구간을 출발점부터 다시 시작한다
    const index = activeLegIndex(phaseRef.current);
    if (index !== null) localizer.current = startLeg(index);
    setRotationDeg(null);
    virtualRef.current = !virtualRef.current;
    setVirtual(virtualRef.current);
  }

  usePdrSteps(legIndex !== null && !virtual, (step) => feed((l) => l.step(step), step.t));

  // 개발 모드 "가상 보행": ArView 대신 가상 보행자의 AR 프레임을 넣는다 (시뮬레이터 시연용)
  useEffect(() => {
    if (!virtual || legIndex === null) return;
    const { grid, leg } = legs[legIndex];
    // 가상 보행자도 화면과 같은 화살표(추정 위치·방위 기준)를 보고 걷는다
    let t = 0;
    const arrowDeg = () => arrow.current(localizer.current!.pose(), t);
    const walk = virtualWalk(grid, leg, { arrowDeg, t0: performance.now() / 1000 });
    const id = setInterval(() => {
      for (let k = 0; k < VIRTUAL_FRAMES_PER_TICK; k++) {
        const next = walk.next();
        if (next.done) return clearInterval(id);
        t = next.value.frame.t;
        feed((l) => l.arFrame(next.value.frame), t);
      }
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- feed는 ref만 읽고 legs는 바뀌지 않으므로 다시 시작할 필요 없다
  }, [virtual, legIndex]);

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
      <View style={styles.camera}>
        <ArView onFrame={(frame: ArFrame) => { if (!virtualRef.current) feed((l) => l.arFrame(frame), frame.t); }} />
        {legIndex !== null ? (
          <View pointerEvents="none" style={styles.overlay}>
            <CompassArrow rotationDeg={rotationDeg} />
          </View>
        ) : null}
        <View style={styles.bottom}>
          {legIndex !== null ? (
            <GuidanceCard instruction="화살표 방향을 확인하세요" />
          ) : null}
          {phase === 'onTrain' ? (
            <Card style={styles.card}>
              <Text style={styles.title} accessibilityLiveRegion="polite">
                열차 이동 중 · 잠원역에서 1-1 문으로 내리세요
              </Text>
              <Button label="내렸어요" onPress={alighted} />
            </Card>
          ) : null}
          {phase === 'arrived' ? (
            <Card style={styles.card}>
              <Text style={styles.title} accessibilityLiveRegion="polite">도착했습니다</Text>
            </Card>
          ) : null}
          {__DEV__ && legIndex !== null ? (
            <Button label={virtual ? '가상 보행 끄기' : '가상 보행'} onPress={toggleVirtual} />
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.background },
  camera: { flex: 1 },
  // 위 24%를 비우고 남은 영역의 가운데, 즉 화면 높이 약 62%에 화살표 중심이 온다
  overlay: { position: 'absolute', top: '24%', left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: tokens.spacing.md, gap: tokens.spacing.sm },
  card: { gap: tokens.spacing.md },
  title: { color: tokens.colors.text, fontSize: tokens.fontSize.body, fontWeight: '700' },
});
