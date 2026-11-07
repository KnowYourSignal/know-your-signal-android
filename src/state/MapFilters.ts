import type { Metric } from '../domain/Measurement';

export type Coordinate = { latitude: number; longitude: number };
export type Region = Coordinate & {
  latitudeDelta: number;
  longitudeDelta: number;
};
export type Bounds = {
  min_lon: number;
  min_lat: number;
  max_lon: number;
  max_lat: number;
};
export type Filters = { floor: number; metric: Metric };

export const START_REGION: Region = {
  latitude: -33.4568,
  longitude: -70.6548,
  latitudeDelta: 0.014,
  longitudeDelta: 0.018,
};

export function wrapLongitude(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

export function shiftRegion(
  region: Region,
  latitude: number,
  longitude: number,
): Region {
  return {
    ...region,
    latitude: Math.max(-85, Math.min(85, latitude)),
    longitude: wrapLongitude(longitude),
  };
}

export function zoomRegion(region: Region, factor: number): Region {
  return {
    ...region,
    latitudeDelta: Math.max(0.0002, Math.min(8, region.latitudeDelta * factor)),
    longitudeDelta: Math.max(
      0.0002,
      Math.min(8, region.longitudeDelta * factor),
    ),
  };
}

export function boundsFor(region: Region): Bounds[] {
  const { latitude, longitude, latitudeDelta, longitudeDelta } = region;
  if (
    ![latitude, longitude, latitudeDelta, longitudeDelta].every(
      Number.isFinite,
    ) ||
    latitudeDelta <= 0 ||
    longitudeDelta <= 0 ||
    latitudeDelta > 2 ||
    longitudeDelta > 2
  ) {
    return [];
  }
  const minLat = Math.max(-85, latitude - latitudeDelta / 2);
  const maxLat = Math.min(85, latitude + latitudeDelta / 2);
  if (minLat >= maxLat) {
    return [];
  }
  const center = wrapLongitude(longitude);
  const west = center - longitudeDelta / 2;
  const east = center + longitudeDelta / 2;
  const split =
    west < -180
      ? [
          [west + 360, 180],
          [-180, east],
        ]
      : east > 180
      ? [
          [west, 180],
          [-180, east - 360],
        ]
      : [[west, east]];

  return split
    .filter(([min, max]) => min < max)
    .map(([min_lon, max_lon]) => ({
      min_lon,
      min_lat: minLat,
      max_lon,
      max_lat: maxLat,
    }));
}

export function fitRegion(points: ReadonlyArray<Coordinate>): Region {
  if (!points.length) {
    return START_REGION;
  }
  const anchor = points[0].longitude;
  const latitudes = points.map(point => point.latitude);
  const longitudes = points.map(point =>
    wrapLongitude(point.longitude - anchor),
  );
  const south = Math.min(...latitudes);
  const north = Math.max(...latitudes);
  const west = Math.min(...longitudes);
  const east = Math.max(...longitudes);
  return {
    latitude: (south + north) / 2,
    longitude: wrapLongitude(anchor + (west + east) / 2),
    latitudeDelta: Math.max(0.00035, (north - south) * 1.27),
    longitudeDelta: Math.max(0.00035, (east - west) * 1.27),
  };
}

export function project(
  point: Coordinate,
  region: Region,
  width: number,
  height: number,
) {
  return {
    x:
      (0.5 +
        wrapLongitude(point.longitude - region.longitude) /
          region.longitudeDelta) *
      width,
    y:
      (0.5 - (point.latitude - region.latitude) / region.latitudeDelta) *
      height,
  };
}
