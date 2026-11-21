import { StyleSheet, Text, View } from 'react-native';

import type { RouteResponse } from '../api/routes';
import { tokens } from '../theme/token';

export default function RouteList({ route }: { route: RouteResponse }) {
  const { trip } = route;
  const steps = [
    { name: `${trip.origin_station_name}역 · 1번 출구 → 승강장`, detail: `${Math.round(trip.origin_walk_m)}m 보행` },
    { name: `${trip.line_name} · ${trip.direction} 방면`, detail: `추천 승차 위치 ${trip.door_no} · ${trip.destination_station_name}역 하차` },
    { name: `${trip.destination_station_name}역 · 승강장 → 1번 출구`, detail: `${Math.round(trip.destination_walk_m)}m 보행` },
  ];
  return (
    <View style={styles.list}>
      {steps.map((step, index) => (
        <View key={index} style={styles.step}>
          <Text style={styles.node}>{index + 1}. {step.name}</Text>
          <Text style={styles.detail}>{step.detail}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: tokens.spacing.lg },
  step: { gap: tokens.spacing.sm },
  node: { color: tokens.colors.text, fontSize: tokens.fontSize.body, fontWeight: '600' },
  detail: { color: tokens.colors.muted, fontSize: tokens.fontSize.body },
});
