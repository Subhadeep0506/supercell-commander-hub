import type { ImageSourcePropType } from 'react-native';
import { arenaImages } from './registry.arena';
import { crArenaImages } from './registry.crArena';
import { crBadgeImages } from './registry.crBadge';
import { crChestImages } from './registry.crChest';
import { crIconImages } from './registry.crIcon';
import { crLeagueImages } from './registry.crLeague';
import { crPlayerBadgeImages } from './registry.crPlayerBadge';
import { crPolImages } from './registry.crPol';
import { crTokenImages } from './registry.crToken';
import badgeMap from '@/data/cr/badge-map.json';
import arenaMap from '@/data/cr/arena-map.json';

/**
 * Clash Royale artwork that is not a card.
 *
 * Card art lives in `arena.ts`, which is shared with Brawl Stars. This module
 * is Royale-only: arenas, Path of Legend leagues, chests, clan badges and
 * rarity tokens, all from RoyaleAPI/cr-api-assets via
 * scripts/fetch-cr-assets.mjs.
 *
 * Two of these cannot be looked up by name. The API hands back a numeric
 * `badgeId` with no URL at all, and an `arena.id` rather than an arena number,
 * so both go through a generated map -- see the same script.
 *
 * Every lookup returns undefined rather than a stand-in when it misses. The
 * upstream repo was last published 2026-03-05, so newer arenas and chests are
 * genuinely absent; handing back the wrong picture would be worse than the
 * caller's own fallback. assets-req.md lists what is still outstanding.
 */

const BADGES = badgeMap as Record<string, string>;
const ARENAS = arenaMap as Record<string, string>;

/**
 * Clan crest for a `badgeId`.
 *
 * Clash of Clans supplies `badgeUrls` and this is a remote image; Clash Royale
 * supplies neither, which is why the whole map exists.
 */
export function clanBadgeArt(badgeId: unknown): ImageSourcePropType | undefined {
  if (typeof badgeId !== 'number' && typeof badgeId !== 'string') return undefined;
  const name = BADGES[String(badgeId)];
  return name ? crBadgeImages[name] : undefined;
}

/**
 * Arena art for an `arena.id` (`54000024`), via its arena number.
 *
 * Merge Tactics (`168000xxx`) and seasonal arenas are not in the dataset at
 * all, so those legitimately return undefined.
 */
export function arenaBadgeArt(arenaId: unknown): ImageSourcePropType | undefined {
  if (typeof arenaId !== 'number' && typeof arenaId !== 'string') return undefined;
  const key = ARENAS[String(arenaId)];
  return key ? crArenaImages[key] : undefined;
}

/**
 * Path of Legend league badge for a `leagueNumber`.
 *
 * Two sets are in play. `cr/pol` holds the real Path of Legend badges --
 * Challenger I-III, Master I-III, Champion, Grand Champion, Royal Champion --
 * which is what `leagueNumber` 1-9 actually means. `cr/leagues` holds the
 * older trophy-road art from cr-api-assets, used only for 10 (Ultimate
 * Champion), which the hand-sourced set does not include.
 */
export function leagueBadgeArt(leagueNumber: unknown): ImageSourcePropType | undefined {
  const n = Number(leagueNumber);
  if (!Number.isFinite(n)) return undefined;
  return crPolImages[`pol${n}`] ?? crLeagueImages[`league${n}`];
}

/**
 * Chest names the upstream filenames do not match directly.
 *
 * Everything else slugs cleanly: "Mega Lightning Chest" drops the suffix and
 * becomes `chest-megalightning`.
 */
const CHEST_ALIASES: Record<string, string> = {
  'golden chest': 'chest-gold',
  'overflowing gold crate': 'chest-overflowgoldcrate',
  'plentiful gold crate': 'chest-plentifulgoldcrate',
  "king's chest": 'chest-king',
  "legendary king's chest": 'chest-kinglegendary',
};

