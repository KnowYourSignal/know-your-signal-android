/* Robot QA: real production domain functions, controlled data, no app writes. */
import fs from 'fs';
import path from 'path';
import { canCapture, parseFloor } from '@sut/domain/CapturePolicy';
import {
  signalQuality,
  signalWeight,
  clampToTether,
} from '@sut/domain/Measurement';
import { createEvidenceSnapshot } from '@sut/domain/Evidence';
import {
  boundsFor,
  isVisible,
  fitRegion,
  wrapLongitude,
  project,
} from '@sut/state/MapFilters';
import { guideCardLayout, localGuideRect } from '@sut/domain/GuideLayout';
const catalog = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../cases/catalog.json'), 'utf8'),
);
const repeat = Number(process.env.KYS_QA_REPETITIONS || 3);
const sutRoot = path.resolve(
  process.env.KYS_QA_SUT_ROOT || path.join(__dirname, '../..'),
);
const seed = catalog.seed;
const base = {
  latitude: -33.4568,
  longitude: -70.6548,
  accuracyM: 7,
  powerDbm: -68,
  metric: 'wifi_rssi',
  technology: 'wifi',
  connection: 'wifi_privada',
  validForMs: 4000,
  problem: null,
};
const region = {
  latitude: -33.4568,
  longitude: -70.6548,
  latitudeDelta: 0.014,
  longitudeDelta: 0.018,
};
const layout = {
  width: 360,
  height: 250,
};
const point = {
  ...base,
  id: 'synthetic-1',
  floor: 0,
  zoneSize: 'mediano',
  capturedAt: '2026-11-17T00:00:00Z',
  syncState: 'LOCAL_ONLY',
};
function source(relative) {
  const file = fs.realpathSync(path.resolve(sutRoot, relative));
  if (!file.startsWith(fs.realpathSync(sutRoot) + path.sep))
    throw new Error('Unsafe source path');
  return fs.readFileSync(file, 'utf8');
}
function evaluate(item) {
  const input = item.input;
  switch (item.operation) {
    case 'capture':
      expect(
        canCapture(
          input === null
            ? null
            : {
                ...base,
                ...input,
              },
        ),
      ).toBe(item.expected);
      return;
    case 'floor':
      // Floor -0 and 0 denote the same storey; IEEE signed-zero identity is
      // not a product requirement and must not produce a false defect.
      expect(parseFloor(input) === item.expected).toBe(true);
      return;
    case 'quality':
      expect(signalQuality(input.dbm, input.metric)).toBe(item.expected);
      return;
    case 'weight':
      expect(signalWeight(input.dbm, input.metric)).toBeCloseTo(
        item.expected,
        8,
      );
      return;
    case 'tether': {
      if (typeof clampToTether !== 'function') {
        throw new Error(
          '[QA_UNSUPPORTED_CAPABILITY] This SUT revision has no clampToTether export. This is not a verified product regression.',
        );
      }
      const a = input.anchor || {
        latitude: -33.45,
        longitude: -70.65,
      };
      const target = input.target || {
        latitude: a.latitude + input.north / 111132.92,
        longitude:
          a.longitude +
          input.east / (111412.84 * Math.cos((a.latitude * Math.PI) / 180)),
      };
      const result = clampToTether(a, target, input.radius);
      expect(
        Number.isFinite(result.latitude) && Number.isFinite(result.longitude),
      ).toBe(true);
      expect(result.distanceM).toBeLessThanOrEqual(
        Math.max(4, input.radius) + 0.11,
      );
      if (input.expectedDistance != null)
        expect(result.distanceM).toBeCloseTo(input.expectedDistance, 0);
      if (input.identity)
        expect(result.latitude).toBeCloseTo(target.latitude, 9);
      if (input.idempotent) {
        const again = clampToTether(a, result, input.radius);
        expect(again.latitude).toBeCloseTo(result.latitude, 9);
        expect(again.longitude).toBeCloseTo(result.longitude, 9);
      }
      return;
    }
    case 'evidence': {
      if (input.empty) {
        expect(createEvidenceSnapshot([], region, layout)).toBeNull();
        return;
      }
      if (input.invalidLayout) {
        expect(
          createEvidenceSnapshot([point], region, input.invalidLayout),
        ).toBeNull();
        return;
      }
      const points = (input.powers || [-80, -60, -40]).map((powerDbm, i) => ({
        ...point,
        id: `synthetic-${i}`,
        powerDbm,
      }));
      if (input.outside)
        points.push({
          ...point,
          id: 'outside',
          latitude: 0,
          longitude: 0,
          powerDbm: -1,
        });
      const snapshot = createEvidenceSnapshot(points, region, layout);
      expect(snapshot).not.toBeNull();
      expect(snapshot.medianDbm).toBe(item.expected);
      expect(snapshot.measurements).toHaveLength(
        (input.powers || [-80, -60, -40]).length,
      );
      if (input.immutable) {
        points[0].powerDbm = -1;
        expect(snapshot.measurements[0].powerDbm).not.toBe(-1);
      }
      if (input.permutation)
        expect(
          createEvidenceSnapshot([...points].reverse(), region, layout)
            .medianDbm,
        ).toBe(snapshot.medianDbm);
      return;
    }
    case 'map': {
      if (input.kind === 'bounds')
        expect(
          boundsFor({
            ...region,
            ...input.region,
          }),
        ).toHaveLength(item.expected);
      if (input.kind === 'visible')
        expect(
          isVisible(
            {
              ...region,
              ...input.region,
            },
            input.point,
          ),
        ).toBe(item.expected);
      if (input.kind === 'wrap')
        expect(wrapLongitude(input.longitude)).toBe(item.expected);
      if (input.kind === 'fit') {
        const fitted = fitRegion(input.points);
        input.points.forEach(p => expect(isVisible(fitted, p)).toBe(true));
      }
      if (input.kind === 'center')
        expect(project(region, region, layout.width, layout.height)).toEqual({
          x: 180,
          y: 125,
        });
      return;
    }
    case 'guide': {
      const viewport = {
        x: 0,
        y: 0,
        width: input.width,
        height: input.height,
        top: 24,
        bottom: 24,
      };
      const target = {
        x: 20,
        y: input.targetY,
        width: 100,
        height: 40,
      };
      const balloon = guideCardLayout(target, viewport, input.cardHeight);
      expect(balloon.x).toBeGreaterThanOrEqual(16);
      expect(balloon.x + balloon.width).toBeLessThanOrEqual(input.width - 16);
      expect(balloon.y).toBeGreaterThanOrEqual(36);
      expect(
        balloon.y + Math.min(input.cardHeight, balloon.maxHeight),
      ).toBeLessThanOrEqual(input.height - 36);
      return;
    }
    case 'source': {
      const text = source(input.path);
      if (input.absent) {
        const match = new RegExp(input.absent, 'mi').exec(text);
        if (match) {
          const line = text.slice(0, match.index).split('\n').length;
          throw new Error(
            `Static invariant failed: ${input.path}:${line}: ${match[0]}`,
          );
        }
      }
      if (input.present && !new RegExp(input.present, 'mi').test(text)) {
        throw new Error(
          `Required source pattern absent in ${input.path}: ${input.present}`,
        );
      }
      return;
    }
    case 'metamorphic': {
      let state = seed;
      const random = () => {
        // Unsigned LCG; the seed and sample count are recorded in the catalogue.
        // eslint-disable-next-line no-bitwise
        state = (Math.imul(1664525, state) + 1013904223) >>> 0;
        return state / 4294967296;
      };
      for (let i = 0; i < 120; i++) {
        if (input.kind === 'quality-monotonic') {
          const metric = input.metric;
          const lower = -120 + Math.floor(random() * 100);
          const upper = lower + Math.floor(random() * 20);
          expect(signalWeight(upper, metric)).toBeGreaterThanOrEqual(
            signalWeight(lower, metric),
          );
        } else if (input.kind === 'capture-accuracy') {
          const accuracyM = 10 + random() * 1000;
          expect(
            canCapture({
              ...base,
              accuracyM,
            }),
          ).toBe(false);
        } else if (input.kind === 'longitude') {
          const longitude = -180 + random() * 360;
          expect(wrapLongitude(longitude + 360)).toBeCloseTo(
            wrapLongitude(longitude),
            8,
          );
        } else if (input.kind === 'local-coordinates') {
          const x = 10 + random() * 40;
          const y = 10 + random() * 40;
          expect(
            localGuideRect(
              {
                x: 50 + x,
                y: 80 + y,
                width: 70,
                height: 40,
              },
              {
                x,
                y,
                width: 360,
                height: 640,
              },
            ),
          ).toEqual(
            localGuideRect(
              {
                x: 50,
                y: 80,
                width: 70,
                height: 40,
              },
              {
                x: 0,
                y: 0,
                width: 360,
                height: 640,
              },
            ),
          );
        }
      }
      return;
    }
    default:
      throw new Error(`Unknown operation: ${item.operation}`);
  }
}
describe('Robot QA - contratos reales y datos sintéticos', () => {
  for (const item of catalog.cases.filter(x => x.adapter === 'jest-contract')) {
    for (let iteration = 1; iteration <= repeat; iteration++) {
      test(`[${item.case_id}] repetición ${iteration}: ${item.title}`, () =>
        evaluate(item));
    }
  }
});
