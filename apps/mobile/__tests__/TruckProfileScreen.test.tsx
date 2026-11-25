import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { TruckProfileScreen } from '../src/screens/TruckProfileScreen';

function fillVan() {
  fireEvent.changeText(screen.getByTestId('truckProfile.height.ft'), '13');
  fireEvent.changeText(screen.getByTestId('truckProfile.height.in'), '6');
  fireEvent.changeText(screen.getByTestId('truckProfile.width.ft'), '8');
  fireEvent.changeText(screen.getByTestId('truckProfile.width.in'), '6');
  fireEvent.changeText(screen.getByTestId('truckProfile.length.ft'), '72');
  fireEvent.changeText(screen.getByTestId('truckProfile.weight.lb'), '80000');
  fireEvent.press(screen.getByTestId('truckProfile.axles.increment')); // 2
  fireEvent.press(screen.getByTestId('truckProfile.axles.increment')); // 3
  fireEvent.press(screen.getByTestId('truckProfile.axles.increment')); // 4
  fireEvent.press(screen.getByTestId('truckProfile.axles.increment')); // 5
}

describe('TruckProfileScreen (BR-29 02a)', () => {
  it('AC-1/AC-2: shows the stored, rounded-up values and saves the metric profile', () => {
    const onSave = jest.fn();
    render(<TruckProfileScreen onSave={onSave} onBack={jest.fn()} />);
    fillVan();
    expect(screen.getByTestId('truckProfile.height.stored')).toHaveTextContent('Saved as 412 cm. We round up, never down.');
    expect(screen.getByTestId('truckProfile.weight.stored')).toHaveTextContent('Saved as 36,288 kg (rounded up)');
    expect(screen.getByTestId('truckProfile.summary')).toHaveTextContent(`Routing will use: 13'6" · 80,000 lb · 5 axles · No hazmat`);
    fireEvent.press(screen.getByTestId('truckProfile.save'));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][1]).toEqual({ heightM: 4.12, widthM: 2.6, lengthM: 21.95, grossWeightKg: 36288, axleCount: 5, hazmatClasses: [] });
  });

  it('AC-8 + AC-6: Save is enabled on an empty form; an invalid save shows errors, saves nothing and announces them', () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const onSave = jest.fn();
    render(<TruckProfileScreen onSave={onSave} onBack={jest.fn()} />);
    expect(screen.getByTestId('truckProfile.save')).not.toBeDisabled();
    fireEvent.press(screen.getByTestId('truckProfile.save'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId('truckProfile.height.error')).toHaveTextContent('Enter your height.', { exact: false });
    expect(announce).toHaveBeenCalledWith(expect.stringMatching(/^5 problems\. Height: /));
  });

  it('AC-5: 12 inches is an inline error and the feet value is unchanged', () => {
    render(<TruckProfileScreen onSave={jest.fn()} onBack={jest.fn()} />);
    fillVan();
    fireEvent.changeText(screen.getByTestId('truckProfile.height.in'), '12');
    fireEvent.press(screen.getByTestId('truckProfile.save'));
    expect(screen.getByTestId('truckProfile.height.error')).toHaveTextContent('Inches must be 0 to 11.9', { exact: false });
    expect(screen.getByTestId('truckProfile.height.ft').props.value).toBe('13');
  });

  it('AC-7: 14 ft 9 in shows a warning and still saves', () => {
    const onSave = jest.fn();
    render(<TruckProfileScreen onSave={onSave} onBack={jest.fn()} />);
    fillVan();
    fireEvent.changeText(screen.getByTestId('truckProfile.height.ft'), '14');
    fireEvent.changeText(screen.getByTestId('truckProfile.height.in'), '9');
    expect(screen.getByTestId('truckProfile.height.warning')).toBeTruthy();
    fireEvent.press(screen.getByTestId('truckProfile.save'));
    expect(onSave).toHaveBeenCalled();
  });

  it('presets fill feet and inches in one tap', () => {
    render(<TruckProfileScreen onSave={jest.fn()} onBack={jest.fn()} />);
    fireEvent.press(screen.getByLabelText('Set height to 13 feet 6 inches'));
    expect(screen.getByTestId('truckProfile.height.preset.13-6')).toBeTruthy();
    expect(screen.getByTestId('truckProfile.height.ft').props.value).toBe('13');
    expect(screen.getByTestId('truckProfile.height.in').props.value).toBe('6');
  });

  it('AC-4: switching to metric shows 412 cm and 36,288 kg for 13 ft 6 in and 80,000 lb; back to ft keeps what was typed', () => {
    const onSave = jest.fn();
    render(<TruckProfileScreen onSave={onSave} onBack={jest.fn()} />);
    fillVan();
    fireEvent.press(screen.getByTestId('truckProfile.units.metric'));
    expect(screen.queryByTestId('truckProfile.height.ft')).toBeNull();
    expect(screen.getByTestId('truckProfile.height.cm').props.value).toBe('412');
    expect(screen.getByTestId('truckProfile.width.cm').props.value).toBe('260');
    expect(screen.getByTestId('truckProfile.weight.kg').props.value).toBe('36288');
    fireEvent.press(screen.getByTestId('truckProfile.units.imperial'));
    expect(screen.getByTestId('truckProfile.height.ft').props.value).toBe('13');
    expect(screen.getByTestId('truckProfile.height.in').props.value).toBe('6');
    fireEvent.press(screen.getByTestId('truckProfile.save'));
    expect(onSave.mock.calls[0][1].heightM).toBe(4.12); // stored value unchanged by switching
  });

  it('@routing-safety metric to imperial fills empty fields rounded UP (411 cm -> 13 ft 6 in, not 13 ft 5 in)', () => {
    render(<TruckProfileScreen onSave={jest.fn()} onBack={jest.fn()} />);
    fireEvent.press(screen.getByTestId('truckProfile.units.metric'));
    fireEvent.changeText(screen.getByTestId('truckProfile.height.cm'), '411');
    fireEvent.press(screen.getByTestId('truckProfile.units.imperial'));
    expect(screen.getByTestId('truckProfile.height.ft').props.value).toBe('13');
    expect(screen.getByTestId('truckProfile.height.in').props.value).toBe('6'); // 161.8 in -> 162
  });

  it('AC-9 + AC-14 + A11Y-3: hazmat classes are checkboxes, tunnel options are radios shown only with hazmat, default Not sure → B', () => {
    const onSave = jest.fn();
    render(<TruckProfileScreen onSave={onSave} onBack={jest.fn()} />);
    fillVan();
    expect(screen.queryByTestId('truckProfile.tunnel.notSure')).toBeNull();
    fireEvent(screen.getByTestId('truckProfile.hazmat.toggle'), 'valueChange', true);
    fireEvent.press(screen.getByTestId('truckProfile.save'));
    expect(screen.getByTestId('truckProfile.hazmat.error')).toHaveTextContent('Pick at least one hazmat class, or turn hazmat off.', { exact: false });

    const class3 = screen.getByTestId('truckProfile.hazmat.class.3');
    expect(class3.props.accessibilityRole).toBe('checkbox');
    fireEvent.press(class3);
    expect(screen.getByTestId('truckProfile.hazmat.class.3').props.accessibilityState).toEqual({ checked: true });
    expect(screen.getByTestId('truckProfile.tunnel.notSure').props.accessibilityRole).toBe('radio');
    // Radios report `checked`, which TalkBack and VoiceOver read for the radio role (design review).
    expect(screen.getByTestId('truckProfile.tunnel.notSure').props.accessibilityState).toEqual({ checked: true });
    expect(screen.getByTestId('truckProfile.tunnel.B').props.accessibilityState).toEqual({ checked: false });

    fireEvent.press(screen.getByTestId('truckProfile.save'));
    expect(onSave.mock.calls[0][1]).toMatchObject({ hazmatClasses: [3], tunnelCategory: 'B' });
  });

  it('the units radios report checked and their names contain the visible text (WCAG 2.5.3)', () => {
    render(<TruckProfileScreen onSave={jest.fn()} onBack={jest.fn()} />);
    expect(screen.getByTestId('truckProfile.units.imperial').props.accessibilityState).toEqual({ checked: true });
    expect(screen.getByTestId('truckProfile.units.imperial').props.accessibilityLabel).toContain('ft / lb');
    expect(screen.getByTestId('truckProfile.units.metric').props.accessibilityLabel).toContain('m / kg');
  });

  it('after an invalid save, a field\'s error is read with it (accessibilityHint)', () => {
    render(<TruckProfileScreen onSave={jest.fn()} onBack={jest.fn()} />);
    fireEvent.press(screen.getByTestId('truckProfile.save'));
    expect(screen.getByTestId('truckProfile.height.ft').props.accessibilityHint).toBe('Enter your height.');
    expect(screen.getByTestId('truckProfile.weight.lb').props.accessibilityHint).toBe('Enter your gross weight.');
  });

  it('A11Y-2: every input has a label with its unit; required fields say "required"', () => {
    render(<TruckProfileScreen onSave={jest.fn()} onBack={jest.fn()} />);
    expect(screen.getByLabelText('Height, feet, required')).toBeTruthy();
    expect(screen.getByLabelText('Height, inches')).toBeTruthy();
    expect(screen.getByLabelText('Gross weight, pounds, required')).toBeTruthy();
    expect(screen.getByLabelText('Length (tractor + trailer), feet, required')).toBeTruthy();
  });

  it('redisplays a saved profile exactly as typed (AC-3)', () => {
    const onSave = jest.fn();
    const { unmount } = render(<TruckProfileScreen onSave={onSave} onBack={jest.fn()} />);
    fillVan();
    fireEvent.press(screen.getByTestId('truckProfile.save'));
    unmount();
    render(<TruckProfileScreen initial={onSave.mock.calls[0][0]} onSave={jest.fn()} onBack={jest.fn()} />);
    expect(screen.getByTestId('truckProfile.height.ft').props.value).toBe('13');
    expect(screen.getByTestId('truckProfile.height.in').props.value).toBe('6');
  });
});
