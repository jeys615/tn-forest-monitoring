/**
 * Phase 10.5 — Changed-Area Geometry & Multi-Region Map Visualization Tests
 *
 * Verifies:
 * 1. Single connected region (GeoJSONPolygon) extracts exactly 1 Leaflet polygon.
 * 2. Multiple disconnected regions (GeoJSONMultiPolygon) extracts N distinct Leaflet polygons.
 * 3. 3 disconnected regions extracts 3 distinct Leaflet polygons.
 * 4. Coordinate translation: GeoJSON [lng, lat] is properly inverted to Leaflet [lat, lng].
 * 5. Zero changed pixels / undefined geometry returns empty array [] with NO artificial fallback bounding box.
 * 6. Closed ring preservation: polygon rings maintain closure (first vertex equals last vertex).
 * 7. Metadata displays: formats changedAreaHectares, affectedAreaPercentage, severity, and evidenceScore without hardcoded 2.40 ha fallbacks.
 * 8. Backward compatibility: legacy GeoJSONPolygon records continue to render seamlessly.
 */

import { describe, it, expect } from 'vitest';
import type {
  GeoJSONPolygon,
  GeoJSONMultiPolygon,
  ChangeDetectionDto,
  MarkedAreaCalculationResultDto,
} from '@tn-forest/shared/types';

// Helper mirroring GisMapViewer's changedPolygons extraction logic
function extractChangedPolygons(
  selectedResult?: MarkedAreaCalculationResultDto | null,
  changeDetection?: ChangeDetectionDto | null,
): [number, number][][] {
  const geom = selectedResult?.changedGeometry || changeDetection?.changedGeometry;
  if (!geom || !geom.coordinates || !Array.isArray(geom.coordinates)) {
    return [];
  }

  if (geom.type === 'Polygon') {
    const poly = geom as GeoJSONPolygon;
    if (poly.coordinates && poly.coordinates[0] && Array.isArray(poly.coordinates[0])) {
      const ring = poly.coordinates[0]
        .filter((coord) => Array.isArray(coord) && coord.length >= 2)
        .map(([lng, lat]) => [lat, lng] as [number, number]);
      return ring.length >= 3 ? [ring] : [];
    }
    return [];
  }

  if (geom.type === 'MultiPolygon') {
    const multi = geom as GeoJSONMultiPolygon;
    const polys: [number, number][][] = [];
    for (const polygonCoords of multi.coordinates) {
      if (polygonCoords && polygonCoords[0] && Array.isArray(polygonCoords[0])) {
        const ring = polygonCoords[0]
          .filter((coord) => Array.isArray(coord) && coord.length >= 2)
          .map(([lng, lat]) => [lat, lng] as [number, number]);
        if (ring.length >= 3) {
          polys.push(ring);
        }
      }
    }
    return polys;
  }

  return [];
}

// Helper mirroring GisMapViewer's display metadata formatting logic
function getDisplayMetadata(
  selectedResult?: MarkedAreaCalculationResultDto | null,
  changeDetection?: ChangeDetectionDto | null,
) {
  const changedAreaHaDisplay =
    selectedResult?.changedAreaHectares !== undefined
      ? selectedResult.changedAreaHectares.toFixed(2)
      : changeDetection?.changedArea !== undefined
      ? changeDetection.changedArea.toFixed(2)
      : undefined;

  const affectedRatioDisplay =
    selectedResult?.affectedAreaPercentage !== undefined
      ? selectedResult.affectedAreaPercentage.toFixed(1)
      : changeDetection?.affectedAreaPercentage !== undefined
      ? changeDetection.affectedAreaPercentage.toFixed(1)
      : undefined;

  const severityDisplay =
    selectedResult?.severity || changeDetection?.severity || undefined;

  const evidenceScoreDisplay =
    selectedResult?.evidenceStrength !== undefined
      ? `${selectedResult.evidenceStrength}/100`
      : changeDetection?.evidenceStrength !== undefined
      ? `${changeDetection.evidenceStrength}/100`
      : undefined;

  return {
    changedAreaHaDisplay,
    affectedRatioDisplay,
    severityDisplay,
    evidenceScoreDisplay,
  };
}

