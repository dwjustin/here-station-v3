import { useMemo } from 'react';
import { useWindowDimensions, type TextStyle } from 'react-native';

/**
 * 색은 마스코트 '역두'(assets/mascot, final SVG)에서 뽑았다.
 * 안전모 노랑·목도리 연두·털 갈색·배 크림. 글자 대비는 모두 4.5:1 이상으로 맞췄다.
 */
export const colors = {
  background: '#FFFBF4', // 따뜻한 흰색
  surface: '#FBF0D5', // 배 크림
  sunken: '#F3E6CB', // 입력칸·눌린 면
  text: '#3B2A24', // 진한 갈색 잉크 (배경 대비 13:1)
  muted: '#7A625A', // 보조 글자 (5.5:1)
  placeholder: '#9C877E',
  border: '#EADBC0',
  helmet: '#FCBA01', // 주 행동
  helmetLip: '#E19301', // 버튼 밑턱
  onHelmet: '#5A2D1C', // 노랑 위 글자 (6.7:1). 흰 글자는 대비가 모자라다
  fur: '#8C402B',
  furDeep: '#5A2D1C',
  scarf: '#88B71A', // 진행·성공
  scarfLip: '#629904',
  scarfInk: '#4E7A06', // 연두 계열 글자 (4.9:1)
  scarfTint: '#EEF6DC',
  danger: '#C9342A',
  onCamera: '#FFFFFF',
  scrim: 'rgba(30, 18, 12, 0.55)',
};

/** 글꼴 파일이 굵기마다 하나라 family로만 굵기를 고른다. fontWeight를 같이 주면 iOS에서 다른 글꼴로 바뀔 수 있다 */
export const font = { regular: 'Pretendard-Regular', bold: 'Pretendard-Bold' };

/** 기준 폭 390dp(일반 6.1인치 폰). 화면 폭과 '디스플레이 크기' 설정을 따라 레이아웃을 키우고 줄인다 */
const BASE_WIDTH = 390;
const MIN_SCALE = 0.85;
const MAX_SCALE = 1.25;
/** 태블릿·가로 화면에서 내용이 끝까지 늘어나지 않게 막는 폭 */
export const CONTENT_MAX_WIDTH = 520;

export function scaleFor(width: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(width, CONTENT_MAX_WIDTH) / BASE_WIDTH));
}

/**
 * 화면마다 쓰는 크기 체계. 글자는 여기 크기에 시스템 글자 크기 설정(fontScale)이
 * React Native에서 자동으로 한 번 더 곱해지므로 두 설정을 모두 따른다.
 */
export function useUi() {
  const { width } = useWindowDimensions();
  const s = scaleFor(width);
  return useMemo(() => {
    const px = (n: number) => Math.round(n * s);
    const type = (size: number, lineHeight: number, bold = false): TextStyle => ({
      fontFamily: bold ? font.bold : font.regular,
      fontSize: px(size),
      lineHeight: px(lineHeight),
      color: colors.text,
    });
    return {
      s,
      px,
      space: { xs: px(4), sm: px(8), md: px(16), lg: px(24), xl: px(32), xxl: px(48) },
      radius: { sm: px(12), md: px(16), lg: px(24), pill: 999 },
      /** 터치 영역 하한(48dp)은 줄이지 않는다 */
      touch: Math.max(48, px(52)),
      type: {
        display: type(32, 40, true),
        title: type(24, 32, true),
        headline: type(19, 26, true),
        body: type(16, 24),
        bodyBold: type(16, 24, true),
        label: type(14, 20, true),
        caption: type(13, 18),
      },
    };
  }, [s]);
}

export type Ui = ReturnType<typeof useUi>;
