// react-native-maps is native; in Jest its components render as Views that keep their props,
// so tests can assert that `map.routeLine` exists only when a route was returned.
jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MapView = React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
    React.useImperativeHandle(ref, () => ({ fitToCoordinates: jest.fn() }));
    return React.createElement(View, props, props.children);
  });
  const Polyline = (props: Record<string, unknown>) => React.createElement(View, props);
  const Marker = (props: Record<string, unknown>) => React.createElement(View, props);
  return { __esModule: true, default: MapView, Polyline, Marker };
});
