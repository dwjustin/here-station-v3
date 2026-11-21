import { StyleSheet, Text } from 'react-native';

import { tokens } from '../theme/token';
import Card from './ui/Card';

type Props = {
  instruction: string;
  detail?: string;
};

export default function GuidanceCard({ instruction, detail }: Props) {
  return (
    <Card style={styles.card}>
      <Text style={styles.label}>보행 안내</Text>
      <Text style={styles.instruction} accessibilityLiveRegion="polite">{instruction}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: tokens.spacing.sm },
  label: { color: tokens.colors.muted, fontSize: tokens.fontSize.body },
  instruction: { color: tokens.colors.text, fontSize: tokens.fontSize.title, fontWeight: '700' },
  detail: { color: tokens.colors.muted, fontSize: tokens.fontSize.body },
});
