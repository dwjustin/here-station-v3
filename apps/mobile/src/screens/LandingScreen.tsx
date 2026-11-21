import { router } from 'expo-router';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Button from '../components/ui/Button';
import Yeokdu from '../components/ui/Yeokdu';
import { CONTENT_MAX_WIDTH, colors, useUi } from '../theme/token';

export default function LandingScreen() {
  const ui = useUi();
  const { width, height } = useWindowDimensions();
  // 캐릭터가 화면의 주인공. 폭과 높이 중 좁은 쪽에 맞춰 짧은 폰에서도 버튼을 밀어내지 않는다
  const mascot = Math.min(Math.min(width, CONTENT_MAX_WIDTH) * 0.78, height * 0.4);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: ui.space.lg,
          paddingVertical: ui.space.lg,
        }}
        bounces={false}
      >
        <View style={{ width: mascot * 1.15, alignItems: 'center', justifyContent: 'flex-end' }}>
          {/* 캐릭터 뒤 크림색 원. 카드가 아니라 캐릭터를 받쳐 주는 무대다 */}
          <View style={{
            position: 'absolute',
            top: mascot * 0.08,
            width: mascot * 0.98,
            height: mascot * 0.98,
            borderRadius: mascot,
            backgroundColor: colors.surface,
          }} />
          <Yeokdu pose="hello" size={mascot} />
        </View>

        <Text accessibilityRole="header" lineBreakStrategyIOS="hangul-word" style={[ui.type.display, { textAlign: 'center', marginTop: ui.space.lg }]}>
          어디로 <Text style={{ color: colors.fur }}>안내할까요?</Text>
        </Text>
        <Text style={[ui.type.body, { color: colors.muted, textAlign: 'center', marginTop: ui.space.sm }]}>
          출발역부터 도착역까지 함께해요.
        </Text>
      </ScrollView>

      {/* 엄지가 닿는 하단에 고정. 글자를 키워도 화면 밖으로 밀리지 않는다 */}
      <View style={{
        width: '100%',
        maxWidth: CONTENT_MAX_WIDTH,
        alignSelf: 'center',
        paddingHorizontal: ui.space.lg,
        paddingBottom: ui.space.md,
      }}>
        <Button label="길 안내 시작하기" onPress={() => router.push('/stations')} />
      </View>
    </SafeAreaView>
  );
}
