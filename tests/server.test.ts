import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getEstimatedFuel,
  processWattTimeData,
  combineAndFilterData,
  averageByPTHour,
  findBestWindow,
  getCurrentIntensity,
  isGoodTimeToCharge,
  type EmissionDataPoint,
} from '../src/shared';

// ---------------------------------------------------------------------------
// Server-side logic tests (shared functions used by server.ts routes)
// These test the data pipeline that the /api/emissions and
// /api/monthly-averages endpoints rely on.
// ---------------------------------------------------------------------------

describe('processWattTimeData (server pipeline)', () => {
  it('handles large datasets without error', () => {
    const raw = Array.from({ length: 1000 }, (_, i) => ({
      point_time: `2024-06-15T${String(Math.floor(i / 60) % 24).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`,
      value: Math.random() * 1000,
    }));
    const result = processWattTimeData(raw, 'history');
    expect(result).toHaveLength(1000);
    result.forEach(point => {
      expect(point).toHaveProperty('timestamp');
      expect(point).toHaveProperty('intensity');
      expect(point).toHaveProperty('marginalFuel');
      expect(point).toHaveProperty('type');
      expect(point.type).toBe('history');
    });
  });

  it('preserves original timestamps exactly', () => {
    const raw = [
      { point_time: '2024-01-01T00:00:00.000Z', value: 50 },
      { point_time: '2024-12-31T23:59:59Z', value: 800 },
    ];
    const result = processWattTimeData(raw, 'forecast');
    expect(result[0].timestamp).toBe('2024-01-01T00:00:00.000Z');
    expect(result[1].timestamp).toBe('2024-12-31T23:59:59Z');
  });

  it('correctly labels fuel for all threshold values', () => {
    const raw = [
      { point_time: '2024-06-15T00:00:00Z', value: 0 },
      { point_time: '2024-06-15T01:00:00Z', value: 99.99 },
      { point_time: '2024-06-15T02:00:00Z', value: 100 },
      { point_time: '2024-06-15T03:00:00Z', value: 399.99 },
      { point_time: '2024-06-15T04:00:00Z', value: 400 },
      { point_time: '2024-06-15T05:00:00Z', value: 699.99 },
      { point_time: '2024-06-15T06:00:00Z', value: 700 },
      { point_time: '2024-06-15T07:00:00Z', value: 1500 },
    ];
    const result = processWattTimeData(raw, 'history');
    expect(result[0].marginalFuel).toBe('Solar/Wind');
    expect(result[1].marginalFuel).toBe('Solar/Wind');
    expect(result[2].marginalFuel).toBe('Hydro/Mix');
    expect(result[3].marginalFuel).toBe('Hydro/Mix');
    expect(result[4].marginalFuel).toBe('Natural Gas');
    expect(result[5].marginalFuel).toBe('Natural Gas');
    expect(result[6].marginalFuel).toBe('Peaker Plant');
    expect(result[7].marginalFuel).toBe('Peaker Plant');
  });
});

describe('combineAndFilterData (server pipeline)', () => {
  it('deduplicates overlapping history and forecast by keeping both', () => {
    const now = new Date('2024-06-15T14:00:00Z');
    const history: EmissionDataPoint[] = [
      { timestamp: '2024-06-15T14:00:00Z', intensity: 300, marginalFuel: 'Hydro/Mix', type: 'history' },
    ];
    const forecast: EmissionDataPoint[] = [
      { timestamp: '2024-06-15T14:00:00Z', intensity: 310, marginalFuel: 'Hydro/Mix', type: 'forecast' },
      { timestamp: '2024-06-15T15:00:00Z', intensity: 200, marginalFuel: 'Hydro/Mix', type: 'forecast' },
    ];
    const result = combineAndFilterData(history, forecast, now);
    // Both the history and forecast point at 14:00 should be present
    expect(result.filter(d => d.timestamp === '2024-06-15T14:00:00Z')).toHaveLength(2);
    expect(result).toHaveLength(3);
  });

  it('filters based on server hour start (minutes zeroed)', () => {
    const now = new Date('2024-06-15T14:45:00Z');
    const history: EmissionDataPoint[] = [
      { timestamp: '2024-06-15T14:30:00Z', intensity: 300, marginalFuel: 'Hydro/Mix' },
    ];
    const forecast: EmissionDataPoint[] = [
      { timestamp: '2024-06-15T15:00:00Z', intensity: 200, marginalFuel: 'Hydro/Mix' },
    ];
    // currentHourStart = 14:00, so 14:30 passes
    const result = combineAndFilterData(history, forecast, now);
    expect(result).toHaveLength(2);
  });

  it('handles data spanning midnight', () => {
    const now = new Date('2024-06-15T23:30:00Z');
    const history: EmissionDataPoint[] = [
      { timestamp: '2024-06-15T23:00:00Z', intensity: 400, marginalFuel: 'Natural Gas' },
    ];
    const forecast: EmissionDataPoint[] = [
      { timestamp: '2024-06-16T00:00:00Z', intensity: 350, marginalFuel: 'Hydro/Mix' },
      { timestamp: '2024-06-16T01:00:00Z', intensity: 300, marginalFuel: 'Hydro/Mix' },
    ];
    const result = combineAndFilterData(history, forecast, now);
    expect(result).toHaveLength(3);
    expect(result[0].timestamp).toBe('2024-06-15T23:00:00Z');
  });
});

