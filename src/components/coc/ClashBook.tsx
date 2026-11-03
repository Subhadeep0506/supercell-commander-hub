import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { BOOK_ITEMS, bookCategory, filterBook, itemArt, type BookItem } from '@/lib/clash-book';
import { ChipRow } from '@/components/ui/ChipRow';
import { HGrid } from '@/components/ui/HGrid';
import { SearchField } from '@/components/ui/SearchField';
import { Tabs } from '@/components/ui/Tabs';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { useHub } from '@/state/HubProvider';
import { BookItemModal } from './BookItemModal';

/** Matches the 25% tile the wrapping grid produced at the 560px cap. */
const TILE = 96;

/**
 * Ported from frontend/src/components/clash-book.tsx.
 *
 * Browses the community catalog by village, category and free text. Magic
 * items appear under both villages, which is why the village filter tests
 * `base === village || base === 'magic-items'`.
 */
export function ClashBook() {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);

  const [village, setVillage] = useState<'home' | 'builder' | 'capital'>('home');
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<BookItem>();
  const { village: imported } = useHub();

  /** Your level for an item, when a village export has been imported. */
  const ownedLevel = (catalogId: string): number | undefined => {
    if (!imported) return undefined;
    for (const side of [imported.home, imported.builder]) {
      const owned = side.owned.find((o) => o.catalogId === catalogId);
      if (owned) return owned.level;
    }
    return undefined;
  };

  const villageItems = BOOK_ITEMS.filter(
    (i) => i.base === village || (village !== 'capital' && i.base === 'magic-items'),
  );
  const categories = ['All', ...new Set(villageItems.map((i) => bookCategory(i.category)))];
  const items = filterBook(village, category, query);
  const groups = [...new Set(items.map((i) => bookCategory(i.category)))];

  return (
    <View>
      <Tabs
        value={village}
        onChange={(v) => {
          setVillage(v);
          setCategory('All');
        }}
        tabs={[
          { id: 'home', label: 'Home Village' },
          { id: 'builder', label: 'Builder Base' },
          { id: 'capital', label: 'Clan Capital' },
        ]}
      />

      <SearchField
        value={query}
        onChangeText={setQuery}
        accessibilityLabel="Search Clash Book"
        placeholder="Search anything"
      />

      <ChipRow
        accessibilityLabel="Item categories"
        value={category}
        onChange={setCategory}
        chips={categories.map((c) => ({
          id: c,
          label: c,
          count:
            c === 'All'
              ? villageItems.length
              : villageItems.filter((i) => bookCategory(i.category) === c).length,
        }))}
      />

      {groups.map((group) => {
        const groupItems = items.filter((i) => bookCategory(i.category) === group);
        return (
          <View key={group} style={s.group}>
            <View style={s.groupHeading}>
              <Text style={s.groupTitle}>{group}</Text>
              <Text style={s.groupCount}>{groupItems.length}</Text>
            </View>
            <HGrid
              items={groupItems}
              tileWidth={TILE}
              accessibilityLabel={`${group} items`}
              keyExtractor={(item) => item.id}
              renderItem={(item) => {
                const art = itemArt(item);
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`View ${item.name}`}
                    style={s.tile}
                    onPress={() => setSelected(item)}
                  >
                    <View style={s.tileArt}>
                      {art ? (
                        <Image
                          source={art.source}
                          resizeMode="contain"
                          style={s.tileImage}
                        />
                      ) : (
                        <Text style={s.missing} numberOfLines={3}>
                          {item.name}
                        </Text>
                      )}
                    </View>
                    <Text style={s.tileName} numberOfLines={2}>
                      {item.name}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </View>
        );
      })}

      {items.length === 0 ? <Text style={s.empty}>No matching items</Text> : null}

      <Text style={s.source}>
        Community reference · v0.19.1 · clash-of-clans-data / Clash of Clans Wiki (CC BY-SA) ·
        Official Supercell fan-kit artwork.
      </Text>

      {selected ? (
        <BookItemModal
          key={selected.id}
          item={selected}
          // An imported village knows your level for every item, including the
          // Builder Base ones the player API leaves out entirely.
          initialLevel={ownedLevel(selected.id)}
          open
          onClose={() => setSelected(undefined)}
        />
      ) : null}
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    group: { marginBottom: 28 },
    groupHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    groupTitle: { fontFamily: t.fonts.display, fontSize: 16, color: t.foreground },
    groupCount: { fontSize: 12, color: t.mutedForeground, fontFamily: t.fonts.sans },
    // Width and gutters come from HGrid.
    tile: { width: '100%' },
    tileArt: {
      width: '100%',
      aspectRatio: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.muted,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 8,
      padding: 5,
      overflow: 'hidden',
    },
    tileImage: { width: '100%', height: '100%' },
    missing: { fontFamily: t.fonts.display, fontSize: 11, textAlign: 'center', color: t.mutedForeground },
    tileName: {
      marginTop: 7,
      minHeight: 30,
      textAlign: 'center',
      fontFamily: t.fonts.display,
      fontSize: 11,
      lineHeight: 15,
      color: t.foreground,
    },
    empty: { paddingVertical: 48, textAlign: 'center', color: t.mutedForeground, fontFamily: t.fonts.sans },
    source: { marginTop: 18, fontSize: 10, lineHeight: 16, color: t.mutedForeground, fontFamily: t.fonts.sans },
  });
