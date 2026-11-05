import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { gameQuery } from '@/api/queries';
import { text } from '@/api/game-api';
import { countryLocations, flagEmoji } from '@/lib/rankings';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { Button } from './Button';
import { Collapsible } from './Collapsible';
import { Select, type SelectOption } from './Select';

/**
 * The clan-search filters, shared by both games.
 *
 * Filtering happens **server side**. The name search returns a single capped
 * page, so narrowing that page in the app would quietly hide clans that match
 * instead of finding them -- ask for 50/50 clans and you would get an empty
 * list while thousands exist, simply because none were in the first 25 rows.
 *
 * The two games do not offer the same filters, and this is not an oversight to
 * paper over: Clash of Clans scores clans in points and knows about clan level
 * and war frequency, Clash Royale has one `minScore` and neither of the others.
 * `game` picks the set; `game-api.ts` rejects a filter sent to the wrong one.
 */

export type ClanFilterValues = {
  minMembers?: number;
  maxMembers?: number;
  minClanPoints?: number;
  minClanLevel?: number;
  warFrequency?:
    | 'always'
    | 'moreThanOncePerWeek'
    | 'oncePerWeek'
    | 'lessThanOncePerWeek'
    | 'never';
  minScore?: number;
  locationId?: string | number;
};

/** The sentinel for "no filter", so a Select always has a selected option. */
const ANY = 'any';

/**
 * Clan size, as a range rather than a single number.
 *
 * Each option names *both* ends, because the two bounds are different
 * questions: "room to join" is a maximum, "an active clan" is a minimum. An
 * earlier pass mapped every option onto `minMembers` alone, which made
 * "under 10" mean "at least 1" -- the opposite of its label.
 */
export const SIZES: (SelectOption & { min?: number; max?: number })[] = [
  { id: ANY, label: 'Any size' },
  { id: 'room', label: 'Has room · under 45', max: 44 },
  { id: 'quiet', label: 'Small · under 20', max: 19 },
  { id: 'active', label: 'Active · 25 or more', min: 25 },
  { id: 'busy', label: 'Busy · 40 or more', min: 40 },
  { id: 'full', label: 'Full · 50', min: 50 },
];

const WAR_FREQUENCY: SelectOption[] = [
  { id: ANY, label: 'Any war frequency' },
  { id: 'always', label: 'Always' },
  { id: 'moreThanOncePerWeek', label: 'More than once a week' },
  { id: 'oncePerWeek', label: 'Once a week' },
  { id: 'lessThanOncePerWeek', label: 'Rarely' },
  { id: 'never', label: 'Never' },
];

const COC_POINTS: SelectOption[] = [
  { id: ANY, label: 'Any clan points' },
  { id: '10000', label: '10,000+' },
  { id: '20000', label: '20,000+' },
  { id: '30000', label: '30,000+' },
  { id: '40000', label: '40,000+' },
];

const COC_LEVEL: SelectOption[] = [
  { id: ANY, label: 'Any clan level' },
  { id: '5', label: 'Level 5+' },
  { id: '10', label: 'Level 10+' },
  { id: '15', label: 'Level 15+' },
  { id: '20', label: 'Level 20+' },
];

const CR_SCORE: SelectOption[] = [
  { id: ANY, label: 'Any clan score' },
  { id: '10000', label: '10,000+' },
  { id: '30000', label: '30,000+' },
  { id: '50000', label: '50,000+' },
  { id: '70000', label: '70,000+' },
];

