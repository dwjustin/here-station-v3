import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { searchStations, type Station } from '../api/stations';
import { tokens } from '../theme/token';

type Props = {
  label: string;
  placeholder: string;
  apiBaseUrl: string;
  selectedStation: Station | null;
  onSelect: (station: Station | null) => void;
  disabled?: boolean;
};

export default function StationPicker({ label, placeholder, apiBaseUrl, selectedStation, onSelect, disabled = false }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Station[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query.trim() || selectedStation) return;
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const stations = await searchStations(apiBaseUrl, query, controller.signal);
        if (active) setResults(stations);
      } catch (error) {
        if (active) setError(error instanceof Error ? error.message : '역 검색에 실패했습니다.');
      } finally {
        if (active) setLoading(false);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [apiBaseUrl, query, selectedStation]);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        accessibilityLabel={label}
        placeholder={placeholder}
        placeholderTextColor={tokens.colors.muted}
        value={query}
        editable={!disabled}
        accessibilityState={{ disabled }}
        maxLength={100}
        autoCorrect={false}
        onChangeText={(text) => {
          if (__DEV__) console.log('[stations:input]', { field: label, text });
          setQuery(text);
          onSelect(null);
          setResults([]);
          setError(null);
          setLoading(Boolean(text.trim()));
        }}
      />
      <View accessibilityLiveRegion="polite">
        {loading ? <Text style={styles.status}>검색 중…</Text> : null}
        {error ? <Text style={styles.status}>{error}</Text> : null}
        {!loading && !error && query.trim() && !selectedStation && results.length === 0
          ? <Text style={styles.status}>검색 결과가 없습니다.</Text> : null}
      </View>
      {results.map((station) => (
        <Pressable
          key={station.id}
          accessibilityRole="button"
          accessibilityLabel={`${station.name}, ${station.lines.join(', ')}호선, ${label}으로 선택`}
          style={styles.result}
          disabled={disabled}
          accessibilityState={{ disabled }}
          onPress={() => {
            if (__DEV__) console.log('[stations:selected]', { field: label, stationId: station.id });
            setQuery(station.name);
            onSelect(station);
            setResults([]);
            setError(null);
            setLoading(false);
          }}
        >
          <Text style={styles.label}>{station.name}</Text>
          <Text style={styles.status}>{station.lines.map((line) => `${line}호선`).join(' · ')}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: tokens.spacing.sm },
  label: { color: tokens.colors.text, fontSize: tokens.fontSize.body, fontWeight: '600' },
  status: { color: tokens.colors.muted, fontSize: tokens.fontSize.body },
  input: {
    backgroundColor: tokens.colors.surface,
    borderColor: tokens.colors.border,
    borderWidth: 1,
    borderRadius: tokens.radius,
    padding: tokens.spacing.md,
    color: tokens.colors.text,
    fontSize: tokens.fontSize.body,
    minHeight: 48,
  },
  result: {
    padding: tokens.spacing.md,
    minHeight: 48,
    gap: tokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
  },
});
