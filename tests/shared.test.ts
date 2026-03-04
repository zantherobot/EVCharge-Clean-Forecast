import { describe, it, expect } from 'vitest';
import {
  getEstimatedFuel,
  findBestWindow,
  getCurrentIntensity,
  isGoodTimeToCharge,
  processWattTimeData,
  combineAndFilterData,
  averageByPTHour,
  type EmissionDataPoint,
} from '../src/shared';

// ---------------------------------------------------------------------------
// getEstimatedFuel
// ---------------------------------------------------------------------------
describe('getEstimatedFuel', () => {
  it('returns "Solar/Wind" for intensity < 100', () => {
    expect(getEstimatedFuel(0)).toBe('Solar/Wind');
    expect(getEstimatedFuel(50)).toBe('Solar/Wind');
    expect(getEstimatedFuel(99)).toBe('Solar/Wind');
    expect(getEstimatedFuel(99.9)).toBe('Solar/Wind');
  });

  it('returns "Hydro/Mix" for intensity 100–399', () => {
    expect(getEstimatedFuel(100)).toBe('Hydro/Mix');
    expect(getEstimatedFuel(250)).toBe('Hydro/Mix');
    expect(getEstimatedFuel(399)).toBe('Hydro/Mix');
    expect(getEstimatedFuel(399.9)).toBe('Hydro/Mix');
  });

  it('returns "Natural Gas" for intensity 400–699', () => {
    expect(getEstimatedFuel(400)).toBe('Natural Gas');
    expect(getEstimatedFuel(550)).toBe('Natural Gas');
    expect(getEstimatedFuel(699)).toBe('Natural Gas');
    expect(getEstimatedFuel(699.9)).toBe('Natural Gas');
  });

  it('returns "Peaker Plant" for intensity >= 700', () => {
    expect(getEstimatedFuel(700)).toBe('Peaker Plant');
    expect(getEstimatedFuel(1000)).toBe('Peaker Plant');
    expect(getEstimatedFuel(9999)).toBe('Peaker Plant');
  });

  it('handles exact boundary values correctly', () => {
    expect(getEstimatedFuel(99.999)).toBe('Solar/Wind');
    expect(getEstimatedFuel(100)).toBe('Hydro/Mix');
    expect(getEstimatedFuel(399.999)).toBe('Hydro/Mix');
    expect(getEstimatedFuel(400)).toBe('Natural Gas');
    expect(getEstimatedFuel(699.999)).toBe('Natural Gas');
    expect(getEstimatedFuel(700)).toBe('Peaker Plant');
  });

  it('handles negative intensity', () => {
    expect(getEstimatedFuel(-10)).toBe('Solar/Wind');
  });

  it('handles zero intensity', () => {
    expect(getEstimatedFuel(0)).toBe('Solar/Wind');
  });
});

// ---------------------------------------------------------------------------
// findBestWindow
// ---------------------------------------------------------------------------
describe('findBestWindow', () => {
  const now = new Date('2024-06-15T12:00:00Z');

  function makeData(intensities: number[], startHour = 13): EmissionDataPoint[] {
    return intensities.map((intensity, i) => ({
      timestamp: `2024-06-15T${(startHour + i).toString().padStart(2, '0')}:00:00Z`,
      intensity,
      marginalFuel: getEstimatedFuel(intensity),
    }));
  }

  it('finds the lowest-average window', () => {
    // Hours 13-18 with intensities: 500, 300, 100, 200, 400, 600
    const data = makeData([500, 300, 100, 200, 400, 600]);
    const result = findBestWindow(data, 3, now);
    expect(result).not.toBeNull();
    // Best 3-hour window: [300, 100, 200] = avg 200
    // Start at index 1 → hour 14
    expect(result!.start.timestamp).toBe('2024-06-15T14:00:00Z');
    expect(result!.avgIntensity).toBeCloseTo(200, 1);
  });

  it('returns null when insufficient data points', () => {
    const data = makeData([100, 200]);
    expect(findBestWindow(data, 4, now)).toBeNull();
  });

  it('returns null for empty data', () => {
    expect(findBestWindow([], 2, now)).toBeNull();
  });

  it('excludes past data points', () => {
    // All data before "now" — should return null
    const pastData: EmissionDataPoint[] = [
      { timestamp: '2024-06-15T10:00:00Z', intensity: 100, marginalFuel: 'Solar/Wind' },
      { timestamp: '2024-06-15T11:00:00Z', intensity: 200, marginalFuel: 'Hydro/Mix' },
    ];
    expect(findBestWindow(pastData, 2, now)).toBeNull();
  });

  it('handles window size of 1', () => {
    const data = makeData([500, 100, 300]);
    const result = findBestWindow(data, 1, now);
    expect(result).not.toBeNull();
    expect(result!.start.intensity).toBe(100);
    expect(result!.avgIntensity).toBe(100);
  });

  it('handles all equal intensities', () => {
    const data = makeData([300, 300, 300, 300]);
    const result = findBestWindow(data, 2, now);
    expect(result).not.toBeNull();
    expect(result!.avgIntensity).toBe(300);
  });

  it('handles window size equal to data length', () => {
    const data = makeData([100, 200, 300]);
    const result = findBestWindow(data, 3, now);
    expect(result).not.toBeNull();
    expect(result!.avgIntensity).toBe(200);
    expect(result!.start.timestamp).toBe('2024-06-15T13:00:00Z');
  });
});

