import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { createContext, useContext, type ReactNode } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Voice output (BR-31 §6, ADR-0002). One interface so the screens don't care how a line is
 * spoken and tests can assert exactly which lines play.
 *
 * With a screen reader on, the line is announced through it instead of TTS, so two voices
 * never talk over each other (BR-31 §8.4).
 */
export interface Speaker {
  say(line: string, options?: { critical?: boolean }): void;
}

/** BR-31 §4.2 `haptic.critical`: 3 pulses × 150 ms with 100 ms gaps, once with the voice line. */
async function criticalHaptic() {
  for (let i = 0; i < 3; i += 1) {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

export const deviceSpeaker: Speaker = {
  say(line, options) {
    void AccessibilityInfo.isScreenReaderEnabled()
      .catch(() => false)
      .then((screenReader) => {
        if (screenReader) {
          AccessibilityInfo.announceForAccessibility(line);
        } else {
          Speech.stop();
          Speech.speak(line, { language: 'en-US' });
        }
        if (options?.critical) void criticalHaptic();
      });
  },
};

const Ctx = createContext<Speaker>(deviceSpeaker);
export const useSpeaker = () => useContext(Ctx);
export function SpeakerProvider({ speaker, children }: { speaker: Speaker; children: ReactNode }) {
  return <Ctx.Provider value={speaker}>{children}</Ctx.Provider>;
}