export function ClanFilters({
  game,
  value,
  onChange,
  framed = true,
}: {
  game: 'coc' | 'cr';
  value: ClanFilterValues;
  onChange: (next: ClanFilterValues) => void;
  /**
   * Draws its own card. Pass `false` where this already sits inside one --
   * Clash Royale nests it in the search card, and a card within a card reads
   * as a rendering fault rather than as structure.
   */
  framed?: boolean;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const [open, setOpen] = useState(false);

  // Only fetched once the block is open: 250 locations is a wasted request on
  // a screen where most searches are by name alone.
  const locations = useQuery({
    ...gameQuery({ game, resource: 'locations' }),
    enabled: open,
  });

  const places: SelectOption[] = useMemo(() => {
    const base: SelectOption[] = [{ id: ANY, label: 'Anywhere' }];
    if (!locations.data?.ok) return base;
    return base.concat(
      countryLocations(JSON.parse(locations.data.data)).map((l) => ({
        id: String(l['id']),
        label: `${flagEmoji(l['countryCode']) ?? '📍'} ${text(l['name'])}`,
      })),
    );
  }, [locations.data]);

  const set = (patch: ClanFilterValues) => onChange({ ...value, ...patch });

  /** `any` clears the key rather than sending a zero the service would honour. */
  const pick = (id: string): number | undefined => (id === ANY ? undefined : Number(id));

  const active = countActive(value);

  return (
    <View style={framed ? s.wrap : s.bare}>
      <Collapsible
        accessibilityLabel="Clan search filters"
        initiallyOpen={false}
        onToggle={setOpen}
        summary={() => (
          <>
            <Text style={s.title}>Filters</Text>
            {/*
              A count, not a dot: it says how much is narrowing the search
              without making the user open the block to find out.
            */}
            <Text style={s.count}>{active > 0 ? `${active} active` : 'None'}</Text>
          </>
        )}
      >
        <View style={s.fields}>
          <Select
            accessibilityLabel="Clan size"
            title="Clan size"
            options={SIZES}
            value={sizeId(value)}
            onChange={(id) => {
              const size = SIZES.find((o) => o.id === id);
              set({ minMembers: size?.min, maxMembers: size?.max });
            }}
          />
          <Select
            accessibilityLabel="Clan location"
            title="Location"
            options={places}
            value={value.locationId === undefined ? ANY : String(value.locationId)}
            onChange={(id) => set({ locationId: id === ANY ? undefined : id })}
          />

          {game === 'coc' ? (
            <>
              <Select
                accessibilityLabel="Minimum clan points"
                title="Clan points"
                options={COC_POINTS}
                value={value.minClanPoints === undefined ? ANY : String(value.minClanPoints)}
                onChange={(id) => set({ minClanPoints: pick(id) })}
              />
              <Select
                accessibilityLabel="Minimum clan level"
                title="Clan level"
                options={COC_LEVEL}
                value={value.minClanLevel === undefined ? ANY : String(value.minClanLevel)}
                onChange={(id) => set({ minClanLevel: pick(id) })}
              />
              <Select
                accessibilityLabel="War frequency"
                title="War frequency"
                options={WAR_FREQUENCY}
                value={value.warFrequency ?? ANY}
                onChange={(id) =>
                  set({
                    warFrequency:
                      id === ANY ? undefined : (id as ClanFilterValues['warFrequency']),
                  })
                }
              />
            </>
          ) : (
            <Select
              accessibilityLabel="Minimum clan score"
              title="Clan score"
              options={CR_SCORE}
              value={value.minScore === undefined ? ANY : String(value.minScore)}
              onChange={(id) => set({ minScore: pick(id) })}
            />
          )}

          {active > 0 ? (
            <Button
              variant="outline"
              size="sm"
              accessibilityLabel="Clear clan search filters"
              onPress={() => onChange({})}
              style={s.clear}
            >
              Clear filters
            </Button>
          ) : null}
        </View>
      </Collapsible>
    </View>
  );
}

/** Which size option the current min/max pair came from. */
export function sizeId(value: ClanFilterValues): string {
  return (
    SIZES.find(
      (o) => o.id !== ANY && o.min === value.minMembers && o.max === value.maxMembers,
    )?.id ?? ANY
  );
}

/**
 * How many *controls* are narrowing the search, not how many keys are set --
 * the size control writes both `minMembers` and `maxMembers`, and counting
 * those separately would report one choice as two filters.
 */
export function countActive(value: ClanFilterValues): number {
  const size = value.minMembers !== undefined || value.maxMembers !== undefined ? 1 : 0;
  const rest = (['minClanPoints', 'minClanLevel', 'warFrequency', 'minScore', 'locationId'] as const)
    .filter((k) => value[k] !== undefined && value[k] !== '')
    .length;
  return size + rest;
}

const build = (t: Theme) =>
  StyleSheet.create({
    wrap: {
      padding: 14,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 8,
    },
    // Already inside a card: a rule above is enough to separate the filters
    // from the search row without drawing a second frame around them.
    bare: { paddingTop: 12, borderTopWidth: 1, borderTopColor: t.border },
    title: { flex: 1, minWidth: 0, fontFamily: t.fonts.display, fontSize: 13, color: t.foreground },
    count: { fontFamily: t.fonts.sans, fontSize: 11, color: t.mutedForeground },
    fields: { gap: 8 },
    clear: { alignSelf: 'flex-start', marginTop: 2 },
  });
