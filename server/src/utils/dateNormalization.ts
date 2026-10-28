/**
 * Centralized Date Normalization Utility for Satellite Catalog & Baselines
 *
 * Guarantees that:
 * 1. Date-only input strings (YYYY-MM-DD) are normalized to start-of-day (00:00:00.000Z)
 *    and end-of-day (23:59:59.999Z) in UTC.
 * 2. Single-day queries or identical start/end dates are expanded to cover the full 24-hour day,
 *    preventing zero-duration GEE date intervals.
 * 3. Provides both inclusive and exclusive upper bounds for Earth Engine REST API calls.
 */

export interface NormalizedDateRange {
  startDate: Date;
  endDate: Date;
  exclusiveEndDate: Date;
  startDateIso: string;
  endDateIso: string;
  exclusiveEndDateIso: string;
}

export function normalizeDateRange(
  inputStart: string | Date,
  inputEnd: string | Date,
): NormalizedDateRange {
  let start: Date;
  let end: Date;

  // 1. Parse start date
  if (typeof inputStart === 'string') {
    const trimmed = inputStart.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      start = new Date(`${trimmed}T00:00:00.000Z`);
    } else {
      start = new Date(trimmed);
    }
  } else {
    start = new Date(inputStart);
  }

  // 2. Parse end date
  if (typeof inputEnd === 'string') {
    const trimmed = inputEnd.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      end = new Date(`${trimmed}T23:59:59.999Z`);
    } else {
      end = new Date(trimmed);
    }
  } else {
    end = new Date(inputEnd);
  }

  if (isNaN(start.getTime())) {
    throw new Error(`Invalid start date: ${String(inputStart)}`);
  }
  if (isNaN(end.getTime())) {
    throw new Error(`Invalid end date: ${String(inputEnd)}`);
  }

  // If start is after end, throw or normalize
  if (start.getTime() > end.getTime()) {
    throw new Error(
      `Start date (${start.toISOString()}) cannot be after end date (${end.toISOString()})`,
    );
  }

  // If start and end point to the exact same instant (e.g. from single-date candidate acquisition)
  if (start.getTime() === end.getTime()) {
    // Expand to full UTC day
    const dayStr = start.toISOString().slice(0, 10);
    start = new Date(`${dayStr}T00:00:00.000Z`);
    end = new Date(`${dayStr}T23:59:59.999Z`);
  } else if (
    // If end date has midnight time (00:00:00.000Z), assume it was a date-only boundary that needs end-of-day coverage
    end.getUTCHours() === 0 &&
    end.getUTCMinutes() === 0 &&
    end.getUTCSeconds() === 0 &&
    end.getUTCMilliseconds() === 0 &&
    end.getTime() > start.getTime()
  ) {
    end.setUTCHours(23, 59, 59, 999);
  }

  // Exclusive end date for GEE filterDate(start, exclusiveEndDate)
  const exclusiveEndDate = new Date(end.getTime() + 1);

  return {
    startDate: start,
    endDate: end,
    exclusiveEndDate,
    startDateIso: start.toISOString(),
    endDateIso: end.toISOString(),
    exclusiveEndDateIso: exclusiveEndDate.toISOString(),
  };
}
