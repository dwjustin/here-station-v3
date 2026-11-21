import { Image } from 'expo-image';

// assets/yeokdu는 마스코트 final SVG다. React Native Image는 SVG를 못 그려 expo-image로 띄운다
const POSES = {
  basic: require('../../../assets/yeokdu/yeokdu_01_basic.svg'),
  hello: require('../../../assets/yeokdu/yeokdu_02_hello.svg'),
  map: require('../../../assets/yeokdu/yeokdu_03_map.svg'),
  cheer: require('../../../assets/yeokdu/yeokdu_04_cheer.svg'),
  confused: require('../../../assets/yeokdu/yeokdu_05_confused.svg'),
};

export type YeokduPose = keyof typeof POSES;

/** 장식용 마스코트. 의미는 옆 글자가 전하므로 스크린리더에서 숨긴다 */
export default function Yeokdu({ pose, size }: { pose: YeokduPose; size: number }) {
  return (
    <Image
      source={POSES[pose]}
      style={{ width: size, height: size }}
      contentFit="contain"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    />
  );
}
