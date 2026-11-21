import { Image } from 'expo-image';
import { Link, router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Button from '../components/ui/Button';
import { tokens } from '../theme/token';

export default function LandingScreen() {
  return (
    <View style={styles.screen}>
      <Link href="/stations" asChild>
        <Pressable
          style={styles.touch}
          accessibilityRole="button"
          accessibilityLabel="출발역과 도착역 선택하기"
          accessibilityHint="화면을 누르면 역 선택 화면으로 이동합니다"
        >
          {/* 아래 음성 버튼이 하단 안전 영역을 맡는다 */}
          <SafeAreaView edges={['top', 'left', 'right']} style={styles.content}>
            <View style={styles.header}>
              <Text style={styles.brand}>Here Station</Text>
            </View>
            <ScrollView style={styles.body} contentContainerStyle={styles.introduction}>
              <Text style={styles.title}>어디로 안내할까요?</Text>
              <Text style={styles.description}>
                출발역부터 도착역까지 함께해요.
              </Text>
              <Image
                source={require('../../assets/yeokdu/yeokdu_02_hello.svg')}
                style={styles.mascot}
                contentFit="contain"
                accessible={false}
              />
            </ScrollView>
            <Text style={styles.hint}>화면을 터치해 시작하세요</Text>
          </SafeAreaView>
        </Pressable>
      </Link>
      {/* 화면을 보지 않고 쓰는 사람을 위한 음성 시작. 화면 터치(역 선택)와 따로 둔다 */}
      <SafeAreaView edges={['bottom']} style={styles.voice}>
        <Button label="말로 길 찾기" onPress={() => router.push('/voice')} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.background },
  touch: { flex: 1 },
  voice: { paddingHorizontal: tokens.spacing.lg, paddingBottom: tokens.spacing.lg },
  content: {
    flexGrow: 1,
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.xl,
    paddingBottom: tokens.spacing.lg,
  },
  title: {
    color: tokens.colors.text,
    fontSize: tokens.fontSize.hero,
    fontWeight: '700',
  },
  accent: { color: tokens.colors.primary },
  characterSpace: {
    flex: 1,
    minHeight: tokens.spacing.xl * 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: tokens.spacing.lg,
  },
  title: { color: tokens.colors.text, fontSize: tokens.fontSize.hero, fontWeight: '700' },
  description: { color: tokens.colors.muted, fontSize: tokens.fontSize.body },
  mascot: { width: '100%', maxWidth: 320, aspectRatio: 1, alignSelf: 'center' },
  hint: {
    flexShrink: 0,
    color: tokens.colors.muted,
    fontSize: tokens.fontSize.body,
    textAlign: 'center',
  },
});
