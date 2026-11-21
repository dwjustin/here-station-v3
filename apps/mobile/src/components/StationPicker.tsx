import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { searchStations, type Station } from '../api/stations';
import { colors, useUi } from '../theme/token';

/**
 * 역 입력 한 칸의 검색 상태. 입력칸과 결과 목록을 화면이 따로 배치할 수 있게 상태만 꺼냈다.
 * 동작은 그대로다: 300ms 뒤 검색, 이전 요청 취소, 입력을 고치면 선택 해제.
 */
export function useStationField(label: string, apiBaseUrl: string, selectedStation: Station | null,
  onSelect: (station: Station | null) => void) {
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

  function change(text: string) {
    if (__DEV__) console.log('[stations:input]', { field: label, text });
    setQuery(text);
    onSelect(null);
    setResults([]);
    setError(null);
    setLoading(Boolean(text.trim()));
  }

  function pick(station: Station) {
    if (__DEV__) console.log('[stations:selected]', { field: label, stationId: station.id });
    setQuery(station.name);
    onSelect(station);
    setResults([]);
    setError(null);
    setLoading(false);
  }

  const empty = !loading && !error && query.trim() !== '' && !selectedStation && results.length === 0;
  const status = loading ? '검색 중…' : error ?? (empty ? '검색 결과가 없습니다.' : null);
  return { label, query, results, status, selected: selectedStation, change, pick };
}

export type StationField = ReturnType<typeof useStationField>;

type InputProps = {
  field: StationField;
  placeholder: string;
  marker: 'origin' | 'destination';
  disabled: boolean;
  onFocus: () => void;
  autoFocus?: boolean;
};

/** 왼쪽 표시(출발 고리·도착 점)와 테두리 없는 큰 입력칸 */
export function StationInput({ field, placeholder, marker, disabled, onFocus, autoFocus }: InputProps) {
  const ui = useUi();
  const dot = ui.px(14);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: ui.touch + ui.space.sm, gap: ui.space.md }}>
      <View
        accessible={false}
        style={{
          width: dot,
          height: dot,
          borderRadius: dot,
          borderWidth: marker === 'origin' ? ui.px(4) : 0,
          borderColor: colors.scarf,
          backgroundColor: marker === 'origin' ? colors.background : colors.helmet,
        }}
      />
      <View style={{ flex: 1 }}>
        <Text style={[ui.type.caption, { color: colors.muted }]}>{field.label}</Text>
        <TextInput
          style={[ui.type.headline, { paddingVertical: ui.space.xs, color: colors.text }]}
          accessibilityLabel={field.label}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          value={field.query}
          editable={!disabled}
          accessibilityState={{ disabled }}
          maxLength={100}
          autoCorrect={false}
          autoFocus={autoFocus}
          returnKeyType="search"
          onFocus={onFocus}
          onChangeText={field.change}
        />
      </View>
      {field.selected ? (
        <View
          accessible
          accessibilityLabel={`${field.label} 선택됨`}
          style={{
            width: ui.px(24), height: ui.px(24), borderRadius: ui.px(24),
            backgroundColor: colors.scarf, alignItems: 'center', justifyContent: 'center',
          }}
        >
          {/* 테두리 두 변을 돌려 만든 체크 표시 */}
          <View style={{
            width: ui.px(11), height: ui.px(6), marginTop: -ui.px(2),
            borderLeftWidth: 2.5, borderBottomWidth: 2.5, borderColor: colors.onCamera,
            transform: [{ rotate: '-45deg' }],
          }} />
        </View>
      ) : null}
    </View>
  );
}

/** 서울 지하철 1~9호선 노선색. 모르는 노선은 갈색으로 둔다 */
const LINE_COLORS: Record<string, string> = {
  '1': '#0052A4', '2': '#00A84D', '3': '#EF7C1C', '4': '#00A5DE', '5': '#996CAC',
  '6': '#CD7C2F', '7': '#747F00', '8': '#E6186C', '9': '#BDB092',
};

function LineBadge({ line }: { line: string }) {
  const ui = useUi();
  const size = ui.px(26);
  const short = line.length <= 2;
  return (
    <View style={{
      minWidth: size,
      height: size,
      paddingHorizontal: short ? 0 : ui.space.sm,
      borderRadius: size,
      backgroundColor: LINE_COLORS[line] ?? colors.fur,
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <Text style={[ui.type.label, { color: line === '9' ? colors.text : colors.onCamera }]} allowFontScaling={false}>
        {line}
      </Text>
    </View>
  );
}

/** 검색 결과는 카드 없이 한 줄씩. 노선 배지가 먼저 눈에 들어오게 한다 */
export function StationResults({ field, disabled }: { field: StationField; disabled: boolean }) {
  const ui = useUi();
  return (
    <View>
      <View accessibilityLiveRegion="polite">
        {field.status ? (
          <Text style={[ui.type.body, { color: colors.muted, paddingVertical: ui.space.md }]}>{field.status}</Text>
        ) : null}
      </View>
      {field.results.map((station) => (
        <Pressable
          key={station.id}
          accessibilityRole="button"
          accessibilityLabel={`${station.name}, ${station.lines.join(', ')}호선, ${field.label}으로 선택`}
          disabled={disabled}
          accessibilityState={{ disabled }}
          onPress={() => field.pick(station)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: ui.space.md,
            minHeight: ui.touch + ui.space.sm,
            paddingHorizontal: ui.space.sm,
            marginHorizontal: -ui.space.sm,
            borderRadius: ui.radius.sm,
            backgroundColor: pressed ? colors.sunken : 'transparent',
          })}
        >
          <View style={{ flexDirection: 'row', gap: ui.space.xs }}>
            {station.lines.map((line) => <LineBadge key={line} line={line} />)}
          </View>
          <Text style={[ui.type.bodyBold, { flex: 1 }]}>{station.name}</Text>
          <Text style={[ui.type.caption, { color: colors.muted }]}>
            {station.lines.map((line) => `${line}호선`).join(' · ')}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
