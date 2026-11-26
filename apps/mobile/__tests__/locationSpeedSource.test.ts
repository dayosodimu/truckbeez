jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
  Accuracy: { High: 4 },
}));

import { Linking } from 'react-native';
import { locationSpeedSource } from '../src/motion/locationSpeedSource';

const mockLocation = jest.requireMock('expo-location') as {
  getForegroundPermissionsAsync: jest.Mock;
  requestForegroundPermissionsAsync: jest.Mock;
  watchPositionAsync: jest.Mock;
};

const granted = (accuracy: 'fine' | 'coarse' = 'fine') => ({ granted: true, canAskAgain: true, android: { accuracy } });
const denied = (canAskAgain: boolean) => ({ granted: false, canAskAgain });

describe('locationSpeedSource (BR-78)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('asks on launch, watches at High accuracy, and converts fixes through the trust rules', async () => {
    mockLocation.getForegroundPermissionsAsync.mockResolvedValue(denied(true));
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue(granted());
    let deliver!: (p: unknown) => void;
    mockLocation.watchPositionAsync.mockImplementation(async (_o: unknown, cb: (p: unknown) => void) => {
      deliver = cb;
      return { remove: jest.fn() };
    });
    const fixes: unknown[] = [];
    const result = await locationSpeedSource.start((f) => fixes.push(f), { prompt: true });
    expect(result.permission).toBe('granted');
    expect(mockLocation.watchPositionAsync.mock.calls[0][0]).toMatchObject({ accuracy: 4, timeInterval: 1000 });
    deliver({ timestamp: 1, mocked: true, coords: { latitude: 40, longitude: -74, speed: 0, accuracy: 5 } });
    expect(fixes).toEqual([{ speedMps: null, at: 1 }]); // mocked: no speed
  });

  it('@driver-safety Android approximate (coarse) location does not start the speed watch', async () => {
    mockLocation.getForegroundPermissionsAsync.mockResolvedValue(granted('coarse'));
    const result = await locationSpeedSource.start(jest.fn());
    expect(result.permission).toBe('approximate');
    expect(mockLocation.watchPositionAsync).not.toHaveBeenCalled();
  });

  it('a silent re-check (prompt: false) never shows the OS dialog', async () => {
    mockLocation.getForegroundPermissionsAsync.mockResolvedValue(denied(true));
    expect((await locationSpeedSource.start(jest.fn(), { prompt: false })).permission).toBe('denied');
    expect(mockLocation.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('QA P2: when the OS will not ask again, "Allow location" opens Settings', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue(denied(false));
    expect(await locationSpeedSource.requestPermission()).toBe('denied');
    expect(openSettings).toHaveBeenCalled();
    openSettings.mockClear();
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue(denied(true));
    await locationSpeedSource.requestPermission();
    expect(openSettings).not.toHaveBeenCalled();
  });
});
