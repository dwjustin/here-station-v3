
import { Redirect, router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useRouteSession } from '../state/RouteSession';
import { tokens } from '../theme/token';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

export default function RoutePreviewScreen() {
  const { route } = useRouteSession();

  if (!route || route.legs.length !== 2) {
    return <Redirect href="/stations" />;
  }

  const { trip } = route;
  const totalWalkM = trip.origin_walk_m + trip.destination_walk_m;

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>경로 미리보기</Text>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>이동 경로</Text>
          <Text style={styles.distance}>
            역 내부 도보 약 {Math.round(totalWalkM)}m
          </Text>

          <Text style={styles.station}>
            🔵 {trip.origin_station_name}역 1번 출구
          </Text>
          <Text style={styles.station}>
            🔴 {trip.destination_station_name}역 1번 출구
          </Text>

          <View style={styles.divider} />

          <Text style={styles.detail}>
            {trip.line_name} · {trip.up_down}
          </Text>
          <Text style={styles.detail}>
            추천 승하차 위치: {trip.door_no}
          </Text>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>이동 순서</Text>

          <Text style={styles.step}>
            ① {trip.origin_station_name}역 1번 출구에서 출발
          </Text>
          <Text style={styles.step}>
            ② 승강장까지 약 {Math.round(trip.origin_walk_m)}m 이동
          </Text>
          <Text style={styles.step}>
            ③ {trip.direction} 방면 열차 탑승
          </Text>
          <Text style={styles.step}>
            ④ {trip.destination_station_name}역 하차
          </Text>
          <Text style={styles.step}>
            ⑤ 1번 출구까지 약 {Math.round(trip.destination_walk_m)}m 이동
          </Text>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>3D 경로 지도</Text>

          <View style={styles.mapPlaceholder}>
            <Text style={styles.placeholderText}>
              3D 경로 지도는 다음 단계에서 연결합니다.
            </Text>
          </View>
        </Card>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="AR 길안내 시작"
          onPress={() => router.push('/guide')}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: tokens.colors.background,
  },
  content: {
    padding: tokens.spacing.lg,
    gap: tokens.spacing.lg,
    paddingBottom: 32,
  },
  title: {
    color: tokens.colors.text,
    fontSize: tokens.fontSize.title,
    fontWeight: '700',
  },
  card: {
    gap: 14,
  },
  sectionTitle: {
    color: tokens.colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  distance: {
    color: tokens.colors.text,
    fontSize: 26,
    fontWeight: '700',
  },
  station: {
    color: tokens.colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  detail: {
    color: tokens.colors.muted,
    fontSize: 14,
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  step: {
    color: tokens.colors.text,
    fontSize: 15,
    lineHeight: 24,
  },
  mapPlaceholder: {
    height: 280,
    borderRadius: 16,
    backgroundColor: '#E9EDF5',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  placeholderText: {
    color: tokens.colors.muted,
    textAlign: 'center',
  },
  footer: {
    padding: 16,
    backgroundColor: tokens.colors.background,
  },
});
