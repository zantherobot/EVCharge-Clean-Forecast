/**
 * Maps a MOER intensity value (lbs CO₂/MWh) to a human-readable marginal fuel label.
 */
export function getEstimatedFuel(intensity: number): string {
  if (intensity < 100) return "Solar/Wind";
  if (intensity < 400) return "Hydro/Mix";
  if (intensity < 700) return "Natural Gas";
  return "Peaker Plant";
}

export interface EmissionDataPoint {
  timestamp: string;
  intensity: number;
  marginalFuel: string;
  type?: string;
}

/**
 * Finds the optimal (lowest average intensity) contiguous charging window
 * of `durationHours` data points from future data only.
 * Returns null if insufficient data.
 */
export function findBestWindow(
  data: EmissionDataPoint[],
  durationHours: number,
  now: Date = new Date()
): { start: EmissionDataPoint; avgIntensity: number } | null {
  const futureData = data.filter(d => new Date(d.timestamp) >= now);
  if (futureData.length < durationHours) return null;

  let minAvg = Infinity;
  let bestIdx = 0;

  for (let i = 0; i <= futureData.length - durationHours; i++) {
    const window = futureData.slice(i, i + durationHours);
    const avg = window.reduce((acc, curr) => acc + curr.intensity, 0) / durationHours;
    if (avg < minAvg) {
      minAvg = avg;
      bestIdx = i;
    }
  }

  return {
    start: futureData[bestIdx],
    avgIntensity: minAvg,
  };
}

/**
 * Gets the current intensity — the most recent data point at or before `now`.
 * Falls back to the first data point if all are in the future.
 */
export function getCurrentIntensity(data: EmissionDataPoint[], now: Date = new Date()): number {
  const pastData = data.filter(d => new Date(d.timestamp) <= now);
  if (pastData.length > 0) return pastData[pastData.length - 1].intensity;
  return data.length > 0 ? data[0].intensity : 0;
}

/**
 * Determines if now is a good time to charge:
 * current intensity ≤ 110% of optimal window's average.
 */
export function isGoodTimeToCharge(
  currentIntensity: number,
  bestWindow: { avgIntensity: number } | null
): boolean {
  if (!bestWindow) return true;
  return currentIntensity <= bestWindow.avgIntensity * 1.1;
}

/**
 * Processes raw WattTime data points into the app's EmissionDataPoint format.
 */
export function processWattTimeData(
  points: Array<{ point_time: string; value: number }>,
  type: 'history' | 'forecast'
): EmissionDataPoint[] {
  return points.map(point => ({
    timestamp: point.point_time,
    intensity: point.value,
    marginalFuel: getEstimatedFuel(point.value),
    type,
  }));
}

/**
 * Combines history and forecast data, sorted by timestamp ascending,
 * filtered to only include data from the start of the given hour onward.
 */
export function combineAndFilterData(
  historyData: EmissionDataPoint[],
  forecastData: EmissionDataPoint[],
  now: Date = new Date()
): EmissionDataPoint[] {
  const combined = [...historyData, ...forecastData].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const currentHourStart = new Date(now);
  currentHourStart.setMinutes(0, 0, 0);

  return combined.filter(d => new Date(d.timestamp) >= currentHourStart);
}

/**
 * Groups hourly data points by Pacific Time hour and averages their intensities.
 */
export function averageByPTHour(
  dataPoints: Array<{ point_time: string; value: number }>
): Array<{ hour: number; intensity: number }> {
  const hourlyData: { [key: number]: number[] } = {};

  dataPoints.forEach(point => {
    const date = new Date(point.point_time);
    const ptHour = parseInt(
      new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hour12: false,
        hourCycle: 'h23',
        timeZone: 'America/Los_Angeles',
      }).format(date)
    );

    if (!hourlyData[ptHour]) hourlyData[ptHour] = [];
    hourlyData[ptHour].push(point.value);
  });

  return Object.keys(hourlyData)
    .map(h => ({
      hour: parseInt(h),
      intensity:
        hourlyData[parseInt(h)].reduce((a, b) => a + b, 0) /
        hourlyData[parseInt(h)].length,
    }))
    .sort((a, b) => a.hour - b.hour);
}
