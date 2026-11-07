import type { LatLng } from "../types.js";

/**
 * Decoder for HERE's Flexible Polyline format (the `polyline` field in Routing v8 responses).
 * Spec: https://github.com/heremaps/flexible-polyline
 * Ported from PR #2 (BR-1) so the server has no third-party decoder dependency.
 *
 * Plain arithmetic is used instead of bitwise operators because scaled coordinates
 * exceed the 32-bit range that JavaScript's bitwise operators work in.
 */

const ENCODING_TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const DECODING_TABLE = new Map([...ENCODING_TABLE].map((char, index) => [char, index]));
const FORMAT_VERSION = 1;
const ABSENT_THIRD_DIMENSION = 0;

function* unsignedValues(encoded: string): Generator<number> {
  let value = 0;
  let multiplier = 1;
  for (const char of encoded) {
    const chunk = DECODING_TABLE.get(char);
    if (chunk === undefined) {
      throw new Error(`Invalid flexible polyline character: ${char}`);
    }
    value += (chunk % 32) * multiplier;
    if (chunk >= 32) {
      multiplier *= 32;
    } else {
      yield value;
      value = 0;
      multiplier = 1;
    }
  }
  if (multiplier !== 1) {
    throw new Error("Invalid flexible polyline: truncated value");
  }
}

const toSigned = (value: number): number => (value % 2 === 1 ? -(value + 1) / 2 : value / 2);

export function decodeFlexiblePolyline(encoded: string): LatLng[] {
  const values = unsignedValues(encoded);
  const next = (): number => {
    const { value, done } = values.next();
    if (done) throw new Error("Invalid flexible polyline: unexpected end");
    return value;
  };

  const version = next();
  if (version !== FORMAT_VERSION) {
    throw new Error(`Unsupported flexible polyline version: ${version}`);
  }

  const header = next();
  const precision = header % 16;
  const thirdDimension = Math.floor(header / 16) % 8;
  const factor = 10 ** precision;

  const points: LatLng[] = [];
  let lat = 0;
  let lng = 0;

  for (let result = values.next(); !result.done; result = values.next()) {
    lat += toSigned(result.value);
    lng += toSigned(next());
    if (thirdDimension !== ABSENT_THIRD_DIMENSION) {
      next(); // Elevation/level is not used by the app yet.
    }
    points.push({ lat: lat / factor, lng: lng / factor });
  }

  return points;
}
