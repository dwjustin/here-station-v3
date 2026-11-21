import { useCallback, useEffect, useState } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, AppState, Linking, StyleSheet, Text, View } from 'react-native';

import CompassArrow from './CompassArrow';
import Button from './ui/Button';
import { tokens } from '../theme/token';

export default function GuideCamera({ rotationDeg }: { rotationDeg: number | null }) {
  const [permission, requestPermission, refreshPermission] = useCameraPermissions();
  const [focused, setFocused] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppActive(state === 'active');
      if (state === 'active') {
        void refreshPermission().catch(() => setError('카메라 권한을 확인할 수 없습니다.'));
      }
    });
    return () => subscription.remove();
  }, [refreshPermission]);

  async function allowCamera() {
    setError(null);
    try {
      if (permission?.canAskAgain) await requestPermission();
      else await Linking.openSettings();
    } catch {
      setError('카메라 접근을 허용할 수 없습니다. 다시 시도해 주세요.');
    }
  }

  if (!permission) {
    return <View style={styles.message}><ActivityIndicator color={tokens.colors.primary} /></View>;
  }
  if (!permission.granted) {
    return (
      <View style={styles.message}>
        <Text style={styles.text}>주변을 보며 안내받으려면 카메라 접근을 허용해 주세요.</Text>
        {error ? <Text style={styles.text}>{error}</Text> : null}
        <Button label={permission.canAskAgain ? '카메라 허용' : '설정 열기'} onPress={allowCamera} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.message}>
        <Text style={styles.text}>{error}</Text>
        <Button label="다시 시도" onPress={() => setError(null)} />
      </View>
    );
  }
  if (!focused || !appActive) {
    return <View style={styles.message}><Text style={styles.text}>카메라 일시중지</Text></View>;
  }

  return (
    <View style={styles.preview}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        onMountError={(event) => {
          if (__DEV__) console.warn('[camera:error]', event.message);
          setError('카메라를 시작할 수 없습니다.');
        }}
      />
      <View pointerEvents="none" style={styles.overlay}>
        <View style={styles.compass}>
          <CompassArrow rotationDeg={rotationDeg} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  preview: { flex: 1, overflow: 'hidden' },
  overlay: { ...StyleSheet.absoluteFill, justifyContent: 'center', alignItems: 'center' },
  compass: { backgroundColor: tokens.colors.surface, borderRadius: tokens.radius, padding: tokens.spacing.md },
  message: {
    flex: 1,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.surface,
  },
  text: { color: tokens.colors.text, fontSize: tokens.fontSize.body, textAlign: 'center' },
});
