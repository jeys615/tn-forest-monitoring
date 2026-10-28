import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from server directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  JWT_EXPIRES_IN: z.string().default('24h'),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  GEE_PROJECT_ID: z.string().default('monitoring-system-506515'),
  GEE_MODE: z.enum(['REAL', 'SIMULATED']).default('REAL'),
  PROCESSING_MODE: z.enum(['REAL', 'SIMULATED']).default('REAL'),
  GEE_SERVICE_ACCOUNT_EMAIL: z.string().optional(),
  GEE_PRIVATE_KEY: z.string().optional(),
  GEE_DRIVE_FOLDER_ID: z.string().default('MonitoringExports'),
  GEE_CLIENT_ID: z.string().optional(),
  GEE_CLIENT_SECRET: z.string().optional(),
  GEE_REFRESH_TOKEN: z.string().optional(),
  GEE_ACCESS_TOKEN: z.string().optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  GEE_MAX_PIXELS: z.coerce.number().default(1e9),
  GEE_EXPORT_SCALE: z.coerce.number().default(10),
  GEE_EXPORT_TIMEOUT_MS: z.coerce.number().default(600000),
  GEE_POLL_INTERVAL_MS: z.coerce.number().default(10000),
  MONITORING_INTERVAL_MS: z.coerce.number().default(3600000),
  OPTICAL_CLOUD_THRESHOLD: z.coerce.number().default(20),
  CHANGE_THRESHOLD_PERCENT: z.coerce.number().default(2.0),
  MONITORING_JOB_STALE_THRESHOLD_MINUTES: z.coerce.number().default(15),
  CANOPY_GUARD_MODE: z.enum(['OFF', 'SHADOW', 'ACTIVE']).default('SHADOW'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export { envSchema };
