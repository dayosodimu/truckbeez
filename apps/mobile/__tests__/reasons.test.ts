import { mapReasons } from '../src/route/reasons';

const GENERIC = "A road on every route has a limit your truck doesn't meet (height, weight, length, or hazmat).";

describe('NO_SAFE_ROUTE reasons → driver words (BR-31 §5.2)', () => {
  it('AC-2: the generic HERE title maps to the generic row; a hazmat profile adds the hazmat row', () => {
    expect(mapReasons(['Violated vehicle restriction.'], false).rows).toEqual([{ kind: 'unknown-vehicle', text: GENERIC }]);
    const withHazmat = mapReasons(['Violated vehicle restriction.'], true).rows;
    expect(withHazmat[0]!.text).toBe(GENERIC);
    expect(withHazmat[1]).toEqual({ kind: 'hazmat', text: 'Your hazmat load may be the reason.' });
  });

  it('AC-4: an empty list shows the fallback row, never an empty list', () => {
    expect(mapReasons([], false).rows).toEqual([{ kind: 'unknown', text: "We couldn't find a road your truck is allowed on." }]);
  });

  it('matches by keyword, de-duplicates by kind and orders by priority', () => {
    const { rows } = mapReasons(['Violated avoid tunnel.', 'Low BRIDGE clearance', 'Bridge height', 'Hazardous goods restriction'], false);
    expect(rows.map((r) => r.kind)).toEqual(['hazmat', 'tunnel', 'height']);
  });

  it('caps at three rows and counts the rest', () => {
    const result = mapReasons(['hazmat', 'tunnel', 'height', 'weight', 'width'], false);
    expect(result.rows).toHaveLength(3);
    expect(result.more).toBe(2);
  });

  it('reports titles no rule knows, for telemetry', () => {
    expect(mapReasons(['Something new from HERE'], false).unmapped).toEqual(['Something new from HERE']);
  });
});
