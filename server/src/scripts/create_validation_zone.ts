import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { User } from '../models/User.js';
import { ZoneCategory, ZoneStatus } from '@tn-forest/shared/types';
import { calculateCentroid } from '../utils/geo.js';

const lat = 10.2590;
const lng = 77.5680;
const R = 6378137.0; // WGS84 equatorial radius
const halfSideMeters = 1000.0; // 1km in each direction -> 2km x 2km square

const dLatRad = halfSideMeters / R;
const dLatDeg = dLatRad * (180 / Math.PI);

const latRad = lat * (Math.PI / 180);
const dLngRad = halfSideMeters / (R * Math.cos(latRad));
const dLngDeg = dLngRad * (180 / Math.PI);

const minLat = Number((lat - dLatDeg).toFixed(6));
const maxLat = Number((lat + dLatDeg).toFixed(6));
const minLng = Number((lng - dLngDeg).toFixed(6));
const maxLng = Number((lng + dLngDeg).toFixed(6));

// GeoJSON Polygon coordinates [lng, lat]
const coordinates: [number, number][][] = [
  [
    [minLng, minLat],
    [maxLng, minLat],
    [maxLng, maxLat],
    [minLng, maxLat],
    [minLng, minLat], // closed ring
  ],
];

function haversine(c1: [number, number], c2: [number, number]): number {
  const dLat = ((c2[1] - c1[1]) * Math.PI) / 180;
  const dLng = ((c2[0] - c1[0]) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((c1[1] * Math.PI) / 180) *
      Math.cos((c2[1] * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function sphericalPolygonArea(coords: [number, number][]): number {
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p1RadLng = (p1[0] * Math.PI) / 180;
    const p1RadLat = (p1[1] * Math.PI) / 180;
    const p2RadLng = (p2[0] * Math.PI) / 180;
    const p2RadLat = (p2[1] * Math.PI) / 180;
    total += (p2RadLng - p1RadLng) * (2 + Math.sin(p1RadLat) + Math.sin(p2RadLat));
  }
  return Math.abs((total * (R * R)) / 2);
}

async function createValidationZone() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(env.MONGODB_URI);
  console.log('Connected to DB:', mongoose.connection.name);

  const admin = (await User.findOne({ role: 'SUPER_ADMIN' })) || (await User.findOne());
  if (!admin) {
    throw new Error('No user found in database to set createdBy');
  }

  const existingZone = await Zone.findOne({ name: 'VALIDATION-SIRUMALAI-S2' });
  if (existingZone) {
    console.log('\n[INFO] Zone VALIDATION-SIRUMALAI-S2 already exists in database:');
    console.log(`- ID: ${existingZone._id}`);
    console.log(`- Zone ID: ${existingZone.zoneId}`);
    console.log(`- Centroid: ${JSON.stringify(existingZone.centerPoint.coordinates)}`);
    console.log(`- Area: ${existingZone.areaHectares} ha`);
    console.log(`- Boundary vertices:\n${JSON.stringify(existingZone.boundary.coordinates, null, 2)}`);
    await mongoose.connection.close();
    return;
  }

  const now = new Date();
  const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '');
  const randStr = Math.floor(1000 + Math.random() * 9000);
  const zoneId = `ZONE-${dateStr}-${randStr}`;

  const ring = coordinates[0];
  const areaM2 = sphericalPolygonArea(ring);
  const areaHectares = Number((areaM2 / 10000).toFixed(2));

  const centroid = calculateCentroid(coordinates);

  const zoneDoc = new Zone({
    zoneId,
    name: 'VALIDATION-SIRUMALAI-S2',
    category: ZoneCategory.RESERVED_AREA,
    status: ZoneStatus.PROTECTED,
    areaHectares,
    boundary: {
      type: 'Polygon',
      coordinates,
    },
    centerPoint: {
      type: 'Point',
      coordinates: centroid,
    },
    monitoringTracks: {
      optical: { enabled: true },
      sar: { enabled: true },
    },
    createdBy: admin._id,
  });

  const savedZone = await zoneDoc.save();

  console.log('\n================================================================');
  console.log('✅ VALIDATION ZONE CREATED SUCCESSFULLY');
  console.log('================================================================');
  console.log(`Zone Name:        ${savedZone.name}`);
  console.log(`Database _id:     ${savedZone._id}`);
  console.log(`Zone ID:          ${savedZone.zoneId}`);
  console.log(`Category:         ${savedZone.category}`);
  console.log(`Status:           ${savedZone.status}`);
  console.log(`Area:             ${savedZone.areaHectares} ha (${(areaM2 / 1e6).toFixed(4)} km²)`);
  console.log(`Centroid [Lng,Lat]: [${savedZone.centerPoint.coordinates[0]}, ${savedZone.centerPoint.coordinates[1]}]`);
  console.log(`Centroid (Lat,Lng): ${savedZone.centerPoint.coordinates[1]}° N, ${savedZone.centerPoint.coordinates[0]}° E`);
  console.log(`\nDimensions Check:`);
  console.log(`- South Edge:     ${haversine(ring[0], ring[1]).toFixed(2)} m`);
  console.log(`- East Edge:      ${haversine(ring[1], ring[2]).toFixed(2)} m`);
  console.log(`- North Edge:     ${haversine(ring[2], ring[3]).toFixed(2)} m`);
  console.log(`- West Edge:      ${haversine(ring[3], ring[0]).toFixed(2)} m`);
  console.log(`\nExact Polygon Coordinates (GeoJSON format):`);
  console.log(JSON.stringify(savedZone.boundary, null, 2));

  console.log(`\nGoogle Earth Engine Python/JS Snippet:`);
  console.log(`var roi = ee.Geometry.Polygon([`);
  console.log(`  [${minLng}, ${minLat}],`);
  console.log(`  [${maxLng}, ${minLat}],`);
  console.log(`  [${maxLng}, ${maxLat}],`);
  console.log(`  [${minLng}, ${maxLat}],`);
  console.log(`  [${minLng}, ${minLat}]`);
  console.log(`]);`);
  console.log(`Map.centerObject(roi, 14);`);
  console.log(`Map.addLayer(roi, {color: 'red'}, 'VALIDATION-SIRUMALAI-S2');`);

  await mongoose.connection.close();
}

createValidationZone().catch((err) => {
  console.error('Failed to create validation zone:', err);
  process.exit(1);
});