// ---------------------------------------------------------------------------
// getCurrentIntensity
// ---------------------------------------------------------------------------
describe('getCurrentIntensity', () => {
  const now = new Date('2024-06-15T14:30:00Z');

  it('returns the most recent past data point intensity', () => {
    const data: EmissionDataPoint[] = [
      { timestamp: '2024-06-15T13:00:00Z', intensity: 300, marginalFuel: 'Hydro/Mix' },
      { timestamp: '2024-06-15T14:00:00Z', intensity: 450, marginalFuel: 'Natural Gas' },
      { timestamp: '2024-06-15T15:00:00Z', intensity: 200, marginalFuel: 'Hydro/Mix' },
    ];
    expect(getCurrentIntensity(data, now)).toBe(450);
  });

  it('returns first data point if all are in the future', () => {
    const data: EmissionDataPoint[] = [
      { timestamp: '2024-06-15T15:00:00Z', intensity: 200, marginalFuel: 'Hydro/Mix' },
      { timestamp: '2024-06-15T16:00:00Z', intensity: 300, marginalFuel: 'Hydro/Mix' },
    ];
    expect(getCurrentIntensity(data, now)).toBe(200);
  });

  it('returns 0 for empty data', () => {
    expect(getCurrentIntensity([], now)).toBe(0);
  });

  it('includes data point exactly at now', () => {
    const data: EmissionDataPoint[] = [
      { timestamp: '2024-06-15T14:30:00Z', intensity: 500, marginalFuel: 'Natural Gas' },
    ];
    expect(getCurrentIntensity(data, now)).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// isGoodTimeToCharge
// ---------------------------------------------------------------------------
describe('isGoodTimeToCharge', () => {
  it('returns true when no best window (null)', () => {
    expect(isGoodTimeToCharge(500, null)).toBe(true);
  });

  it('returns true when current ≤ 110% of best window avg', () => {
    // bestAvg = 100, 110% = 110, current = 110 → true
    expect(isGoodTimeToCharge(110, { avgIntensity: 100 })).toBe(true);
    // bestAvg = 200, 110% = 220, current = 200 → true
    expect(isGoodTimeToCharge(200, { avgIntensity: 200 })).toBe(true);
    // bestAvg = 300, 110% = 330, current = 50 → true
    expect(isGoodTimeToCharge(50, { avgIntensity: 300 })).toBe(true);
  });

  it('returns false when current > 110% of best window avg', () => {
    // bestAvg = 100, 110% = 110, current = 111 → false
    expect(isGoodTimeToCharge(111, { avgIntensity: 100 })).toBe(false);
    // bestAvg = 200, 110% = 220, current = 500 → false
    expect(isGoodTimeToCharge(500, { avgIntensity: 200 })).toBe(false);
  });

  it('handles zero avg intensity', () => {
    // bestAvg = 0, 110% = 0, current = 0 → true
    expect(isGoodTimeToCharge(0, { avgIntensity: 0 })).toBe(true);
    // current = 1 > 0 → false
    expect(isGoodTimeToCharge(1, { avgIntensity: 0 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// processWattTimeData
// ---------------------------------------------------------------------------
describe('processWattTimeData', () => {
  it('maps WattTime API points to EmissionDataPoint format', () => {
    const raw = [
      { point_time: '2024-06-15T12:00:00Z', value: 50 },
      { point_time: '2024-06-15T13:00:00Z', value: 450 },
    ];
    const result = processWattTimeData(raw, 'history');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      timestamp: '2024-06-15T12:00:00Z',
      intensity: 50,
      marginalFuel: 'Solar/Wind',
      type: 'history',
    });
    expect(result[1]).toEqual({
      timestamp: '2024-06-15T13:00:00Z',
      intensity: 450,
      marginalFuel: 'Natural Gas',
      type: 'history',
    });
  });

  it('correctly sets type to forecast', () => {
    const raw = [{ point_time: '2024-06-15T12:00:00Z', value: 300 }];
    const result = processWattTimeData(raw, 'forecast');
    expect(result[0].type).toBe('forecast');
  });

  it('handles empty input', () => {
    expect(processWattTimeData([], 'history')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// combineAndFilterData
// ---------------------------------------------------------------------------
describe('combineAndFilterData', () => {
  const now = new Date('2024-06-15T14:30:00Z');

  it('sorts combined data by timestamp ascending', () => {
    const history: EmissionDataPoint[] = [
      { timestamp: '2024-06-15T16:00:00Z', intensity: 300, marginalFuel: 'Hydro/Mix' },
    ];
    const forecast: EmissionDataPoint[] = [
      { timestamp: '2024-06-15T14:00:00Z', intensity: 200, marginalFuel: 'Hydro/Mix' },
      { timestamp: '2024-06-15T15:00:00Z', intensity: 100, marginalFuel: 'Solar/Wind' },
    ];
    const result = combineAndFilterData(history, forecast, now);
    expect(result.map(d => d.timestamp)).toEqual([
      '2024-06-15T14:00:00Z',
      '2024-06-15T15:00:00Z',
      '2024-06-15T16:00:00Z',
    ]);
  });

  it('filters out data before current hour start', () => {
    const history: EmissionDataPoint[] = [
      { timestamp: '2024-06-15T13:00:00Z', intensity: 300, marginalFuel: 'Hydro/Mix' },
      { timestamp: '2024-06-15T13:30:00Z', intensity: 350, marginalFuel: 'Hydro/Mix' },
    ];
    const forecast: EmissionDataPoint[] = [
      { timestamp: '2024-06-15T14:00:00Z', intensity: 200, marginalFuel: 'Hydro/Mix' },
      { timestamp: '2024-06-15T15:00:00Z', intensity: 100, marginalFuel: 'Solar/Wind' },
    ];
    // currentHourStart = 14:00 (minutes zeroed from 14:30)
    const result = combineAndFilterData(history, forecast, now);
    expect(result).toHaveLength(2);
    expect(result[0].timestamp).toBe('2024-06-15T14:00:00Z');
  });

  it('handles empty inputs', () => {
    expect(combineAndFilterData([], [], now)).toEqual([]);
    expect(combineAndFilterData([], [], now)).toHaveLength(0);
  });

  it('handles all data before current hour', () => {
    const old: EmissionDataPoint[] = [
      { timestamp: '2024-06-15T10:00:00Z', intensity: 300, marginalFuel: 'Hydro/Mix' },
    ];
    expect(combineAndFilterData(old, [], now)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// averageByPTHour
// ---------------------------------------------------------------------------
describe('averageByPTHour', () => {
  it('groups and averages data by Pacific Time hour', () => {
    // 2024-06-15T20:00:00Z = 1:00 PM PT (PDT, UTC-7)
    // 2024-06-15T20:15:00Z = 1:15 PM PT
    const dataPoints = [
      { point_time: '2024-06-15T20:00:00Z', value: 100 },
      { point_time: '2024-06-15T20:15:00Z', value: 200 },
      { point_time: '2024-06-15T21:00:00Z', value: 300 },
    ];
    const result = averageByPTHour(dataPoints);

    // Hour 13 (1 PM PT): avg of 100 and 200 = 150
    // Hour 14 (2 PM PT): 300
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ hour: 13, intensity: 150 });
    expect(result[1]).toEqual({ hour: 14, intensity: 300 });
  });

  it('returns empty array for empty input', () => {
    expect(averageByPTHour([])).toEqual([]);
  });

  it('returns sorted hours', () => {
    const dataPoints = [
      { point_time: '2024-06-15T23:00:00Z', value: 400 }, // 4 PM PT
      { point_time: '2024-06-15T19:00:00Z', value: 200 }, // 12 PM PT
      { point_time: '2024-06-15T21:00:00Z', value: 300 }, // 2 PM PT
    ];
    const result = averageByPTHour(dataPoints);
    const hours = result.map(r => r.hour);
    expect(hours).toEqual([...hours].sort((a, b) => a - b));
  });

  it('handles single data point', () => {
    const dataPoints = [
      { point_time: '2024-06-15T20:00:00Z', value: 500 },
    ];
    const result = averageByPTHour(dataPoints);
    expect(result).toHaveLength(1);
    expect(result[0].intensity).toBe(500);
  });
});
