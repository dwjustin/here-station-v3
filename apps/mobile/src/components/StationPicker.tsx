import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { searchStations, type Station } from '../api/stations';
import { colors, useUi } from '../theme/token';

/**
 * 고를 수 있는 역 전체. 빈 검색어로 GET /stations를 한 번 불러 노선별로 묶는다.
 * 사용자는 글자를 치지 않고 노선 → 역 순서로 누르기만 한다.
 */
export function useStationList(apiBaseUrl: string) {
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    searchStations(apiBaseUrl, '', controller.signal)
      .then((list) => { if (active) setStations(list); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : '역 목록을 불러오지 못했습니다.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => {
      active = false;
      controller.abort();
    };
  }, [apiBaseUrl, attempt]);

  const retry = useCallback(() => {
    setLoading(true);
    setError(null);
    setAttempt((n) => n + 1);
  }, []);
  return { stations, loading, error, retry };
}

/** 노선 번호 순(1, 2, … 9, 그 밖은 이름순)으로 나열한 노선 목록 */
export function linesOf(stations: Station[]): string[] {
  const lines = [...new Set(stations.flatMap((s) => s.lines))];
  return lines.sort((a, b) => (Number(a) || Infinity) - (Number(b) || Infinity) || a.localeCompare(b, 'ko'));
}

/** 서울 지하철 1~9호선 노선색. 모르는 노선은 갈색으로 둔다 */
const LINE_COLORS: Record<string, string> = {
  '1': '#0052A4', '2': '#00A84D', '3': '#EF7C1C', '4': '#00A5DE', '5': '#996CAC',
  '6': '#CD7C2F', '7': '#747F00', '8': '#E6186C', '9': '#BDB092',
};
const lineColor = (line: string) => LINE_COLORS[line] ?? colors.fur;

function LineBadge({ line, size }: { line: string; size: number }) {
  const ui = useUi();
  return (
    <View style={{
      minWidth: size, height: size, borderRadius: size,
      paddingHorizontal: line.length <= 2 ? 0 : ui.space.xs,
      backgroundColor: lineColor(line), alignItems: 'center', justifyContent: 'center',
    }}>
      {/* 원이 깨지지 않게 시스템 글자 크기를 따르지 않는다 */}
      <Text style={[ui.type.label, { fontSize: size * 0.5, lineHeight: size * 0.7, color: line === '9' ? colors.text : colors.onCamera }]}
        allowFontScaling={false}>
        {line}
      </Text>
    </View>
  );
}

type FieldProps = {
  label: string;
  station: Station | null;
  marker: 'origin' | 'destination';
  active: boolean;
  disabled: boolean;
  onPress: () => void;
};

/** 왼쪽 표시(출발 고리·도착 점)와 고른 역 이름. 지금 고르는 칸은 아래에 노란 줄이 붙는다 */
export function StationField({ label, station, marker, active, disabled, onPress }: FieldProps) {
  const ui = useUi();
  const dot = ui.px(14);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${station ? station.name : '선택 안 됨'}`}
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', minHeight: ui.touch + ui.space.sm, gap: ui.space.md }}
    >
      <View style={{
        width: dot, height: dot, borderRadius: dot,
        borderWidth: marker === 'origin' ? ui.px(4) : 0,
        borderColor: colors.scarf,
        backgroundColor: marker === 'origin' ? colors.background : colors.helmet,
      }} />
      <View style={{ flex: 1, paddingVertical: ui.space.xs }}>
        <Text style={[ui.type.caption, { color: colors.muted }]}>{label}</Text>
        <Text style={[ui.type.headline, station ? null : { fontFamily: ui.type.body.fontFamily, color: colors.placeholder }]}>
          {station ? station.name : '역을 골라 주세요'}
        </Text>
        {active ? (
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, borderRadius: 3, backgroundColor: colors.helmet }} />
        ) : null}
      </View>
      {station ? (
        <View style={{
          width: ui.px(24), height: ui.px(24), borderRadius: ui.px(24),
          backgroundColor: colors.scarf, alignItems: 'center', justifyContent: 'center',
        }}>
          {/* 테두리 두 변을 돌려 만든 체크 표시 */}
          <View style={{
            width: ui.px(11), height: ui.px(6), marginTop: -ui.px(2),
            borderLeftWidth: 2.5, borderBottomWidth: 2.5, borderColor: colors.onCamera,
            transform: [{ rotate: '-45deg' }],
          }} />
        </View>
      ) : null}
    </Pressable>
  );
}

/** 노선 고르기. 원형 노선 배지를 한 줄에 놓고, 고른 노선만 색을 채운다 */
export function LineTabs({ lines, value, onChange }: { lines: string[]; value: string | null; onChange: (line: string) => void }) {
  const ui = useUi();
  const size = Math.max(ui.px(36), 36);
  return (
    <View accessibilityRole="tablist" style={{
      flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: ui.space.sm,
      paddingVertical: ui.space.sm, backgroundColor: colors.background,
    }}>
      {lines.map((line) => {
        const on = line === value;
        return (
          <Pressable
            key={line}
            accessibilityRole="tab"
            accessibilityLabel={`${line}호선`}
            accessibilityState={{ selected: on }}
            onPress={() => onChange(line)}
            // 배지는 작아도 누르는 영역은 48dp
            hitSlop={Math.max(0, (48 - size) / 2)}
            style={({ pressed }) => ({
              width: size, height: size, borderRadius: size,
              borderWidth: 2.5, borderColor: lineColor(line),
              backgroundColor: on ? lineColor(line) : colors.background,
              alignItems: 'center', justifyContent: 'center',
              transform: [{ scale: pressed ? 0.94 : on ? 1.1 : 1 }],
            })}
          >
            <Text allowFontScaling={false} style={[ui.type.bodyBold, {
              color: on ? (line === '9' ? colors.text : colors.onCamera) : lineColor(line),
            }]}>
              {line}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type ListProps = {
  stations: Station[];
  line: string;
  selectedId: string | null;
  label: string;
  disabled: boolean;
  onPick: (station: Station) => void;
};

/** 고른 노선의 역 목록. 카드 없이 한 줄씩, 갈아탈 수 있는 노선은 오른쪽에 작게 */
export function StationList({ stations, line, selectedId, label, disabled, onPick }: ListProps) {
  const ui = useUi();
  return (
    <View>
      {stations.filter((s) => s.lines.includes(line)).map((station) => {
        const others = station.lines.filter((l) => l !== line);
        const picked = station.id === selectedId;
        return (
          <Pressable
            key={station.id}
            accessibilityRole="button"
            accessibilityLabel={`${station.name}, ${station.lines.join(', ')}호선, ${label}으로 선택`}
            accessibilityState={{ selected: picked, disabled }}
            disabled={disabled}
            onPress={() => onPick(station)}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: ui.space.md,
              minHeight: ui.touch + ui.space.sm,
              paddingHorizontal: ui.space.sm, marginHorizontal: -ui.space.sm,
              borderRadius: ui.radius.sm,
              backgroundColor: pressed ? colors.sunken : picked ? colors.surface : 'transparent',
            })}
          >
            <LineBadge line={line} size={ui.px(26)} />
            <Text style={[ui.type.bodyBold, { flex: 1 }]}>{station.name}</Text>
            <View style={{ flexDirection: 'row', gap: ui.space.xs }}>
              {others.map((l) => <LineBadge key={l} line={l} size={ui.px(22)} />)}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