/**
 * Stand-in for a chest no art exists for.
 *
 * "Crown Chest" is the live example: it is absent from RoyaleAPI/cr-api-assets
 * *and* from the fan kit, so there is nothing to bundle and nothing to fetch.
 * The track used to leave a hole where its picture goes, which reads as a
 * broken card rather than as a chest we cannot illustrate.
 *
 * The plain wooden chest stands in, drawn faint by the caller so it is clearly
 * a placeholder rather than a claim that this *is* a Wooden Chest. The real
 * name still prints underneath, which is the part that carries the meaning.
 */
export const chestFallbackArt: ImageSourcePropType | undefined = crChestImages['chest-wooden'];

/** Chest art by the name the API returns. */
export function chestArt(name: unknown): ImageSourcePropType | undefined {
  if (typeof name !== 'string') return undefined;
  const alias = CHEST_ALIASES[name.toLowerCase().trim()];
  if (alias) return crChestImages[alias];
  // "Mega Lightning Chest" -> "chest-megalightning"; "Gold Crate" keeps its
  // whole name because only the trailing word "Chest" is redundant.
  const slug = name
    .toLowerCase()
    .replace(/\bchest\b/g, '')
    .replace(/[^a-z0-9]/g, '');
  return slug ? crChestImages[`chest-${slug}`] : undefined;
}

/** Rarity token, common through champion. */
export function rarityTokenArt(rarity: unknown): ImageSourcePropType | undefined {
  if (typeof rarity !== 'string') return undefined;
  return crTokenImages[`tt-${rarity.toLowerCase()}`];
}

/**
 * Highest art index per badge family, read off the registry once.
 *
 * A family has as many pictures as it has levels, and the two do not always
 * agree with the API: `YearsPlayed` reports `maxLevel: 11` but the fan kit
 * ships six, because the badge only changes art every other year. The current
 * level is therefore clamped into what exists rather than missing outright.
 */
const BADGE_LEVELS = (() => {
  const top = new Map<string, number>();
  for (const key of Object.keys(crPlayerBadgeImages)) {
    const match = /^(.+)-lv(\d+)$/.exec(key);
    if (!match) continue;
    const family = match[1]!;
    const level = Number(match[2]);
    top.set(family, Math.max(top.get(family) ?? 0, level));
  }
  return top;
})();

/**
 * Badge families whose fan-kit name is not the API's name slugified.
 *
 * Everything else matches once `Mastery` is stripped and punctuation is
 * dropped -- `MasteryMiniPekka` and `badge_MiniP.E.K.K.A_lv4` both reduce to
 * `minipekka`, which covers all 19 mastery and progression badges on the
 * calibration account.
 *
 * The non-mastery entries below are written against the names the esports and
 * challenge badges are documented under rather than observed on an account
 * that holds them, so some may never fire. That is deliberate and costs
 * nothing: an alias that misses behaves exactly like no alias, and the caller
 * falls through to the generic badge frame either way.
 */
const BADGE_ALIASES: Record<string, string> = {
  bannercollection: 'bannerscollected',
  clanwarwins: 'clanwars2',
  clanwars: 'clanwars2',
  classic12wins: 'classicchallengetriumph',
  grand12wins: 'grandchallengetriumph',
  laddertournamenttop1000: 'toprankedfinishes',
  topladdertournament: 'toprankedfinishes',
  royaltournamentfinishes: 'toproyaltournamentfinishes',
  suddendeathwin: 'suddendeathwins',
  crlspectator: 'crlspectator2022',
  crlcompetitor: 'crlcompetitor2022',
};

/**
 * Player badge art for an API `badges[]` entry.
 *
 * The API hands back `iconUrls.large` on api-assets.clashroyale.com, which is
 * a cold network request at best and blocked outright on some networks -- the
 * badge list rendered as a column of empty boxes. The fan kit has all 1,191
 * of them, so the bundle is the primary source and the url is the fallback.
 *
 * Two of the families the API returns -- EmoteCollection and CollectionLevel
 * -- have no fan-kit art at all, so they legitimately miss and fall through to
 * the caller's own fallback.
 */