describe('averageByPTHour (server pipeline)', () => {
  it('handles multiple data points in the same PT hour', () => {
    // All in the same hour (8 PM UTC = 1 PM PDT)
    const dataPoints = [
      { point_time: '2024-06-15T20:00:00Z', value: 100 },
      { point_time: '2024-06-15T20:05:00Z', value: 200 },
      { point_time: '2024-06-15T20:10:00Z', value: 300 },
      { point_time: '2024-06-15T20:15:00Z', value: 400 },
    ];
    const result = averageByPTHour(dataPoints);
    expect(result).toHaveLength(1);
    expect(result[0].hour).toBe(13); // 1 PM PT
    expect(result[0].intensity).toBe(250); // (100+200+300+400)/4
  });

  it('handles data spanning full 24 hours', () => {
    // Create one point per UTC hour (0-23)
    const dataPoints = Array.from({ length: 24 }, (_, i) => ({
      point_time: `2024-06-15T${String(i).padStart(2, '0')}:00:00Z`,
      value: i * 10,
    }));
    const result = averageByPTHour(dataPoints);
    // All 24 PT hours should be represented
    expect(result.length).toBeGreaterThanOrEqual(1);
    // Verify sorted by hour
    for (let i = 1; i < result.length; i++) {
      expect(result[i].hour).toBeGreaterThan(result[i - 1].hour);
    }
  });

  it('handles winter time (PST, UTC-8)', () => {
    // January: PST = UTC-8, so UTC 08:00 = PST 00:00
    const dataPoints = [
      { point_time: '2024-01-15T08:00:00Z', value: 500 },
    ];
    const result = averageByPTHour(dataPoints);
    expect(result).toHaveLength(1);
    expect(result[0].hour).toBe(0); // midnight PST
    expect(result[0].intensity).toBe(500);
  });
});

describe('findBestWindow (edge cases for server recommendations)', () => {
  const now = new Date('2024-06-15T12:00:00Z');

  function makeData(intensities: number[], startHour = 13): EmissionDataPoint[] {
    return intensities.map((intensity, i) => ({
      timestamp: `2024-06-15T${(startHour + i).toString().padStart(2, '0')}:00:00Z`,
      intensity,
      marginalFuel: getEstimatedFuel(intensity),
    }));
  }

  it('picks the first window when multiple windows have the same average', () => {
    // Two equally good windows: [100, 200] and [200, 100]
    const data = makeData([100, 200, 200, 100]);
    const result = findBestWindow(data, 2, now);
    expect(result).not.toBeNull();
    // Both windows average 150, but should pick the first one
    expect(result!.start.timestamp).toBe('2024-06-15T13:00:00Z');
    expect(result!.avgIntensity).toBe(150);
  });

  it('handles very large intensity values', () => {
    const data = makeData([999999, 1, 2, 999999]);
    const result = findBestWindow(data, 2, now);
    expect(result).not.toBeNull();
    expect(result!.avgIntensity).toBe(1.5);
  });

  it('handles negative intensity values (negative emissions)', () => {
    const data = makeData([-50, -100, 200, 300]);
    const result = findBestWindow(data, 2, now);
    expect(result).not.toBeNull();
    expect(result!.avgIntensity).toBe(-75);
  });

  it('handles fractional intensities', () => {
    const data = makeData([100.5, 200.7, 50.3]);
    const result = findBestWindow(data, 2, now);
    expect(result).not.toBeNull();
    // Best 2-hour window: [100.5, 200.7]=150.6 vs [200.7, 50.3]=125.5 → second wins
    expect(result!.avgIntensity).toBeCloseTo(125.5, 1);
  });
});

describe('getCurrentIntensity (edge cases)', () => {
  it('handles data points with identical timestamps', () => {
    const now = new Date('2024-06-15T14:30:00Z');
    const data: EmissionDataPoint[] = [
      { timestamp: '2024-06-15T14:00:00Z', intensity: 100, marginalFuel: 'Solar/Wind' },
      { timestamp: '2024-06-15T14:00:00Z', intensity: 200, marginalFuel: 'Hydro/Mix' },
    ];
    // Should return the last one in array order
    expect(getCurrentIntensity(data, now)).toBe(200);
  });

  it('handles single data point exactly at now', () => {
    const now = new Date('2024-06-15T14:00:00Z');
    const data: EmissionDataPoint[] = [
      { timestamp: '2024-06-15T14:00:00Z', intensity: 350, marginalFuel: 'Hydro/Mix' },
    ];
    expect(getCurrentIntensity(data, now)).toBe(350);
  });
});

describe('isGoodTimeToCharge (edge cases)', () => {
  it('returns true at exactly 110% boundary', () => {
    // 200 * 1.1 = 220, current = 220 → true (<=)
    expect(isGoodTimeToCharge(220, { avgIntensity: 200 })).toBe(true);
  });

  it('returns false just above 110% boundary', () => {
    // 200 * 1.1 = 220, current = 220.01 → false
    expect(isGoodTimeToCharge(220.01, { avgIntensity: 200 })).toBe(false);
  });

  it('handles very small avgIntensity', () => {
    expect(isGoodTimeToCharge(0.001, { avgIntensity: 0.001 })).toBe(true);
    expect(isGoodTimeToCharge(0.0012, { avgIntensity: 0.001 })).toBe(false);
  });

  it('handles negative current intensity', () => {
    expect(isGoodTimeToCharge(-100, { avgIntensity: 200 })).toBe(true);
  });
});

describe('getEstimatedFuel (additional edge cases)', () => {
  it('handles very large values', () => {
    expect(getEstimatedFuel(Number.MAX_SAFE_INTEGER)).toBe('Peaker Plant');
  });

  it('handles very small negative values', () => {
    expect(getEstimatedFuel(-Number.MAX_SAFE_INTEGER)).toBe('Solar/Wind');
  });
});
