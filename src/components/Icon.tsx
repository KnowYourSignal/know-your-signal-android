import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { COLORS } from '../theme/theme';

const paths = {
  signal: 'M4 18v-2 M9 18v-5 M14 18v-8 M19 18V5',
  radar: 'M12 12 20 4 M12 4a8 8 0 1 0 8 8 M12 8a4 4 0 1 0 4 4 M12 12h.01',
  map: 'm3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z M9 3v15 M15 6v15',
  globe:
    'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z M2 12h20 M12 2c5 5 5 15 0 20-5-5-5-15 0-20Z',
  settings: 'M4 6h16 M4 12h16 M4 18h16 M8 4v4 M15 10v4 M10 16v4',
  shield: 'M12 22s7-3.5 7-10V5l-7-3-7 3v7c0 6.5 7 10 7 10Z M9 12l2 2 4-4',
  building:
    'M5 21V4h14v17 M3 21h18 M9 8h.01 M15 8h.01 M9 12h.01 M15 12h.01 M10 21v-5h4v5',
  arrow: 'M4 12h15m-6-6 6 6-6 6',
  back: 'M20 12H5m6 6-6-6 6-6',
  check: 'm5 12 4 4 10-10',
  lock: 'M7 11V7a5 5 0 0 1 10 0v4 M5 11h14v10H5z M12 15v2',
  info: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z M12 11v6 M12 7h.01',
  close: 'm6 6 12 12 M18 6 6 18',
  plus: 'M12 5v14 M5 12h14',
  minus: 'M5 12h14',
  locate:
    'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z M12 2v4 M22 12h-4 M12 22v-4 M2 12h4 M12 12h.01',
  wifi: 'M3 9a15 15 0 0 1 18 0 M6 12a10 10 0 0 1 12 0 M9 15a5 5 0 0 1 6 0 M12 18h.01',
  share: 'M12 15V3m-4 4 4-4 4 4 M5 12v8h14v-8',
  refresh: 'M20 5v5h-5 M20 10a8 8 0 1 0-1 7',
  clock: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z M12 6v6l4 2',
  layers: 'm12 3 9 5-9 5-9-5 9-5Z M3 12l9 5 9-5 M3 16l9 5 9-5',
} as const;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  color = COLORS.primary,
  size = 22,
}: {
  name: IconName;
  color?: string;
  size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Path
        d={paths[name]}
        fill="none"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
