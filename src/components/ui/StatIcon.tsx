import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Outline icons for the Clash Book "Details" rows.
 *
 * Neither the Supercell fan kit nor clash-of-clans-data contains stat icons --
 * both are game content artwork only -- so these are drawn here. Single weight,
 * single viewBox, so every Details row carries the same visual weight, unlike
 * the game artwork used elsewhere in the app.
 */
export type StatIconName =
  | 'target'
  | 'movement'
  | 'attackSpeed'
  | 'range'
  | 'size'
  | 'housing'
  | 'damage'
  | 'ability'
  | 'search'
  | 'time';

/** Maps a catalog field name onto an icon. */
export const STAT_ICON_FOR: Record<string, StatIconName> = {
  preferredTarget: 'target',
  favoriteTarget: 'target',
  attackType: 'damage',
  damageType: 'damage',
  unitType: 'damage',
  movementSpeed: 'movement',
  attackSpeed: 'attackSpeed',
  range: 'range',
  searchRadius: 'search',
  housingSpace: 'housing',
  trainingTime: 'time',
  size: 'size',
  specialAbility: 'ability',
};

export function StatIcon({
  name,
  size = 20,
  color,
}: {
  name: StatIconName;
  size?: number;
  color?: string;
}) {
  const theme = useTheme();
  const stroke = color ?? theme.primary;
  const props = {
    stroke,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'target' ? (
        <>
          <Circle cx={12} cy={12} r={7.5} {...props} />
          <Circle cx={12} cy={12} r={2.5} {...props} />
          <Line x1={12} y1={1.5} x2={12} y2={5} {...props} />
          <Line x1={12} y1={19} x2={12} y2={22.5} {...props} />
          <Line x1={1.5} y1={12} x2={5} y2={12} {...props} />
          <Line x1={19} y1={12} x2={22.5} y2={12} {...props} />
        </>
      ) : null}

      {name === 'movement' ? (
        // Arrow with motion lines. A boot was tried first and read as a bent
        // line at this size.
        <>
          <Line x1={4} y1={12} x2={15.5} y2={12} {...props} />
          <Polyline points="11.5,8 15.5,12 11.5,16" {...props} />
          <Line x1={3} y1={7.5} x2={8.5} y2={7.5} {...props} />
          <Line x1={3} y1={16.5} x2={8.5} y2={16.5} {...props} />
        </>
      ) : null}

      {name === 'attackSpeed' ? (
        // Crossed swords.
        <>
          <Path d="M3.5 3.5h3l12 12v3h-3l-12-12z" {...props} />
          <Path d="M20.5 3.5h-3l-5 5" {...props} />
          <Path d="M8.5 15.5l-5 5h3" {...props} />
        </>
      ) : null}

      {name === 'range' ? (
        // A measured span between two posts -- a bow outline collapsed into an
        // unreadable hook at 22px.
        <>
          <Line x1={3.5} y1={5} x2={3.5} y2={19} {...props} />
          <Line x1={20.5} y1={5} x2={20.5} y2={19} {...props} />
          <Line x1={3.5} y1={12} x2={20.5} y2={12} {...props} />
          <Polyline points="7.5,8.5 4,12 7.5,15.5" {...props} />
          <Polyline points="16.5,8.5 20,12 16.5,15.5" {...props} />
        </>
      ) : null}

      {name === 'size' ? (
        // Footprint grid.
        <>
          <Rect x={3.5} y={3.5} width={17} height={17} rx={2} {...props} />
          <Line x1={9.5} y1={3.5} x2={9.5} y2={20.5} {...props} />
          <Line x1={15.5} y1={3.5} x2={15.5} y2={20.5} {...props} />
          <Line x1={3.5} y1={9.5} x2={20.5} y2={9.5} {...props} />
          <Line x1={3.5} y1={15.5} x2={20.5} y2={15.5} {...props} />
        </>
      ) : null}

      {name === 'housing' ? (
        // Two figures -- capacity. A tent read as a warning triangle.
        <>
          <Circle cx={9} cy={7.5} r={3} {...props} />
          <Path d="M3.5 19.5c0-3.1 2.5-5.5 5.5-5.5s5.5 2.4 5.5 5.5" {...props} />
          <Circle cx={17.5} cy={9} r={2.3} {...props} />
          <Path d="M14.8 19.5c0-2.5 1.2-4.2 2.7-4.2 1.7 0 2.9 1.7 2.9 4.2" {...props} />
        </>
      ) : null}

      {name === 'damage' ? (
        // Impact burst -- rays around a core. A star read as a rating.
        <>
          <Circle cx={12} cy={12} r={2.2} {...props} />
          <Line x1={12} y1={2.5} x2={12} y2={7} {...props} />
          <Line x1={12} y1={17} x2={12} y2={21.5} {...props} />
          <Line x1={2.5} y1={12} x2={7} y2={12} {...props} />
          <Line x1={17} y1={12} x2={21.5} y2={12} {...props} />
          <Line x1={5.5} y1={5.5} x2={8.7} y2={8.7} {...props} />
          <Line x1={15.3} y1={15.3} x2={18.5} y2={18.5} {...props} />
          <Line x1={18.5} y1={5.5} x2={15.3} y2={8.7} {...props} />
          <Line x1={8.7} y1={15.3} x2={5.5} y2={18.5} {...props} />
        </>
      ) : null}

      {name === 'ability' ? (
        // Spark.
        <>
          <Path d="M13.5 2.5L5 13.5h6l-1.5 8L18 10.5h-6z" {...props} />
        </>
      ) : null}

      {name === 'search' ? (
        <>
          <Circle cx={10.5} cy={10.5} r={7} {...props} />
          <Line x1={15.5} y1={15.5} x2={21} y2={21} {...props} />
        </>
      ) : null}

      {name === 'time' ? (
        <>
          <Circle cx={12} cy={12} r={8.5} {...props} />
          <Polyline points="12,6.5 12,12 16,14" {...props} />
        </>
      ) : null}
    </Svg>
  );
}
