import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

/**
 * 말하기(TTS)는 모두 서버의 GET /voice/tts(ElevenLabs 두더지 목소리 mp3)로 재생한다. 기기 목소리로 바꾸지 않는다.
 * 실패하면 한 번 더 시도하고, 그래도 안 되면 소리 없이 넘어간다(같은 문장은 화면 카드에 보인다).
 * 듣기(STT)는 기기 음성 인식. 에어팟이 연결되어 있으면 iOS가 소리와 마이크를 에어팟으로 보낸다.
 */

/** 이 시간 안에 재생이 시작되지 않으면 실패로 본다 (ms) */
const START_TIMEOUT_MS = 6000;
const apiBaseUrl = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

let audioReady: Promise<void> | null = null;
let queue: Promise<void> = Promise.resolve();
let generation = 0; // interrupt마다 올려서 대기 중인 문장을 버린다
let stopCurrent: (() => void) | null = null;

/**
 * 문장을 읽는다. 앞 문장이 끝난 뒤 차례로 읽고, interrupt면 읽던 말과 대기 중인 말을 버리고 바로 읽는다.
 * 반환된 Promise는 이 문장을 다 읽으면(또는 끊기면) 끝난다.
 */
export function say(text: string, { interrupt = false } = {}): Promise<void> {
  if (interrupt) {
    generation += 1;
    stopCurrent?.();
    queue = Promise.resolve();
  }
  const mine = generation;
  queue = queue.then(() => (mine === generation ? speakNow(text) : undefined));
  return queue;
}

export function stopSpeaking(): void {
  generation += 1;
  stopCurrent?.();
  queue = Promise.resolve();
}

export function isSpeaking(): boolean {
  return stopCurrent !== null;
}

async function speakNow(text: string): Promise<void> {
  audioReady ??= setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
  await audioReady;
  if (!apiBaseUrl) return;
  const url = `${apiBaseUrl}/voice/tts?text=${encodeURIComponent(text)}`;
  const mine = generation;
  try {
    await playUrl(url);
  } catch {
    if (mine !== generation) return; // 그사이 새 안내가 끊고 들어왔으면 다시 읽지 않는다
    await playUrl(url).catch(() => undefined);
  }
}

function playUrl(url: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const player: AudioPlayer = createAudioPlayer(url);
    let started = false;
    const timer = setTimeout(() => finish(started ? undefined : new Error('tts timeout')), START_TIMEOUT_MS);
    const subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (status.playing) started = true;
      if (status.didJustFinish) finish();
    });
    function finish(error?: Error) {
      clearTimeout(timer);
      subscription.remove();
      player.remove();
      stopCurrent = null;
      if (error) reject(error);
      else resolve();
    }
    stopCurrent = () => finish();
    player.play();
  });
}

/**
 * 한 번 듣고 최종 인식 결과를 돌려준다. 말이 없으면 빈 문자열.
 * 권한이 없거나 인식기를 쓸 수 없으면 오류를 던진다.
 */
export async function listenOnce(contextualStrings: string[] = []): Promise<string> {
  const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  if (!permission.granted) throw new Error('마이크와 음성 인식 권한을 허용해 주세요.');
  return new Promise<string>((resolve, reject) => {
    let heard = '';
    let failed = false;
    const subscriptions = [
      ExpoSpeechRecognitionModule.addListener('result', (event) => {
        if (event.isFinal) heard = event.results[0]?.transcript ?? '';
      }),
      ExpoSpeechRecognitionModule.addListener('error', (event) => {
        // 말이 없었거나 다른 소리·권한 창에 오디오가 끊긴 경우는 오류가 아니라 빈 결과로 본다
        if (['no-speech', 'speech-timeout', 'aborted', 'interrupted'].includes(event.error)) return;
        failed = true;
        // 기기 오류 문장은 영어라 사용자에게 읽어 주지 않는다
        console.warn('speech recognition error', event.error, event.message);
        reject(new Error('음성 인식을 쓸 수 없어요. 잠시 뒤 화면을 누르고 다시 말씀해 주세요.'));
      }),
      ExpoSpeechRecognitionModule.addListener('end', () => {
        subscriptions.forEach((s) => s.remove());
        if (!failed) resolve(heard.trim());
      }),
    ];
    ExpoSpeechRecognitionModule.start({ lang: 'ko-KR', interimResults: false, continuous: false, contextualStrings });
  });
}

export function stopListening(): void {
  ExpoSpeechRecognitionModule.abort();
}
