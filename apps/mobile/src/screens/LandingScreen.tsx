import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Button from '../components/ui/Button';
import { tokens } from '../theme/token';

export default function LandingScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          어디로{'\n'}
          <Text style={styles.accent}>가볼까요?</Text>
        </Text>
        <View style={styles.characterSpace} accessible={false}>
          <View style={styles.characterBackdrop} />
        </View>
        <View style={styles.footer}>
          <Text style={styles.description}>출발역부터 도착역까지 함께해요.</Text>
          <Button label="길 안내 시작하기" onPress={() => router.push('/stations')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.background },
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
  characterBackdrop: {
    width: '85%',
    maxWidth: tokens.spacing.xl * 8,
    aspectRatio: 1,
    borderRadius: tokens.spacing.xl * 4,
    backgroundColor: tokens.colors.surface,
  },
  footer: { gap: tokens.spacing.lg },
  description: {
    color: tokens.colors.muted,
    fontSize: tokens.fontSize.body,
    textAlign: 'center',
  },
});
