import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { PlanRoute } from './src/api';
import { MapScreen } from './src/screens/MapScreen';
import { TruckProfileScreen } from './src/screens/TruckProfileScreen';
import { TruckProfileProvider, useTruckProfile } from './src/state/TruckProfileContext';
import { day, night, ThemeContext } from './src/theme';

interface ShellProps {
  planRoute?: PlanRoute;
}

/**
 * The editor opens on top of the map, which stays mounted, so a pending destination survives
 * "Check truck details" → Save and is re-requested with the new profile (BR-31 AC-5, AC-11).
 */
export function AppShell({ planRoute }: ShellProps) {
  const { saved, save } = useTruckProfile();
  const [editing, setEditing] = useState(false);
  const [profileVersion, setProfileVersion] = useState(0);
  return (
    <View style={styles.root}>
      <MapScreen planRoute={planRoute} onEditProfile={() => setEditing(true)} profileVersion={profileVersion} />
      {editing && (
        <View style={StyleSheet.absoluteFill}>
          <TruckProfileScreen
            initial={saved}
            onBack={() => setEditing(false)}
            onSave={(next, profile) => {
              save(next, profile);
              setEditing(false);
              setProfileVersion((v) => v + 1);
            }}
          />
        </View>
      )}
    </View>
  );
}

export default function App() {
  const scheme = useColorScheme();
  const palette = scheme === 'light' ? day : night;
  return (
    <SafeAreaProvider>
      <ThemeContext.Provider value={palette}>
        <TruckProfileProvider>
          <SafeAreaView style={[styles.root, { backgroundColor: palette.background }]}>
            <StatusBar style={scheme === 'light' ? 'dark' : 'light'} />
            <AppShell />
          </SafeAreaView>
        </TruckProfileProvider>
      </ThemeContext.Provider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
