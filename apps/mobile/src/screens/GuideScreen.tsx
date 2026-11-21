import { useEffect, useRef, useState } from 'react';
import { Redirect } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
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
import { createVoiceGuide, meansAlighted } from '../voice/voiceGuide';
import { isSpeaking, listenOnce, say, stopListening, stopSpeaking } from '../voice/speech';

/** 가상 보행은 100ms마다 이만큼 프레임을 넣는다 (5배속, 홍제 구간 약 30초) */
const VIRTUAL_FRAMES_PER_TICK = 5;

export default function GuideScreen() {
  const { route } = useRouteSession();
  if (!route || route.legs.length !== 2) return <Redirect href="/stations" />;
  return <TripView route={route} />;
}

function TripView({ route }: { route: RouteResponse }) {
  // 화면을 보지 않고 들고만 걸어도 AR·센서가 멈추지 않게 화면 잠금을 막는다
  useKeepAwake();
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
  const { trip } = route;
  // 화살표 각도·단계를 말로 바꾼다. 화면을 보는 사람을 위해 마지막 말을 카드에도 보여 준다
  const voice = useRef(createVoiceGuide(trip));
  const [spoken, setSpoken] = useState('화살표 방향으로 걸어가세요');

  function speakFor(rotation: number | null, p: ReturnType<Localizer['pose']> | null, t: number) {
    const index = activeLegIndex(phaseRef.current);
    const goal = index === null ? null : goals[index];
    const distanceToGoalM = goal && p ? Math.hypot(p.position.x - goal.x, p.position.z - goal.z) : null;
    const utterance = voice.current({ t, phase: phaseRef.current, rotationDeg: rotation, distanceToGoalM });
    if (!utterance) return;
    setSpoken(utterance.text);
    void say(utterance.text, { interrupt: utterance.urgent });
  }

  function goTo(next: TripPhase) {
    phaseRef.current = next;
    setPhase(next);
  }

  /** t: 입력(AR 프레임·걸음)의 시각 (s) */
  function feed(input: (l: Localizer) => void, t: number) {
    if (activeLegIndex(phaseRef.current) === null) return; // 열차 안·도착 후는 위치를 넣지 않는다
    input(localizer.current!);
    const p = localizer.current!.pose();
    const rotation = arrow.current(p, t);
    setRotationDeg(rotation);
    if (p) goTo(nextTripPhase(phaseRef.current, { type: 'pose', pose: p }, goals));
    speakFor(rotation, p, t);
  }

  function alighted() {
    localizer.current = startLeg(1);
    setRotationDeg(null);
    goTo(nextTripPhase(phaseRef.current, { type: 'alighted' }, goals));
    speakFor(null, null, performance.now() / 1000);
  }

  // 열차 안: 화면을 보지 않아도 "내렸어"라고 말하면 도착역 안내를 시작한다. 버튼도 그대로 둔다
  useEffect(() => {
    if (phase !== 'onTrain') return;
    let active = true;
    void (async () => {
      while (active) {
        if (isSpeaking()) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }
        try {
          const heard = await listenOnce(['내렸어', '내렸어요', '도착했어']);
          if (active && meansAlighted(heard)) {
            alighted();
            return;
          }
        } catch {
          return; // 권한이 없거나 인식기를 못 쓰면 버튼으로만 넘어간다
        }
      }
    })();
    return () => {
      active = false;
      stopListening();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- alighted는 ref만 바꾸므로 단계가 바뀔 때만 다시 시작한다
  }, [phase]);

  useEffect(() => () => {
    stopSpeaking();
    stopListening();
  }, []);

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
            <GuidanceCard instruction={spoken} />
          ) : null}
          {phase === 'onTrain' ? (
            <Card style={styles.card}>
              <Text style={styles.title} accessibilityLiveRegion="polite">
                {`${trip.line_name} ${trip.direction} 방면 · ${trip.destination_station_name}역에서 ${trip.door_no} 문으로 내리세요`}
              </Text>
              <Button label="내렸어요" onPress={alighted} />
            </Card>
          ) : null}
          {phase === 'arrived' ? (
            <Card style={styles.card}>
              <Text style={styles.title} accessibilityLiveRegion="polite">{spoken}</Text>
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
