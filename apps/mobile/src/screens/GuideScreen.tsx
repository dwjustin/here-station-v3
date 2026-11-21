import { useEffect, useRef, useState } from 'react';
import { Redirect, router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';

import { CONTENT_MAX_WIDTH, colors, useUi, type Ui } from '../theme/token';
import { useRouteSession } from '../state/RouteSession';
import { usePdrSteps } from '../localization/usePdrSteps';
import ArView from '../components/ArView';
import CompassArrow from '../components/CompassArrow';
import Button from '../components/ui/Button';
import Yeokdu from '../components/ui/Yeokdu';
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

  const ui = useUi();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.text }}>
      {/* 카메라가 화면 전체. 안내 정보는 그 위에 떠 있는 층으로만 둔다 */}
      <ArView onFrame={(frame: ArFrame) => { if (!virtualRef.current) feed((l) => l.arFrame(frame), frame.t); }} />

      {legIndex !== null ? (
        // 위 24%를 비우고 남은 영역의 가운데, 즉 화면 높이 약 62%에 화살표 중심이 온다
        <View pointerEvents="none" style={{
          position: 'absolute', top: '24%', left: 0, right: 0, bottom: 0,
          justifyContent: 'center', alignItems: 'center',
        }}>
          <CompassArrow rotationDeg={rotationDeg} />
        </View>
      ) : null}

      <TopBar ui={ui} top={insets.top} phase={phase}
        virtual={__DEV__ && legIndex !== null ? virtual : null} onToggleVirtual={toggleVirtual} />

      <Sheet ui={ui} bottom={insets.bottom} phase={phase} onAlighted={alighted} trip={trip} spoken={spoken} />
    </View>
  );
}

/** 떠 있는 카드 배경: colors.background(#FFFBF4)를 70% 불투명으로 */
const SHEET_BACKGROUND = 'rgba(255, 251, 244, 0.7)';

const STEPS: { phase: TripPhase; name: string }[] = [
  { phase: 'legA', name: '출발역' },
  { phase: 'onTrain', name: '열차' },
  { phase: 'legB', name: '도착역' },
];

/** 뒤로 가기 + 3단계 진행 막대. 지금 어디쯤인지 한눈에 보이게 한다 */
function TopBar({ ui, top, phase, virtual, onToggleVirtual }: {
  ui: Ui; top: number; phase: TripPhase; virtual: boolean | null; onToggleVirtual: () => void;
}) {
  const current = phase === 'arrived' ? STEPS.length : STEPS.findIndex((s) => s.phase === phase);
  const round = ui.touch;
  return (
    <View style={{
      position: 'absolute', top: top + ui.space.sm, left: ui.space.md, right: ui.space.md,
      flexDirection: 'row', alignItems: 'center', gap: ui.space.md,
    }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="뒤로 가기"
        onPress={() => router.back()}
        style={({ pressed }) => ({
          width: round, height: round, borderRadius: round,
          backgroundColor: pressed ? colors.sunken : colors.background,
          alignItems: 'center', justifyContent: 'center',
        })}
      >
        {/* 테두리 두 변을 돌려 만든 왼쪽 꺾쇠 */}
        <View style={{
          width: ui.px(12), height: ui.px(12), marginLeft: ui.px(4),
          borderLeftWidth: 3, borderBottomWidth: 3, borderColor: colors.text,
          transform: [{ rotate: '45deg' }],
        }} />
      </Pressable>

      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={phase === 'arrived' ? '안내 완료' : `3단계 중 ${current + 1}단계, ${STEPS[current].name}`}
        style={{ flex: 1, flexDirection: 'row', gap: ui.space.xs }}
      >
        {STEPS.map((step, i) => (
          <View key={step.phase} style={{
            flex: 1, height: ui.px(10), borderRadius: 999,
            backgroundColor: i < current ? colors.scarf : i === current ? colors.helmet : 'rgba(255, 255, 255, 0.45)',
          }} />
        ))}
      </View>

      {virtual !== null ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={virtual ? '가상 보행 끄기' : '가상 보행'}
          onPress={onToggleVirtual}
          style={{
            minHeight: round, paddingHorizontal: ui.space.md, borderRadius: round,
            backgroundColor: virtual ? colors.helmet : colors.background, justifyContent: 'center',
          }}
        >
          <Text style={[ui.type.label, { color: virtual ? colors.onHelmet : colors.text }]}>
            {virtual ? '가상 끄기' : '가상 보행'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** 하단 시트. 단계마다 역두 표정과 문구 하나, 필요할 때만 버튼 하나 */
function Sheet({ ui, bottom, phase, onAlighted, trip, spoken }: {
  ui: Ui; bottom: number; phase: TripPhase; onAlighted: () => void; trip: RouteResponse['trip']; spoken: string;
}) {
  const walking = phase === 'legA' || phase === 'legB';
  return (
    // 카메라 위 아래쪽에 떠 있는 카드. 화살표(화면 높이 약 62%)를 가리지 않게 아래에 둔다.
    // 바깥 층은 터치를 카메라로 넘기고 카드만 받는다
    <View pointerEvents="box-none" style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: bottom + ui.space.md,
      justifyContent: 'flex-end',
      paddingHorizontal: ui.space.md,
    }}>
      <View style={{
        width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', gap: ui.space.md,
        // 배경만 70% 불투명(rgba). opacity를 쓰면 글자·버튼까지 비치므로 쓰지 않는다
        backgroundColor: SHEET_BACKGROUND,
        borderRadius: ui.radius.lg,
        padding: ui.space.lg,
      }}>
        {walking ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: ui.space.md }}>
            <Yeokdu pose="map" size={ui.px(64)} />
            <View style={{ flex: 1, gap: ui.space.xs }}>
              <Text style={[ui.type.label, { color: colors.scarfInk }]}>
                {phase === 'legA' ? '출발역 안내' : '도착역 안내'}
              </Text>
              <Text style={ui.type.title} lineBreakStrategyIOS="hangul-word" accessibilityLiveRegion="polite">{spoken}</Text>
            </View>
          </View>
        ) : null}

        {phase === 'onTrain' ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: ui.space.md }}>
              <Yeokdu pose="basic" size={ui.px(72)} />
              <View style={{ flex: 1, gap: ui.space.xs }} accessibilityLiveRegion="polite">
                <Text style={[ui.type.label, { color: colors.muted }]}>열차 이동 중</Text>
                <Text style={ui.type.title} lineBreakStrategyIOS="hangul-word">{trip.destination_station_name}역에서 {trip.door_no} 문으로 내리세요</Text>
              </View>
            </View>
            <Button label="내렸어요" onPress={onAlighted} />
          </>
        ) : null}

        {phase === 'arrived' ? (
          <View style={{ alignItems: 'center', gap: ui.space.sm }}>
            <Yeokdu pose="cheer" size={ui.px(140)} />
            <Text style={[ui.type.display, { textAlign: 'center' }]} accessibilityLiveRegion="polite">
              도착했습니다
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
