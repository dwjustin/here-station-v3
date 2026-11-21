import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { tokens } from '../theme/token';
import { searchStations } from '../api/stations';
import { sendVoiceTurn, type VoiceMessage } from '../api/voice';
import { useRouteSession } from '../state/RouteSession';
import { listenOnce, say, stopListening, stopSpeaking } from '../voice/speech';

const GREETING = '어디로 가세요? 출발역과 도착역을 말씀해 주세요. 예를 들면 홍제에서 잠원까지요.';
/** 답을 못 알아들어도 이 횟수만큼은 화면을 누르지 않아도 다시 듣는다 */
const AUTO_LISTEN_TURNS = 4;

type Status = 'speaking' | 'listening' | 'thinking' | 'idle';
const STATUS_TEXT: Record<Status, string> = {
  speaking: '말하는 중',
  listening: '듣고 있어요. 말씀하세요',
  thinking: '경로를 찾는 중',
  idle: '화면 아무 곳이나 누르고 말씀하세요',
};

export default function VoiceScreen() {
  const { setRoute } = useRouteSession();
  const [status, setStatus] = useState<Status>('speaking');
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState(GREETING);
  const messages = useRef<VoiceMessage[]>([]);
  const stations = useRef<string[]>([]);
  const busy = useRef(false);
  const active = useRef(true);
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL ?? '';

  async function speak(text: string) {
    setReply(text);
    setStatus('speaking');
    await say(text, { interrupt: true });
  }

  /** 듣고 → 서버(Claude)에 보내고 → 답을 읽는다. 경로가 나오면 안내 화면으로 간다 */
  async function converse(autoTurns: number) {
    if (busy.current) return;
    busy.current = true;
    try {
      setStatus('listening');
      const text = await listenOnce(stations.current);
      if (!active.current) return;
      if (!text) {
        await speak('잘 못 들었어요. 화면을 누르고 다시 말씀해 주세요.');
        return;
      }
      setHeard(text);
      messages.current = [...messages.current, { role: 'user' as const, text }].slice(-12);
      setStatus('thinking');
      // 경로 계산까지 4초쯤 걸린다. 화면을 안 보는 사람이 멈춘 줄 모르게 먼저 말한다 (답이 오면 끊고 답을 읽는다)
      void say('알겠어요, 찾아볼게요.', { interrupt: true });
      const turn = await sendVoiceTurn(apiBaseUrl, messages.current);
      if (!active.current) return;
      messages.current = [...messages.current, { role: 'assistant' as const, text: turn.reply }];
      if (turn.route) {
        setRoute(turn.route);
        await speak(turn.reply);
        if (active.current) router.replace('/guide');
        return;
      }
      await speak(turn.reply);
      // 되묻는 답이면 화면을 누르지 않아도 바로 다시 듣는다
      if (active.current && autoTurns > 1) {
        busy.current = false;
        await converse(autoTurns - 1);
      }
    } catch (error) {
      if (active.current) await speak(error instanceof Error ? error.message : '음성 길 찾기에 실패했어요.');
    } finally {
      busy.current = false;
      if (active.current) setStatus((s) => (s === 'speaking' ? 'idle' : s));
    }
  }

  useEffect(() => {
    active.current = true;
    searchStations(apiBaseUrl, '')
      .then((list) => { stations.current = list.flatMap((s) => [s.name, `${s.name}역`]); })
      .catch(() => undefined); // 역 이름 힌트가 없어도 인식은 된다
    void (async () => {
      await speak(GREETING);
      if (active.current) await converse(AUTO_LISTEN_TURNS);
    })();
    return () => {
      active.current = false;
      stopSpeaking();
      stopListening();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 화면에 들어올 때 한 번만 시작한다
  }, []);

  function talkNow() {
    // 말하는 중에 누르면 끊고 바로 듣는다
    stopSpeaking();
    if (!busy.current) void converse(AUTO_LISTEN_TURNS);
  }

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
      <Pressable
        style={styles.pad}
        onPress={talkNow}
        accessibilityRole="button"
        accessibilityLabel="눌러서 말하기"
        accessibilityHint="출발역과 도착역을 말하면 길을 찾아 말로 안내합니다"
      >
        <Text style={styles.status} accessibilityLiveRegion="polite">{STATUS_TEXT[status]}</Text>
        <View style={styles.bubble}>
          <Text style={styles.reply}>{reply}</Text>
        </View>
        {heard ? <Text style={styles.heard}>들은 말: {heard}</Text> : null}
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.background },
  pad: { flex: 1, padding: tokens.spacing.lg, gap: tokens.spacing.lg, justifyContent: 'center' },
  status: { color: tokens.colors.primary, fontSize: tokens.fontSize.title, fontWeight: '700', textAlign: 'center' },
  bubble: { backgroundColor: tokens.colors.surface, borderRadius: 16, padding: tokens.spacing.lg },
  reply: { color: tokens.colors.text, fontSize: tokens.fontSize.body, lineHeight: 26 },
  heard: { color: tokens.colors.muted, fontSize: tokens.fontSize.body, textAlign: 'center' },
});
