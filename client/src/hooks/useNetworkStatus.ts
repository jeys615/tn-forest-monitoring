import { useState, useEffect } from 'react';

export interface NetworkStatus {
  isOnline: boolean;
  lastChangedAt: Date;
}

/**
 * Tracks browser online and offline network status truthfully.
 * Does not simulate server connectivity; reflects browser-level network availability.
 */
export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>(() => ({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    lastChangedAt: new Date(),
  }));

  useEffect(() => {
    const handleOnline = () => {
      setStatus({
        isOnline: true,
        lastChangedAt: new Date(),
      });
    };

    const handleOffline = () => {
      setStatus({
        isOnline: false,
        lastChangedAt: new Date(),
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return status;
}
