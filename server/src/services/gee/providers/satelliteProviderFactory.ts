import { getGeeConfig } from '../../../config/gee.js';
import type { ISatelliteProvider } from './ISatelliteProvider.js';
import { GeeSatelliteProvider } from './GeeSatelliteProvider.js';
import { SimulatedSatelliteProvider } from './SimulatedSatelliteProvider.js';

/**
 * Resolves the appropriate satellite provider based on runtime configuration.
 *
 * In REAL mode with valid credentials: Uses GeeSatelliteProvider to query live Google Earth Engine collections.
 * In SIMULATED mode or unauthenticated fallback (e.g. cloud deployments without GCP keys): Uses SimulatedSatelliteProvider.
 */
export function resolveSatelliteProvider(explicitProvider?: ISatelliteProvider): ISatelliteProvider {
  if (explicitProvider) {
    return explicitProvider;
  }

  const config = getGeeConfig();
  if (config.mode === 'SIMULATED' || (!config.hasCredentials && config.authMethod === 'UNAUTHENTICATED')) {
    console.info(
      `[SatelliteProvider] Selected SimulatedSatelliteProvider (Mode: ${config.mode}, AuthMethod: ${config.authMethod})`,
    );
    return new SimulatedSatelliteProvider();
  }

  console.info(
    `[SatelliteProvider] Selected GeeSatelliteProvider (Mode: ${config.mode}, AuthMethod: ${config.authMethod})`,
  );
  return new GeeSatelliteProvider();
}
