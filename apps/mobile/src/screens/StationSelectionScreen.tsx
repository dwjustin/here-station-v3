import { useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { tokens } from '../theme/token';
import type { Station } from '../api/stations';
import StationPicker from '../components/StationPicker';
import Button from '../components/ui/Button';
import { requestRoute } from '../api/routes';
import { useRouteSession } from '../state/RouteSession';

export default function StationSelectionScreen() {
  const [origin, setOrigin] = useState<Station | null>(null);
  const [destination, setDestination] = useState<Station | null>(null);
  const [loading, setLoading] = useState(false);
  const { setRoute } = useRouteSession();
  const [error, setError] = useState<string | null>(null);
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL ?? '';

  async function handleFindRoute() {
    if (!origin || !destination || origin.id === destination.id || loading) return;
    setLoading(true);
    setRoute(null);
    setError(null);
    if (__DEV__) console.log('[routes:request]', {
      origin_station_id: origin.id,
      destination_station_id: destination.id,
    });
    try {
      const result = await requestRoute(apiBaseUrl, origin.id, destination.id);
      setRoute(result);
      if (__DEV__) console.log('[routes:response]', result);
      router.push('/guide');
    } catch (error) {
      const message = error instanceof Error ? error.message : '길 찾기에 실패했습니다.';
      setError(message);
      if (__DEV__) console.warn('[routes:error]', message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>어디로 가시나요?</Text>
        <Text style={styles.description}>출발역과 도착역을 입력해 주세요.</Text>
        <StationPicker label="출발역" placeholder="예: 일원" apiBaseUrl={apiBaseUrl}
          selectedStation={origin} disabled={loading} onSelect={(station) => {
            setOrigin(station);
            setRoute(null);
            setError(null);
          }} />
        <StationPicker label="도착역" placeholder="예: 학여울" apiBaseUrl={apiBaseUrl}
          selectedStation={destination} disabled={loading} onSelect={(station) => {
            setDestination(station);
            setRoute(null);
            setError(null);
          }} />
        {origin && destination && origin.id === destination.id
          ? <Text style={styles.description}>출발역과 도착역은 다르게 선택해 주세요.</Text> : null}
        <Button
          label={loading ? '길 찾는 중…' : '길 찾기'}
          onPress={handleFindRoute}
          loading={loading}
          disabled={!origin || !destination || origin.id === destination.id || loading}
        />
        <Text style={styles.description} accessibilityLiveRegion="polite">
          {error}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.background },
  content: { padding: tokens.spacing.lg, gap: tokens.spacing.lg },
  title: { color: tokens.colors.text, fontSize: tokens.fontSize.title, fontWeight: '700' },
  description: { color: tokens.colors.muted, fontSize: tokens.fontSize.body },
});
