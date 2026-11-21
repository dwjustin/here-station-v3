import { StyleSheet, Text, View } from 'react-native';

import type { RouteResponse } from '../api/routes';
import { tokens } from '../theme/token';

export default function RouteList({ route }: { route: RouteResponse }) {
  const maps: Record<string, { name: string }> = route.maps;
  return (
    <View style={styles.list}>
      {route.nodes.map((node, index) => (
        <View key={`${index}:${node.id}`} style={styles.step}>
          <Text style={styles.node}>
            {index + 1}. {maps[node.station_id]?.name ?? node.station_id}역 · {node.name}
          </Text>
          <Text style={styles.detail}>{node.level}</Text>
          {route.edges[index] ? (
            <Text style={styles.instruction}>↓ {route.edges[index].instruction}</Text>
          ) : null}
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
  instruction: {
    color: tokens.colors.muted,
    fontSize: tokens.fontSize.body,
    paddingTop: tokens.spacing.sm,
  },
});
