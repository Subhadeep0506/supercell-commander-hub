import { useMemo } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { leagueArt } from '@/assets/leagues';
import { LEAGUE_TIER_ROMAN, type LeagueTierInfo } from '@/lib/league-tier';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

/**
 * A league badge with its tier marked on the corner.
 *
 * Supercell draws one piece of art per League Tier, but that art lives on
 * api-assets.clashofclans.com -- a cold network request everywhere and a 403
 * on a restricted network, which is exactly the hole the bundled sets exist
 * to fill. What is bundled is one badge per *family* (twelve of them, from
 * clash-of-clans-data), so the three tiers inside a family are identical
 * pictures and a Wizard I is indistinguishable from a Wizard III.
 *
 * Rather than bake thirty-six variants into the bundle, the numeral is drawn
 * here. It stays sharp at any size, costs no APK, and tuning it is one edit
 * rather than an asset rebuild.
 *
 * Only the ranked set gets a numeral. Builder Base ships real per-tier art,
 * and the retired trophy leagues are drawn per family in game as well, so
 * marking either would be inventing a distinction the picture does not make.
 */

/**
 * Below this the numeral is dropped rather than drawn.
 *
 * Three strokes inside a box a fifth the badge's height stop being three
 * strokes somewhere around here -- it reads as a smudge, which is worse than
 * an unmarked badge because it looks like dirt on the artwork.
 */
const MIN_NUMERAL_SIZE = 20;

export function LeagueTierBadge({
  league,
  size,
  style,
}: {
  league?: LeagueTierInfo;
  size: number;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);

  if (!league) return null;
  const art = leagueArt(league);
  if (!art) return null;

  const roman = league.tier ? LEAGUE_TIER_ROMAN[league.tier - 1] : undefined;
  const showNumeral = roman !== undefined && size >= MIN_NUMERAL_SIZE;

  return (
    <View
      accessible
      accessibilityLabel={league.label}
      style={[{ width: size, height: size }, style]}
    >
      <Image source={art} style={{ width: size, height: size }} resizeMode="contain" />
      {showNumeral ? (
        <View
          style={[
            s.corner,
            {
              minWidth: Math.round(size * 0.4),
              paddingHorizontal: Math.max(2, Math.round(size * 0.06)),
              borderRadius: Math.round(size * 0.1),
            },
          ]}
        >
          <Text
            // Fixed line height: the display face carries enough internal
            // leading to push the numeral off-centre in a box this small.
            style={[
              s.numeral,
              {
                fontSize: Math.max(8, Math.round(size * 0.3)),
                lineHeight: Math.max(10, Math.round(size * 0.36)),
              },
            ]}
          >
            {roman}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    /**
     * Bottom-right, half off the badge.
     *
     * The badges are hexagons with a character's face filling the middle, so
     * a numeral laid inside the shape sits on top of the art. Hanging it off
     * the corner keeps both readable, and the row layouts that use this
     * already leave the space.
     */
    corner: {
      position: 'absolute',
      right: -2,
      bottom: -2,
      alignItems: 'center',
      justifyContent: 'center',
      // Not a theme colour: this has to hold its contrast against twelve
      // pieces of fixed artwork, which do not change with the light/dark
      // skin the way the surfaces around them do.
      backgroundColor: 'rgba(17, 24, 28, 0.92)',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.35)',
    },
    numeral: {
      fontFamily: t.fonts.display,
      color: '#ffffff',
      textAlign: 'center',
      includeFontPadding: false,
    },
  });
