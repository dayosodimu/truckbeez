import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import type { LatLng } from '@truckbeez/shared';
import { usePalette } from '../theme';

interface Props {
  /** Only a validated route's geometry. Undefined in every error state (BR-31 AC-1, AC-9). */
  routeLine?: LatLng[];
  destination?: LatLng;
}

const toCoord = (p: LatLng) => ({ latitude: p.lat, longitude: p.lng });

/** Map with the route line (`map.routeLine`). The route line never exists without a route. */
export function RouteMap({ routeLine, destination }: Props) {
  const palette = usePalette();
  const map = useRef<MapView>(null);

  useEffect(() => {
    if (routeLine && routeLine.length > 1) {
      map.current?.fitToCoordinates(routeLine.map(toCoord), {
        edgePadding: { top: 96, right: 48, bottom: 240, left: 48 },
        animated: true,
      });
    }
  }, [routeLine]);

  return (
    <MapView ref={map} testID="map.view" style={StyleSheet.absoluteFill} accessibilityLabel="Map">
      {routeLine && (
        <Polyline testID="map.routeLine" coordinates={routeLine.map(toCoord)} strokeColor={palette.brandStrong} strokeWidth={6} />
      )}
      {destination && <Marker testID="map.destination" coordinate={toCoord(destination)} title="Destination" />}
    </MapView>
  );
}
