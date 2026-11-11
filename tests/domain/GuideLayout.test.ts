import {
  guideCardLayout,
  guideScrollOffset,
  localGuideRect,
} from '../../src/domain/GuideLayout';

const viewport = { x: 0, y: 0, width: 360, height: 800, top: 24, bottom: 24 };

test('anchor measurements respect the root window offset and reject offscreen targets', () => {
  const root = { x: 12, y: 24, width: 360, height: 740 };
  expect(
    localGuideRect({ x: 40, y: 100, width: 120, height: 48 }, root),
  ).toEqual({ x: 22, y: 70, width: 132, height: 60 });
  expect(
    localGuideRect({ x: 0, y: -300, width: 100, height: 20 }, root),
  ).toBeNull();
  expect(
    localGuideRect({ x: NaN, y: 100, width: 100, height: 20 }, root),
  ).toBeNull();
  expect(
    localGuideRect({ x: 40, y: 100, width: 0, height: 20 }, root),
  ).toBeNull();
});

test('the balloon points below a high target and above a low target', () => {
  const high = { x: 25, y: 100, width: 310, height: 64 };
  const low = { ...high, y: 650 };
  const below = guideCardLayout(high, viewport, 240);
  const above = guideCardLayout(low, viewport, 240);
  expect(below.side).toBe('below');
  expect(below.y).toBeGreaterThan(high.y + high.height);
  expect(above.side).toBe('above');
  expect(above.y + 240).toBeLessThan(low.y);
  expect(below.pointer && above.pointer).toBe(true);
});

test.each([
  { ...viewport, width: 320, height: 568 },
  { ...viewport, width: 800, height: 360, top: 0, bottom: 24 },
  { ...viewport, width: 280, height: 500, top: 40, bottom: 40 },
])(
  'large text and landscape keep the card and controls within safe bounds: %j',
  size => {
    const card = guideCardLayout(
      { x: size.width - 80, y: size.height / 2, width: 60, height: 90 },
      size,
      600,
    );
    expect(card.x).toBeGreaterThanOrEqual(16);
    expect(card.x + card.width).toBeLessThanOrEqual(size.width - 16);
    expect(card.y).toBeGreaterThanOrEqual(size.top + 12);
    expect(card.y + Math.min(600, card.maxHeight)).toBeLessThanOrEqual(
      size.height - size.bottom - 12,
    );
    expect(card.arrowX).toBeGreaterThanOrEqual(22);
    expect(card.arrowX).toBeLessThanOrEqual(card.width - 22);
    expect(card.pointer).toBe(false);
  },
);

test('reveal scrolling leaves room for the balloon and clamps at both ends of content', () => {
  const scroll = { x: 0, y: 100, width: 360, height: 600 };
  const target = { x: 20, y: 620, width: 320, height: 48 };
  const offset = guideScrollOffset(target, scroll, 0, 1800, 260);
  expect(offset).toBeGreaterThan(350);
  expect(offset).toBeLessThan(520);
  expect(guideScrollOffset({ ...target, y: 80 }, scroll, 0, 1800, 260)).toBe(0);
  expect(guideScrollOffset(target, scroll, 1000, 900, 260)).toBe(300);
  expect(guideScrollOffset(target, scroll, 0, 400, 260)).toBe(0);
});
