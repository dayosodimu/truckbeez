import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { PlanRoute } from './src/api';
import { MovingLockOverlay } from './src/components/MovingLockOverlay';
import { locationSpeedSource } from './src/motion/locationSpeedSource';
import { MotionProvider, useMotion } from './src/motion/MotionContext';
import type { ProfileDraft } from './src/profile/draft';
import { formatProfileChip } from './src/profile/format';
import { MapScreen } from './src/screens/MapScreen';
import { TruckProfileScreen } from './src/screens/TruckProfileScreen';
import { TruckProfileProvider, useTruckProfile } from './src/state/TruckProfileContext';
import { day, night, ThemeContext } from './src/theme';
import { VOICE } from './src/voice/lines';
import { useSpeaker } from './src/voice/Voice';

interface ShellProps {
  planRoute?: PlanRoute;
}

/**
 * The editor opens on top of the map, which stays mounted, so a pending destination survives
 * "Check truck details" → Save and is re-requested with the new profile (BR-31 AC-5, AC-11).
 *
 * Moving lock (BR-29 §7 / 02g, BR-78): the editor never opens while moving, and if the truck
 * starts moving during an edit the form is locked behind the overlay. The unsaved draft is
 * kept and never saved automatically; parked again, the editor offers it back (Review / Discard).
 */
export function AppShell({ planRoute }: ShellProps) {
  const { saved, save } = useTruckProfile();
  const { moving } = useMotion();
  const speaker = useSpeaker();
  const [editing, setEditing] = useState(false);
  const [entryLock, setEntryLock] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft>();
  const [profileVersion, setProfileVersion] = useState(0);
  const currentDetails = formatProfileChip(saved).text;

  const openEditor = () => {
    if (moving) {
      setEntryLock(true);
      speaker.say(VOICE.parkToEdit);
      return;
    }
    setEditing(true);
  };

  return (
    <View style={styles.root}>
      <MapScreen planRoute={planRoute} onEditProfile={openEditor} profileVersion={profileVersion} />
      {editing && (
        <View style={StyleSheet.absoluteFill}>
          <TruckProfileScreen
            initial={saved}
            restoredDraft={draft}
            locked={moving}
            onDraftChange={setDraft}
            onDiscardDraft={() => setDraft(undefined)}
            onBack={() => setEditing(false)}
            onSave={(next, profile) => {
              save(next, profile);
              setDraft(undefined);
              setEditing(false);
              setProfileVersion((v) => v + 1);
            }}
          />
          {moving && <MovingLockOverlay reason="paused" currentDetails={currentDetails} onOk={() => setEditing(false)} />}
        </View>
      )}
      {entryLock && !editing && (
        <View style={StyleSheet.absoluteFill}>
          <MovingLockOverlay reason="entry" currentDetails={currentDetails} onOk={() => setEntryLock(false)} />
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
        <MotionProvider source={locationSpeedSource}>
          <TruckProfileProvider>
            <SafeAreaView style={[styles.root, { backgroundColor: palette.background }]}>
              <StatusBar style={scheme === 'light' ? 'dark' : 'light'} />
              <AppShell />
            </SafeAreaView>
          </TruckProfileProvider>
        </MotionProvider>
      </ThemeContext.Provider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