export function playerBadgeArt(name: unknown, level: unknown): ImageSourcePropType | undefined {
  if (typeof name !== 'string' || !name) return undefined;
  const bare = name.replace(/^Mastery/, '');
  const key = bare.toLowerCase().replace(/[^a-z0-9]/g, '');
  const family = BADGE_ALIASES[key] ?? key;
  const top = BADGE_LEVELS.get(family);
  if (top === undefined) return undefined;
  // API levels are 1-based and the files are 0-based, so level 1 is `lv0`.
  // An absent level means the badge has no progression -- the one-off esports
  // badges -- which is `lv0`.
  const index = Math.min(Math.max(Math.floor(Number(level) || 1) - 1, 0), top);
  return crPlayerBadgeImages[`${family}-lv${index}`];
}

/**
 * Named icons, by what they *mean* rather than what the file is called.
 *
 * The art is mixed-origin -- five icons fall out of the card set, eighteen
 * were sourced by hand -- so call sites address a meaning and this table owns
 * which picture serves it. That is what makes a repurpose a one-line change
 * here instead of an edit in six components.
 *
 * Several entries deliberately share art. `donated`, `received` and
 * `donationsPerWeek` are all the trade icon; the labels beside them already
 * carry the direction, and three near-identical card-swap icons would be
 * noise. The same goes for the four tournament and challenge stats.
 */
export const CR_ICONS = {
  // From the card set.
  king: arenaImages['king'],
  crown: arenaImages['crown'],
  trophy: arenaImages['trophy'],
  clan: arenaImages['clan'],
  cardsAlt: arenaImages['cards'],

  // Hand-sourced.
  elixir: crIconImages['elixir'],
  star: crIconImages['star'],
  members: crIconImages['members'],
  cards: crIconImages['cards'],
  battle: crIconImages['battle'],
  clanWars: crIconImages['clanwars'],
  tournament: crIconImages['tournament'],
  trade: crIconImages['trade'],
  experience: crIconImages['experience'],
  /**
   * The app uses blue for yours and red for theirs -- a win count and your side
   * of a crown pair are blue, a loss count and the opponent's side are red.
   *
   * That is the opposite of the game, which draws your own crowns red in
   * battle. Deliberate: on a scoreboard red reads as the warning colour, and
   * putting it on a result you won inverts the meaning of the row. Go through
   * CrownRecord / CrownPair in CrBits rather than reaching for these directly,
   * so one screen cannot end up using both conventions.
   */
  crownRed: crIconImages['crownred'],
  crownBlue: crIconImages['crownblue'],
  book: crIconImages['book'],
  key: crIconImages['key'],
  globe: crIconImages['globe'],
  shop: crIconImages['shop'],
  target: crIconImages['target'],
  tree: crIconImages['tree'],
  ranked: crIconImages['ranked'],

  // From the fan kit, via scripts/fetch-fankit.mjs. The kit has no purpose-
  // built UI icon for any of these, so each is the closest real art in it --
  // see the table in that script for which title serves which meaning.
  /** Repair points. River Race, and the race log. */
  hammer: crIconImages['hammer'],
  /** Fame. Scored in crowns, and drawn as one. */
  fame: crIconImages['fame'],
  /** Evolution -- the Wild Shard, the game's generic evolution currency. */
  evolution: crIconImages['evolution'],
  /** Win / lose streak. */
  streak: crIconImages['streak'],
  /** Favourite card. */
  heart: crIconImages['heart'],
  /** A blank badge frame: the fallback for a badge with no art in the kit. */
  mastery: crIconImages['mastery'],
  /** Path of Legend, for its ladder chip and as the league fallback. */
  pathOfLegend: crIconImages['pathoflegend'],
  /** The TV Royale achievement, which has no other art anywhere. */
  tvRoyale: crIconImages['tvroyale'],
} as const;

export type CrIconName = keyof typeof CR_ICONS;