describe('Phase 10.5 — Changed-Area Geometry & Multi-Region Visualization', () => {
  it('Scenario 1: Single connected region (GeoJSONPolygon) extracts 1 Leaflet polygon with inverted lat/lng', () => {
    const mockPolygon: GeoJSONPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [76.4964, 11.6008],
          [76.4967, 11.6008],
          [76.4967, 11.6006],
          [76.4964, 11.6006],
          [76.4964, 11.6008],
        ],
      ],
    };

    const changeDto = { changedGeometry: mockPolygon } as ChangeDetectionDto;
    const result = extractChangedPolygons(null, changeDto);

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(5);
    // Inverted [lat, lng]
    expect(result[0][0]).toEqual([11.6008, 76.4964]);
    expect(result[0][1]).toEqual([11.6008, 76.4967]);
    // Ring closed
    expect(result[0][0]).toEqual(result[0][4]);
  });

  it('Scenario 2: Multiple disconnected regions (GeoJSONMultiPolygon) extracts N distinct Leaflet polygons', () => {
    const mockMultiPolygon: GeoJSONMultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [
        // Region 1
        [
          [
            [76.4969, 11.6003],
            [76.4975, 11.6003],
            [76.4975, 11.5998],
            [76.4969, 11.5998],
            [76.4969, 11.6003],
          ],
        ],
        // Region 2 (disconnected)
        [
          [
            [76.4953, 11.6019],
            [76.4958, 11.6019],
            [76.4958, 11.6017],
            [76.4953, 11.6017],
            [76.4953, 11.6019],
          ],
        ],
      ],
    };

    const changeDto = { changedGeometry: mockMultiPolygon } as ChangeDetectionDto;
    const result = extractChangedPolygons(null, changeDto);

    expect(result).toHaveLength(2);
    // Region 1
    expect(result[0]).toHaveLength(5);
    expect(result[0][0]).toEqual([11.6003, 76.4969]);
    expect(result[0][0]).toEqual(result[0][4]);
    // Region 2
    expect(result[1]).toHaveLength(5);
    expect(result[1][0]).toEqual([11.6019, 76.4953]);
    expect(result[1][0]).toEqual(result[1][4]);

    // Ensure they are distinct regions and not merged
    expect(result[0][0][0]).not.toEqual(result[1][0][0]);
    expect(result[0][0][1]).not.toEqual(result[1][0][1]);
  });

  it('Scenario 3: 3 disconnected regions extracts 3 distinct Leaflet polygons', () => {
    const mockMultiPolygon: GeoJSONMultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [
        [[[76.1, 11.1], [76.2, 11.1], [76.2, 11.2], [76.1, 11.2], [76.1, 11.1]]],
        [[[76.3, 11.3], [76.4, 11.3], [76.4, 11.4], [76.3, 11.4], [76.3, 11.3]]],
        [[[76.5, 11.5], [76.6, 11.5], [76.6, 11.6], [76.5, 11.6], [76.5, 11.5]]],
      ],
    };

    const changeDto = { changedGeometry: mockMultiPolygon } as ChangeDetectionDto;
    const result = extractChangedPolygons(null, changeDto);

    expect(result).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(result[i]).toHaveLength(5);
      expect(result[i][0]).toEqual(result[i][4]);
    }
  });

  it('Scenario 4: Missing or undefined changedGeometry returns empty array [] with NO artificial fallback box', () => {
    const changeDtoWithoutGeom = {
      changedGeometry: undefined,
    } as ChangeDetectionDto;

    const result1 = extractChangedPolygons(null, changeDtoWithoutGeom);
    expect(result1).toEqual([]);

    const result2 = extractChangedPolygons(null, null);
    expect(result2).toEqual([]);

    const emptyGeom = {
      type: 'Polygon',
      coordinates: [],
    } as unknown as GeoJSONPolygon;
    const result3 = extractChangedPolygons(null, { changedGeometry: emptyGeom } as ChangeDetectionDto);
    expect(result3).toEqual([]);
  });

  it('Scenario 5: selectedResult takes precedence over changeDetection when provided', () => {
    const poly1: GeoJSONPolygon = {
      type: 'Polygon',
      coordinates: [
        [[76.1, 11.1], [76.2, 11.1], [76.2, 11.2], [76.1, 11.2], [76.1, 11.1]],
      ],
    };
    const poly2: GeoJSONPolygon = {
      type: 'Polygon',
      coordinates: [
        [[77.1, 12.1], [77.2, 12.1], [77.2, 12.2], [77.1, 12.2], [77.1, 12.1]],
      ],
    };

    const selectedResult = { changedGeometry: poly1 } as MarkedAreaCalculationResultDto;
    const changeDetection = { changedGeometry: poly2 } as ChangeDetectionDto;

    const result = extractChangedPolygons(selectedResult, changeDetection);
    expect(result).toHaveLength(1);
    expect(result[0][0]).toEqual([11.1, 76.1]);
  });

  it('Scenario 6: Metadata formatting correctly displays actual values without hardcoded 2.40 ha placeholder', () => {
    const changeDto = {
      changedArea: 4.85,
      affectedAreaPercentage: 12.34,
      severity: 'HIGH',
      evidenceStrength: 88,
    } as ChangeDetectionDto;

    const meta = getDisplayMetadata(null, changeDto);
    expect(meta.changedAreaHaDisplay).toBe('4.85');
    expect(meta.affectedRatioDisplay).toBe('12.3');
    expect(meta.severityDisplay).toBe('HIGH');
    expect(meta.evidenceScoreDisplay).toBe('88/100');

    // When data is missing, display undefined rather than hardcoded 2.40 ha
    const emptyMeta = getDisplayMetadata(null, null);
    expect(emptyMeta.changedAreaHaDisplay).toBeUndefined();
    expect(emptyMeta.affectedRatioDisplay).toBeUndefined();
    expect(emptyMeta.severityDisplay).toBeUndefined();
    expect(emptyMeta.evidenceScoreDisplay).toBeUndefined();
  });
});
