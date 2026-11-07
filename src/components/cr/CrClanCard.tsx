import { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { record, text, type ApiRecord } from '@/api/game-api';
import { clanBadgeArt } from '@/assets/royale';
import { useDetailSheet } from '@/components/detail/DetailSheetProvider';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { Chevron } from '@/components/ui/Chevron';
import { CrIcon, num } from './CrBits';

/**
 * A Royale clan reduced to one card, opening the full profile in the sheet.
 *
 * The Clan tab used to render your own clan expanded in place -- banner, four
 * tabs, the lot -- while every *other* clan opened in the sheet. That split
 * meant the same clan looked like two different things depending on how you
 * reached it, and it was the one place Royale and Clash of Clans disagreed on
 * what a clan screen is. Both are finders now.
 *
 * `CrClanPanel` is untouched and still renders the expanded view; it simply
 * only has one caller now, the sheet.
 */
export function CrClanCard({ clan, label }: { clan: ApiRecord; label?: string }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { openClan } = useDetailSheet();

  const badge = clanBadgeArt(clan['badgeId']);
  const tag = text(clan['tag']);
  const location = text(record(clan['location'])['name']);

  return (
    <View>
      {/*
        Guarded on a non-empty string, not on truthiness: `{label && …}` puts a
        bare '' inside this View, which only warns on the web and is a hard
        error on Android.
      */}
      {label ? <Text style={s.label}>{label}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View ${text(clan['name'])}`}
        onPress={() => openClan(tag, 'cr')}
        style={({ pressed }) => [s.card, pressed && s.pressed]}
      >
        {badge ? (
          <Image
            source={badge}
            style={s.badge}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <CrIcon name="clan" size={48} />
        )}
        <View style={s.body}>
          <Text style={s.name} numberOfLines={1}>
            {text(clan['name'])}
          </Text>
          <Text style={s.meta} numberOfLines={1}>
            {tag}
            {location === '—' ? '' : ` · ${location}`}
          </Text>
          <Text style={s.meta} numberOfLines={1}>
            {num(clan['members'])}/50 members · {num(clan['clanScore'])} score
          </Text>
        </View>
        {/* Points right: this opens a sheet, it does not expand in place. */}
        <Chevron open={false} size={18} style={s.go} />
      </Pressable>
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    label: { fontFamily: t.fonts.display, fontSize: 13, color: t.foreground, marginBottom: 10 },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      padding: 14,
      backgroundColor: t.card,
      borderWidth: 2,
      borderColor: t.chrome.cr.rim,
      borderRadius: t.radius.md,
    },
    pressed: { opacity: 0.8 },
    badge: { width: 48, height: 48, flexShrink: 0 },
    body: { flex: 1, minWidth: 0 },
    name: { fontFamily: t.fonts.display, fontSize: 16, color: t.cardForeground },
    meta: { marginTop: 4, fontFamily: t.fonts.sans, fontSize: 11, color: t.mutedForeground },
    // Rotated a quarter turn so the "expand" chevron reads as "go".
    go: { transform: [{ rotate: '-90deg' }] },
  });
