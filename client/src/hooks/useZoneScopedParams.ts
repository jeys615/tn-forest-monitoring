import { useSearchParams } from 'react-router-dom';
import { useMemo, useCallback } from 'react';
import type { ZoneDto } from '@tn-forest/shared/types';

export type DatePreset = 'all' | 'today' | '7d' | '30d' | 'custom';

export interface ZoneScopedParamsHook {
  zoneId: string;
  selectedZoneId: string;
  selectedZone: ZoneDto | undefined;
  isZoneInvalid: boolean;
  startDate: string;
  endDate: string;
  datePreset: DatePreset;
  setZoneId: (zoneId: string) => void;
  setDatePreset: (preset: DatePreset) => void;
  setDateRange: (startDate: string, endDate: string) => void;
  clearZone: () => void;
  clearDateFilter: () => void;
  clearAll: () => void;
}

export function useZoneScopedParams(zones: ZoneDto[] = [], zonesLoaded: boolean = true): ZoneScopedParamsHook {
  const [searchParams, setSearchParams] = useSearchParams();

  const zoneId = searchParams.get('zoneId') || '';
  const startDate = searchParams.get('startDate') || '';
  const endDate = searchParams.get('endDate') || '';
  const rawPreset = searchParams.get('preset');
  
  const datePreset: DatePreset = useMemo(() => {
    if (rawPreset && ['all', 'today', '7d', '30d', 'custom'].includes(rawPreset)) {
      return rawPreset as DatePreset;
    }
    if (startDate || endDate) return 'custom';
    return 'all';
  }, [rawPreset, startDate, endDate]);

  const selectedZone = useMemo(() => {
    if (!zoneId) return undefined;
    return zones.find((z) => z.id === zoneId || z.zoneId === zoneId);
  }, [zoneId, zones]);

  const isZoneInvalid = useMemo(() => {
    if (!zoneId || !zonesLoaded || zones.length === 0) return false;
    return !selectedZone;
  }, [zoneId, zonesLoaded, zones, selectedZone]);

  const setZoneId = useCallback(
    (newZoneId: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (newZoneId) {
            next.set('zoneId', newZoneId);
          } else {
            next.delete('zoneId');
          }
          return next;
        },
        { replace: false },
      );
    },
    [setSearchParams],
  );

  const setDatePreset = useCallback(
    (preset: DatePreset) => {
      const now = new Date();
      const formatDate = (d: Date) => d.toISOString().split('T')[0];
      const todayStr = formatDate(now);

      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (preset === 'all') {
            next.delete('preset');
            next.delete('startDate');
            next.delete('endDate');
          } else if (preset === 'today') {
            next.set('preset', 'today');
            next.set('startDate', todayStr);
            next.set('endDate', todayStr);
          } else if (preset === '7d') {
            const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            next.set('preset', '7d');
            next.set('startDate', formatDate(past7));
            next.set('endDate', todayStr);
          } else if (preset === '30d') {
            const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            next.set('preset', '30d');
            next.set('startDate', formatDate(past30));
            next.set('endDate', todayStr);
          } else if (preset === 'custom') {
            next.set('preset', 'custom');
          }
          return next;
        },
        { replace: false },
      );
    },
    [setSearchParams],
  );

  const setDateRange = useCallback(
    (start: string, end: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('preset', 'custom');
          if (start) next.set('startDate', start);
          else next.delete('startDate');
          if (end) next.set('endDate', end);
          else next.delete('endDate');
          return next;
        },
        { replace: false },
      );
    },
    [setSearchParams],
  );

  const clearZone = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('zoneId');
        return next;
      },
      { replace: false },
    );
  }, [setSearchParams]);

  const clearDateFilter = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('preset');
        next.delete('startDate');
        next.delete('endDate');
        return next;
      },
      { replace: false },
    );
  }, [setSearchParams]);

  const clearAll = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('zoneId');
        next.delete('preset');
        next.delete('startDate');
        next.delete('endDate');
        return next;
      },
      { replace: false },
    );
  }, [setSearchParams]);

  return {
    zoneId,
    selectedZoneId: zoneId,
    selectedZone,
    isZoneInvalid,
    startDate,
    endDate,
    datePreset,
    setZoneId,
    setDatePreset,
    setDateRange,
    clearZone,
    clearDateFilter,
    clearAll,
  };
}
