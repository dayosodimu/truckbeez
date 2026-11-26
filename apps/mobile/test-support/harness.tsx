import { act } from '@testing-library/react-native';
import { useState, type ReactNode } from 'react';
import { StaticMotionProvider } from '../src/motion/MotionContext';
import type { MotionState } from '../src/motion/motion';
import { SpeakerProvider, type Speaker } from '../src/voice/Voice';

/** A speaker that records lines instead of speaking. */
export function fakeSpeaker() {
  const lines: { line: string; critical: boolean }[] = [];
  const speaker: Speaker = { say: (line, options) => void lines.push({ line, critical: Boolean(options?.critical) }) };
  return { speaker, lines, said: () => lines.map((l) => l.line) };
}

/**
 * Motion the test controls: `motion.set('moving')`. Starts parked unless told otherwise, so
 * tests that aren't about driving keep the parked flow.
 */
export function controlledMotion(initial: MotionState = 'parked', permission: 'granted' | 'denied' | 'approximate' = 'granted') {
  let setter: ((s: MotionState) => void) | undefined;
  const requestPermission = jest.fn();
  function Provider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<MotionState>(initial);
    setter = setState;
    return (
      <StaticMotionProvider state={state} permission={permission} requestPermission={requestPermission}>
        {children}
      </StaticMotionProvider>
    );
  }
  return {
    Provider,
    set: (s: MotionState) => act(() => setter?.(s)),
    requestPermission,
  };
}

export function Providers({ children, motion, speaker }: { children: ReactNode; motion: ReturnType<typeof controlledMotion>; speaker: Speaker }) {
  return (
    <SpeakerProvider speaker={speaker}>
      <motion.Provider>{children}</motion.Provider>
    </SpeakerProvider>
  );
}
