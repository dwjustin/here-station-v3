import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { tokens } from '../theme/token';

export default function LandingScreen() {
  return (
    <Link href="/stations" asChild>
      <Pressable
        style={styles.screen}
        accessibilityRole="button"
        accessibilityLabel="출발역과 도착역 선택하기"
        accessibilityHint="화면을 누르면 역 선택 화면으로 이동합니다"
      >
        <SafeAreaView style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.brand}>Here Station</Text>
          </View>
          <ScrollView style={styles.body} contentContainerStyle={styles.introduction}>
            <Text style={styles.title}>어디로 안내할까요?</Text>
            <Text style={styles.description}>
              출발역부터 도착역까지 함께해요.
            </Text>
          </ScrollView>
          <Text style={styles.hint}>화면을 터치해 시작하세요</Text>
        </SafeAreaView>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.background },
  content: { flex: 1, padding: tokens.spacing.lg },
  header: { flexShrink: 0, paddingBottom: tokens.spacing.lg },
  brand: { color: tokens.colors.primary, fontSize: tokens.fontSize.body, fontWeight: '700' },
  body: { flex: 1 },
  introduction: {
    paddingVertical: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },
  title: { color: tokens.colors.text, fontSize: tokens.fontSize.hero, fontWeight: '700' },
  description: { color: tokens.colors.muted, fontSize: tokens.fontSize.body },
  hint: {
    flexShrink: 0,
    color: tokens.colors.muted,
    fontSize: tokens.fontSize.body,
    textAlign: 'center',
    paddingVertical: tokens.spacing.lg,
  },
});
