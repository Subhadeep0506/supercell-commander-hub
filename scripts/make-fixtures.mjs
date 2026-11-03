// Generates stand-in Clash of Clans API responses for layout testing.
//
//   node scripts/make-fixtures.mjs
//
// These are NOT real captures. Unit names are pulled from the bundled catalog
// so the Clash Book lookups, artwork and level maths all behave as they would
// against the live API, but the numbers are invented.
//
// They exist because cocproxy.royaleapi.dev is blocked on the development
// network, so screens like the village profile and war roster could otherwise
// never be rendered or reviewed here at all. Replace with a real capture when
// one is available -- scripts/check-web.mjs --fixture serves whatever is here.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'scripts/fixtures');
const catalog = [
  ...JSON.parse(readFileSync(resolve(root, 'src/data/clash-book/catalog.json'), 'utf8')),
  ...JSON.parse(readFileSync(resolve(root, 'src/data/clash-book/catalog-extra.json'), 'utf8')),
];

const TAG = '#LJ9V8LCYQ';
const TH = 13;

/**
 * Supercell tags are drawn from a 14-character alphabet, and the app validates
 * against it before making a request (see `gameRequestSchema`).
 *
 * Invented tags like "#MEMBER0" or "#OPP3" contain letters outside it, so
 * every one of them is rejected with a 400. That went unnoticed while nothing
 * in the fixtures was tappable; now that roster rows, war opponents and raid
 * attackers all open a profile, each generated tag has to be a tag the app
 * would actually accept.
 */
const TAG_ALPHABET = '0289PYLQGRJCUV';
function fakeTag(prefix, index) {
  let n = Math.abs(index);
  let body = '';
  do {
    body = TAG_ALPHABET[n % TAG_ALPHABET.length] + body;
    n = Math.floor(n / TAG_ALPHABET.length);
  } while (n > 0);
  return `#${prefix}${body.padStart(3, '0')}`;
}

// badgeUrls / iconUrls are remote, and deliberately point at the real CDN so
// the fallback path gets exercised when it is unreachable. Declared up here
// because the clan fixture needs them too, not just the rankings below.
const CDN = 'https://api-assets.clashofclans.com';
/** Plausible previousRank drift, so the up/down chevrons have something to show. */
const drift = (i) => (i % 4 === 0 ? i + 3 : i % 3 === 0 ? i - 2 : i + 1);

/** Real names from the catalog, so book lookups and artwork resolve. */
const pick = (category, base, n) =>
  catalog.filter((i) => i.category === category && i.base === base).slice(0, n);

const unit = (item, level, maxLevel, village = 'home') => ({
  name: item.name,
  level,
  maxLevel,
  village,
});

const heroes = [
  ...pick('hero', 'home', 4).map((h, i) => unit(h, [43, 41, 31, 40][i] ?? 30, 75)),
  ...pick('hero', 'builder', 2).map((h, i) => unit(h, [14, 16][i] ?? 10, 35, 'builderBase')),
];
/**
 * Super Troops, taken from the catalog like everything else.
 *
 * Their levels continue the base troop's numbering -- Super Barbarian is
 * levels 8-12, not 1-5 -- which is what the live API reports and what the
 * book's level table expects. The previous hardcoded 1..5 matched neither and
 * made every Super Troop look like an unknown level.
 */
const superTroops = catalog
  .filter((i) => i.category === 'super-troop')
  .map((i) => {
    const levels = i.levels.map((l) => l.level);
    return {
      name: i.name,
      level: levels[Math.min(1, levels.length - 1)],
      maxLevel: levels[levels.length - 1],
      village: 'home',
    };
  });

const troops = [
  ...superTroops,
  ...pick('troop', 'home', 14).map((t, i) => unit(t, 5 + (i % 8), 12)),
  ...pick('pet', 'home', 4).map((p, i) => unit(p, 4 + i, 10)),
  ...pick('siege-machine', 'home', 3).map((s, i) => unit(s, 2 + i, 5)),
  ...pick('troop', 'builder', 9).map((t, i) => unit(t, 10 + (i % 7), 18, 'builderBase')),
];
const spells = pick('spell', 'home', 8).map((s, i) => unit(s, 3 + (i % 6), 9));
const heroEquipment = pick('hero-equipment', 'home', 6).map((e, i) => unit(e, 9 + i * 2, 27));

const ACHIEVEMENTS = [
  ['Bigger Coffers', 3, 10, 10],
  ['Get those Goblins!', 3, 150, 150],
  ['Nice and Tidy', 2, 400, 500],
  ['Heroic Heist', 1, 20000, 100000],
  ['League All-Star', 0, 3, 10],
  ['Friend in Need', 2, 5000, 25000],
  ['Sharing is caring', 1, 2000, 20000],
  ['War Hero', 2, 91, 1000],
];

const player = {
  tag: TAG,
  name: 'DenCT',
  townHallLevel: TH,
  expLevel: 131,
  trophies: 2645,
  bestTrophies: 2911,
  warStars: 91,
  attackWins: 0,
  defenseWins: 0,
  builderHallLevel: 9,
  donations: 0,
  donationsReceived: 0,
  clanCapitalContributions: 545913,
  warPreference: 'in',
  role: 'member',
  league: { id: 29000011, name: 'Crystal League II' },
  clan: { tag: '#2PP', name: 'bruh', clanLevel: 10 },
  heroes,
  troops,
  spells,
  heroEquipment,
  achievements: ACHIEVEMENTS.map(([name, stars, value, target]) => ({
    name,
    stars,
    value,
    target,
    info: '',
  })),
};

const members = Array.from({ length: 24 }, (_, i) => ({
  tag: fakeTag('L', i),
  name: ['Chief', 'Raider', 'Smasher', 'Wizard', 'Archer', 'Barb'][i % 6] + ` ${i + 1}`,
  role: i === 0 ? 'leader' : i < 3 ? 'coLeader' : i < 8 ? 'admin' : 'member',
  townHallLevel: 17 - (i % 6),
  expLevel: 240 - i * 3,
  clanRank: i + 1,
  // Drives the green/red rank movement chevron. Left absent on a few rows so
  // the "no movement yet" branch is exercised too.
  ...(i % 5 === 4 ? {} : { previousClanRank: drift(i + 1) }),
  trophies: 5200 - i * 60,
  builderBaseTrophies: 4100 - i * 44,
  league: {
    id: 29000022,
    name: 'Legend League',
    iconUrls: { medium: `${CDN}/leagues/72/legend.png` },
  },
  donations: 1200 - i * 37,
  donationsReceived: 900 - i * 21,
}));

/** Real district names, in the order the game unlocks them. */
const DISTRICTS = [
  ['Capital Peak', 10],
  ['Barbarian Camp', 5],
  ['Wizard Valley', 5],
  ['Balloon Lagoon', 4],
  ["Builder's Workshop", 4],
  ['Dragon Cliffs', 3],
  ['Golem Quarry', 3],
  ['Skeleton Park', 2],
  ['Goblin Mines', 1],
];

const clan = {
  tag: '#2PP',
  name: 'bruh',
  type: 'inviteOnly',
  description:
    'Chill clan. Wars twice a week, donate what you can, no pressure.\n' +
    '— ⚡Rules⚡ —\n' +
    'Opt out of war if you cannot attack. Two attacks every war, both used.\n' +
    'Capital raids every weekend, all six attacks please.',
  clanLevel: 10,
  clanPoints: 28410,
  clanBuilderBasePoints: 37593,
  clanCapitalPoints: 5379,
  members: members.length,
  requiredTownhallLevel: 12,
  requiredTrophies: 2000,
  warWins: 212,
  warLosses: 98,
  warTies: 6,
  warWinStreak: 3,
  warFrequency: 'always',
  isWarLogPublic: true,
  // Gold II rather than Champion I: Champion I promotes nobody, so the
  // standings' promotion line would never be drawn under test.
  warLeague: { id: 48000011, name: 'Gold League II' },
  capitalLeague: { id: 85000022, name: 'Legend League' },
  location: { name: 'India', countryCode: 'IN', isCountry: true },
  chatLanguage: { id: 75000000, name: 'English', languageCode: 'EN' },
  badgeUrls: {
    small: `${CDN}/badges/70/fixture.png`,
    medium: `${CDN}/badges/200/fixture.png`,
    large: `${CDN}/badges/512/fixture.png`,
  },
  labels: [
    { id: 56000000, name: 'Clan Wars', iconUrls: { medium: `${CDN}/labels/128/wars.png` } },
    { id: 56000001, name: 'Clan War League', iconUrls: { medium: `${CDN}/labels/128/cwl.png` } },
    { id: 56000005, name: 'Trophy Pushing', iconUrls: { medium: `${CDN}/labels/128/push.png` } },
  ],
  clanCapital: {
    capitalHallLevel: 10,
    districts: DISTRICTS.map(([name, level], i) => ({
      id: 70000000 + i,
      name,
      districtHallLevel: level,
    })),
  },
  memberList: members,
};

// `offset` keeps the two rosters' tags distinct -- without it member 3 of each
// side would share a tag, and tapping either would open the same village.
/**
 * One side of a regular war.
 *
 * Attacks carry `defenderTag` and a `bestOpponentAttack` is set on most
 * members, because the rebuilt board reads both: the first to turn an attack
 * into "→ #7", the second for the defence line. Without them every row would
 * render its fallback and the real layout would never be seen.
 */
const warSide = (name, tag, offset = 0) => {
  // Skews the defending side so the two do not post identical totals. A war
  // tied to the decimal reads as a generator artefact, and the war log's
  // win/loss pill would have nothing to colour.
  const skew = offset ? 1 : 0;
  const members = Array.from({ length: 15 }, (_, i) => {
    const enemyAt = (n) => fakeTag('Y', (offset === 0 ? 100 : 0) + (n % 15));
    const used = (i + skew) % 3 === 0 ? 0 : (i + skew) % 3 === 1 ? 2 : 1;
    return {
      tag: fakeTag('Y', offset + i),
      name: `${name} ${i + 1}`,
      mapPosition: i + 1,
      townhallLevel: 17 - (i % 5),
      opponentAttacks: i % 4 === 0 ? 0 : 1,
      attacks: Array.from({ length: used }, (_, a) => ({
        attackerTag: fakeTag('Y', offset + i),
        defenderTag: enemyAt(i + a * 4 + 3),
        stars: a === 0 ? (skew && i % 4 === 0 ? 2 : 3) : 2,
        destructionPercentage: a === 0 ? (skew && i % 4 === 0 ? 81 : 100) : 72 + i,
        order: i * 2 + a + 1,
        duration: 94 + i,
      })),
      ...(i % 4 === 0
        ? {}
        : { bestOpponentAttack: { stars: (i % 3) + 1, destructionPercentage: 60 + i * 2 } }),
    };
  });
  // Totals derived from the roster rather than invented. A scoreboard that
  // disagrees with the rows beneath it reads as an app bug during review.
  return { tag, name, clanLevel: 10, members, ...totals(members, 15) };
};

/**
 * A side's scoreboard, summed from its own members.
 *
 * Every attack in these fixtures hits a distinct defender, so summing attack
 * stars is also the best-per-defender total the API reports. Destruction is
 * averaged over the full roster, which is how the percentage is defined.
 */
function totals(members, size) {
  const all = members.flatMap((m) => m.attacks);
  return {
    attacks: all.length,
    stars: all.reduce((sum, a) => sum + a.stars, 0),
    destructionPercentage:
      Math.round((all.reduce((sum, a) => sum + a.destructionPercentage, 0) / size) * 10) / 10,
  };
}

/**
 * Supercell's compact timestamp form: `20251030T070000.000Z`, which `new Date()`
 * cannot parse. Emitted verbatim here so the app's parser is exercised by the
 * fixtures rather than only by live data nobody on this network can reach.
 */
const apiTime = (date) => `${date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '.000Z')}`;

/** `hours` from now, as an API timestamp. Negative is in the past. */
const hoursFromNow = (hours) => apiTime(new Date(Date.now() + hours * 3600_000));

// Timestamps matter now that the board counts down: without them the clock
// has nothing to render, and the preparation/battle-day branch is unreachable.
const war = {
  state: 'inWar',
  teamSize: 15,
  attacksPerMember: 2,
  preparationStartTime: hoursFromNow(-43),
  startTime: hoursFromNow(-20),
  endTime: hoursFromNow(4),
  clan: warSide('bruh', '#2PP'),
  // Not "#9YQ2": 9 is outside Supercell's tag alphabet, so tapping the
  // opponent on the new war board would 400 before leaving the app.
  opponent: warSide('Rivals', fakeTag('V', 90), 100),
};

/** The Friday 07:00 UTC that opens the raid weekend `weeksAgo` weeks back. */
function raidStart(weeksAgo) {
  const now = new Date();
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 7, 0, 0, 0),
  );
  // Step back to the most recent Friday (day 5), then back by whole weeks.
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - 5 + 7) % 7) - weeksAgo * 7);
  return d;
}

const RAIDERS = [
  'HNT✠KEMALYZ', 'Twitch Lurmii', 'Lurmii', 'CNF Niclas', 'Ninja-Master',
  'CNF Luisa', 'barbara~067~', 'VV NobaEnergy', 'Victorioux', 'Lattenschuss',
  'DeModification', 'Muffin', 'Kaito',
];

/** Clans on the other end of a raid, offence or defence. */
const RAID_CLANS = [
  'BRINGIN JAYO', 'animal brothers', 'UNLV Rebels', 'BISDHAKERZ', 'الصاعقه',
  'MISFITS', 'LAVA SCOPERS', 'Ehrenkrieger', 'zayden d great', 'CLAN OF KINGS',
  'Reckoning', 'Lost Vikings', 'Nine Tails',
];

/**
 * One capital raided, in the shape both `attackLog` and `defenseLog` use --
 * they are identical apart from the clan field being `defender` on offence and
 * `attacker` on defence.
 *
 * Every fifth raid is left unfinished. With all of them perfect the "Perfect
 * raid · all districts" line, the partially filled pip strip and the 1- and
 * 0-star district rows would never render, so three branches of the UI would
 * go untested.
 */
function raidEntry(side, index, seed) {
  const districtCount = DISTRICTS.length;
  const partial = index % 5 === 3;
  const districtsDestroyed = partial ? districtCount - (1 + (index % 3)) : districtCount;

  const districts = DISTRICTS.map(([name, level], d) => {
    const done = d < districtsDestroyed;
    // The one district they got partway through before running out of attacks.
    const contested = d === districtsDestroyed;
    const attackCount = done ? (d === 0 || (d + index + seed) % 3 === 0 ? 3 : 2) : contested ? 2 : 0;

    const attacks = Array.from({ length: attackCount }, (_, a) => {
      const r = (d * 5 + a * 7 + index * 3 + seed) % RAIDERS.length;
      const closer = done && a === attackCount - 1;
      return {
        // Tags line up with the member rows, so tapping an attacker resolves.
        attacker: { tag: fakeTag('Q', r), name: RAIDERS[r] },
        destructionPercent: closer ? 100 : 25 + ((a * 17 + d * 11 + index) % 50),
        stars: closer ? 3 : (a + d) % 3,
      };
    });

    return {
      id: 70000000 + d,
      name,
      districtHallLevel: level,
      destructionPercent: done ? 100 : contested ? 48 : 0,
      stars: done ? 3 : contested ? 1 : 0,
      attackCount,
      // Multipliers are deliberately coarse: a narrow spread rounded to the
      // same "8.8K" on every district, which made the loot column look stuck.
      totalLooted: done
        ? 8800 + ((d * 937 + index * 613 + seed * 311) % 5200)
        : contested
          ? 2400 + ((index * 311) % 900)
          : 0,
      attacks,
    };
  });

  return {
    [side]: {
      tag: fakeTag('C', index * 31 + seed),
      name: RAID_CLANS[(index * 3 + seed) % RAID_CLANS.length],
      // Raid logs call this `level`, not `clanLevel` -- the UI has to read both.
      level: 14 + ((index * 5 + seed) % 21),
      badgeUrls: { medium: `${CDN}/badges/200/raid-${index}.png` },
    },
    attackCount: districts.reduce((n, x) => n + x.attackCount, 0),
    districtCount,
    districtsDestroyed,
    districts,
  };
}

/**
 * The 50 raiders, derived from the weekend's own totals rather than invented
 * separately: attacks are handed out a full set at a time until the log's
 * attack budget runs out, and loot is apportioned so the member rows sum to
 * exactly the loot the districts gave up. Anyone who got no attacks looted
 * nothing, which is what leaves a realistic tail of non-participants.
 */
function raidMembers(totalLoot, totalAttacks, seed) {
  const COUNT = 50;
  let budget = totalAttacks;

  const base = Array.from({ length: COUNT }, (_, i) => {
    const attackLimit = 5;
    const bonusAttackLimit = 1;
    const attacks = Math.max(0, Math.min(attackLimit + bonusAttackLimit, budget));
    budget -= attacks;
    return { i, attackLimit, bonusAttackLimit, attacks };
  });

  // Loot follows a descending curve, zeroed for anyone who never attacked.
  const weights = base.map((m) => (m.attacks > 0 ? Math.max(4, 100 - m.i * 1.7 - (seed % 6)) : 0));
  const weightSum = weights.reduce((a, b) => a + b, 0) || 1;

  let handed = 0;
  return base.map((m, i) => {
    const last = i === COUNT - 1;
    const loot = last
      ? Math.max(0, totalLoot - handed)
      : Math.round((totalLoot * weights[i]) / weightSum);
    handed += loot;
    return {
      tag: fakeTag('Q', m.i),
      name: RAIDERS[m.i % RAIDERS.length] + (m.i < RAIDERS.length ? '' : ` ${m.i}`),
      attacks: m.attacks,
      attackLimit: m.attackLimit,
      bonusAttackLimit: m.bonusAttackLimit,
      capitalResourcesLooted: loot,
    };
  });
}

/**
 * One raid weekend. Totals are summed from the member rows rather than invented
 * separately, so the derived figures the UI shows -- loot per attack, medals,
 * attack completion -- stay internally consistent.
 */
function raidSeason(weeksAgo, { ongoing = false } = {}) {
  // A live weekend brackets "now", which is what makes the app take the
  // countdown's `state: ongoing` branch instead of computing the next Friday.
  // Pinning it to the most recent Friday would only exercise that branch on a
  // Friday-to-Monday run, so the one marked ongoing is placed around now.
  const start = ongoing ? new Date(Date.now() - 12 * 3600000) : raidStart(weeksAgo);
  const end = ongoing
    ? new Date(Date.now() + 60 * 3600000)
    : new Date(start.getTime() + 3 * 86400000);
  const seed = weeksAgo + 1;

  // The logs come first: in the real game every headline figure on this screen
  // is an aggregate of them, so deriving the totals the other way round would
  // let the summary panel and the Attacks list disagree.
  const attackLog = Array.from({ length: 13 }, (_, i) => raidEntry('defender', i, seed));
  const defenseLog = Array.from({ length: 8 }, (_, i) => raidEntry('attacker', i + 5, seed));

  const capitalTotalLoot = attackLog.reduce(
    (n, r) => n + r.districts.reduce((m, d) => m + d.totalLooted, 0),
    0,
  );
  const totalAttacks = attackLog.reduce((n, r) => n + r.attackCount, 0);

  return {
    state: ongoing ? 'ongoing' : 'ended',
    startTime: apiTime(start),
    endTime: apiTime(end),
    capitalTotalLoot,
    raidsCompleted: attackLog.filter((r) => r.districtsDestroyed === r.districtCount).length,
    totalAttacks,
    enemyDistrictsDestroyed: attackLog.reduce((n, r) => n + r.districtsDestroyed, 0),
    offensiveReward: 209 - seed * 4,
    defensiveReward: 264 - seed * 7,
    members: raidMembers(capitalTotalLoot, totalAttacks, seed),
    attackLog,
    defenseLog,
  };
}

// Page one carries a cursor; page two does not, which ends the "Load older"
// chain the way the real API does.
const capitalRaids = {
  items: Array.from({ length: 10 }, (_, i) => raidSeason(i, { ongoing: i === 0 })),
  paging: { cursors: { after: 'Zml4dHVyZS1wYWdlLTI' } },
};
const capitalRaidsPage2 = {
  items: Array.from({ length: 6 }, (_, i) => raidSeason(i + 10)),
  paging: { cursors: {} },
};

const WAR_OPPONENTS = [
  'Confusion', 'ABO_FAHAD CLAN', 'KING MAKER', 'JK EMPIRE', 'July',
  'Reckoning', 'Lost Vikings', 'Nine Tails', 'Red Dawn', 'Valhalla',
];

const warLog = {
  items: Array.from({ length: 10 }, (_, i) => {
    const end = new Date(Date.now() - (i + 1) * 2 * 86400000);
    const teamSize = [15, 20, 30, 15, 25][i % 5];
    const ourStars = teamSize * 3 - (i % 7) * 4;
    const theirStars = teamSize * 3 - ((i + 3) % 9) * 5;
    return {
      result: ourStars > theirStars ? 'win' : ourStars < theirStars ? 'lose' : 'tie',
      endTime: apiTime(end),
      teamSize,
      attacksPerMember: 2,
      clan: {
        tag: '#2PP',
        name: 'bruh',
        clanLevel: 10,
        badgeUrls: { medium: `${CDN}/badges/200/fixture.png` },
        attacks: teamSize * 2 - (i % 5),
        stars: ourStars,
        destructionPercentage: 99.4 - i * 1.7,
        expEarned: 420 - i * 11,
      },
      opponent: {
        tag: fakeTag('V', i),
        name: WAR_OPPONENTS[i % WAR_OPPONENTS.length],
        clanLevel: 18 - (i % 6),
        badgeUrls: { medium: `${CDN}/badges/200/opponent-${i}.png` },
        stars: theirStars,
        destructionPercentage: 97.1 - i * 2.3,
      },
    };
  }),
};

// Rankings. `previousRank` is a real API field -- verified against
// Supercell's live response -- so the up/down movement is genuine data.

// Cycled across the rows so the ladder renders more than one badge. Every
// trophy family appears once, which is what proves the lookup drops the
// roman-numeral tier rather than matching only the exact name.
const TROPHY_LEAGUES = [
  'Legend League',
  'Titan League I',
  'Champion League II',
  'Master League III',
  'Crystal League I',
  'Gold League II',
  'Silver League III',
  'Bronze League I',
];

// Builder Base art is per tier, not per family, so these are deliberately
// spread across tiers as well as families.
const BUILDER_LEAGUES = [
  'Diamond League',
  'Ruby League II',
  'Emerald League III',
  'Platinum League I',
  'Titanium League II',
  'Steel League III',
  'Iron League I',
  'Brass League II',
  'Copper League IV',
  'Stone League V',
  'Clay League III',
  'Wood League V',
];

const playerBoard = (mode) => ({
  items: Array.from({ length: 25 }, (_, i) => ({
    tag: fakeTag('P', i),
    name: `${mode === 'builder' ? 'Builder' : 'Legend'} ${i + 1}`,
    rank: i + 1,
    previousRank: drift(i + 1),
    expLevel: 250 - i,
    townHallLevel: 17 - (i % 3),
    ...(mode === 'builder'
      ? { builderBaseTrophies: 5200 - i * 31 }
      : { trophies: 6200 - i * 23 }),
    clan: {
      tag: fakeTag('G', i),
      name: `Top Clan ${i % 7}`,
      badgeUrls: { medium: `${CDN}/badges/200/placeholder-${i}.png` },
    },
    league: {
      id: 29000022,
      name: TROPHY_LEAGUES[i % TROPHY_LEAGUES.length],
      iconUrls: { medium: `${CDN}/leagues/72/legend.png` },
    },
    // No iconUrls: the builder ladder genuinely has none, which is why the
    // bundled set is the only way this badge ever renders.
    ...(mode === 'builder'
      ? {
          builderBaseLeague: {
            id: 44000040,
            name: BUILDER_LEAGUES[i % BUILDER_LEAGUES.length],
          },
        }
      : {}),
  })),
});

const COUNTRIES = [
  ['United States', 'US'], ['India', 'IN'], ['Iraq', 'IQ'], ['Germany', 'DE'],
  ['Brazil', 'BR'], ['Japan', 'JP'], ['Iran', 'IR'], ['Nicaragua', 'NI'],
];

const clanBoard = (mode) => ({
  items: Array.from({ length: 25 }, (_, i) => {
    const [name, code] = COUNTRIES[i % COUNTRIES.length];
    return {
      tag: fakeTag('J', i),
      name: ['ABO_FAHAD CLAN', 'Confusion', 'KING MAKER', 'JK EMPIRE', 'July'][i % 5] + ` ${i + 1}`,
      rank: i + 1,
      previousRank: drift(i + 1),
      location: { id: 32000000 + i, name, countryCode: code, isCountry: true },
      members: 50 - (i % 14),
      badgeUrls: { medium: `${CDN}/badges/200/clan-${i}.png` },
      ...(mode === 'capital'
        ? { clanCapitalPoints: 3800 - i * 29 }
        : mode === 'builder'
          ? { clanBuilderBasePoints: 61000 - i * 210 }
          : { clanPoints: 303206 - i * 870 }),
    };
  }),
});

const locations = {
  items: [
    { id: 57000000, name: 'Europe', isCountry: false },
    ...COUNTRIES.map(([name, code], i) => ({
      id: 32000000 + i,
      name,
      countryCode: code,
      isCountry: true,
    })),
  ],
};

mkdirSync(OUT, { recursive: true });
/* -------------------------------------------------------------------------- */
/* Clan War League                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Eight clans, seven rounds.
 *
 * The saved account's own clan (#2PP) is one of them, so the screen's "this is
 * you" highlighting has something to match. Town Halls deliberately span 3 to
 * 18: the distribution bars, the legend's end caps and the Town Hall artwork
 * added for levels 1-8 are all unexercised by a roster of maxed accounts.
 *
 * Rounds 1-3 are finished, 4 is being fought and 5 is in preparation. Rounds 6
 * and 7 are left as `#0` placeholders, which is exactly what the API sends for
 * a round that has not been drawn -- and the only way to reach the "Upcoming"
 * and "Not drawn yet" branches.
 */
const LEAGUE_CLANS = [
  { name: 'bruh', tag: '#2PP', level: 10, topTh: 16, size: 17 },
  { name: 'THE DRAGONS', tag: fakeTag('U', 1), level: 18, topTh: 18, size: 15 },
  { name: 'ASTRANAGA', tag: fakeTag('U', 2), level: 26, topTh: 17, size: 20 },
  { name: 'kolok kolok', tag: fakeTag('U', 3), level: 9, topTh: 17, size: 15 },
  { name: 'Вендетта', tag: fakeTag('U', 4), level: 15, topTh: 16, size: 18 },
  { name: 'الهواشم', tag: fakeTag('U', 5), level: 3, topTh: 15, size: 15 },
  { name: 'yenilmezler', tag: fakeTag('U', 6), level: 3, topTh: 14, size: 16 },
  // Deep enough to bottom out at TH3, so the legend's low cap and the Town
  // Hall artwork below level 9 both get exercised.
  { name: 'Moo Im A Cactus', tag: fakeTag('U', 7), level: 7, topTh: 12, size: 20 },
];

const LEAGUE_ROUNDS = 7;
/** Rounds with real war tags; the rest stay as `#0`. */
const DRAWN_ROUNDS = 5;
const ROUND_STATES = ['warEnded', 'warEnded', 'warEnded', 'inWar', 'preparation'];
const LIVE_ROUND = ROUND_STATES.indexOf('inWar');

const leagueClanRecord = (c, index) => ({
  tag: c.tag,
  name: c.name,
  clanLevel: c.level,
  badgeUrls: {
    small: `${CDN}/badges/70/league-${index}.png`,
    medium: `${CDN}/badges/200/league-${index}.png`,
    large: `${CDN}/badges/512/league-${index}.png`,
  },
  // The group's rosters use the clan-roster spelling of the field; the wars
  // below use the war spelling. Both appear on this one screen, which is why
  // `memberTh` reads either.
  members: Array.from({ length: c.size }, (_, i) => ({
    tag: fakeTag('2', index * 64 + i),
    name: `${c.name} ${i + 1}`,
    townHallLevel: Math.max(3, c.topTh - Math.floor(i / 2)),
  })),
});

/** Circle-method round robin: eight clans, a different pairing every round. */
function pairings(count, round) {
  const order = [...Array(count).keys()];
  const rotated = [order[0], ...order.slice(1).map((_, k) => order[1 + ((k + round) % (count - 1))])];
  return Array.from({ length: count / 2 }, (_, i) => [rotated[i], rotated[count - 1 - i]]);
}

function leagueWarSide(clanIndex, round, state, enemyIndex) {
  const c = LEAGUE_CLANS[clanIndex];
  const size = 15;
  const prep = state === 'preparation';
  const fought = state === 'warEnded';
  const members = Array.from({ length: size }, (_, i) => {
      // One attack each: a league war is `attacksPerMember: 1`. How many get
      // used varies with the clan, so two sides of a finished war do not post
      // identical totals -- every result would otherwise be a tie, and the
      // win bonus in the standings would never be awarded to anyone.
      const used = prep
        ? 0
        : fought
          ? ((i + clanIndex) % 6 === 0 ? 0 : 1)
          : i < 5 + (clanIndex % 4)
            ? 1
            : 0;
      return {
        tag: fakeTag('2', clanIndex * 64 + i),
        name: `${c.name} ${i + 1}`,
        mapPosition: i + 1,
        townhallLevel: Math.max(3, c.topTh - Math.floor(i / 2)),
        opponentAttacks: used,
        attacks: Array.from({ length: used }, () => ({
          attackerTag: fakeTag('2', clanIndex * 64 + i),
          defenderTag: fakeTag('2', enemyIndex * 64 + ((i + 2) % size)),
          stars: (i + round + clanIndex) % 4 === 0 ? 2 : 3,
          destructionPercentage: (i + round + clanIndex) % 4 === 0 ? 76 + i : 100,
          order: i + 1,
          duration: 101 + i,
        })),
        ...(used && i % 3 !== 0
          ? { bestOpponentAttack: { stars: (i % 3) + 1, destructionPercentage: 58 + i * 2 } }
          : {}),
      };
  });
  return {
    tag: c.tag,
    name: c.name,
    clanLevel: c.level,
    badgeUrls: { medium: `${CDN}/badges/200/league-${clanIndex}.png` },
    members,
    ...totals(members, size),
  };
}

const leagueWars = {};
const leagueRounds = Array.from({ length: LEAGUE_ROUNDS }, (_, round) => {
  if (round >= DRAWN_ROUNDS) return { warTags: Array(4).fill('#0') };
  const state = ROUND_STATES[round];
  const warTags = pairings(LEAGUE_CLANS.length, round).map(([a, b], pair) => {
    const warTag = fakeTag('0', round * 10 + pair);
    leagueWars[warTag] = {
      state,
      teamSize: 15,
      attacksPerMember: 1,
      // Anchored on the round being fought, so that one is genuinely mid-war
      // rather than already past: it started 6 hours ago and ends in 18. Each
      // neighbouring round is a day either side.
      preparationStartTime: hoursFromNow((round - LIVE_ROUND) * 24 - 24),
      startTime: hoursFromNow((round - LIVE_ROUND) * 24 - 6),
      endTime: hoursFromNow((round - LIVE_ROUND) * 24 + 18),
      warTag,
      clan: leagueWarSide(a, round, state, b),
      opponent: leagueWarSide(b, round, state, a),
    };
    return warTag;
  });
  return { warTags };
});

const leagueGroup = {
  state: 'inWar',
  season: new Date().toISOString().slice(0, 7),
  clans: LEAGUE_CLANS.map(leagueClanRecord),
  rounds: leagueRounds,
};

const files = {
  'coc-player.json': player,
  'coc-clan.json': clan,
  'coc-war.json': war,
  'coc-league-group.json': leagueGroup,
  'coc-league-wars.json': leagueWars,
  'coc-capital-raids.json': capitalRaids,
  'coc-capital-raids-2.json': capitalRaidsPage2,
  'coc-war-log.json': warLog,
  'coc-locations.json': locations,
  'coc-rank-players-home.json': playerBoard('home'),
  'coc-rank-players-builder.json': playerBoard('builder'),
  'coc-rank-clans-home.json': clanBoard('home'),
  'coc-rank-clans-builder.json': clanBoard('builder'),
  'coc-rank-clans-capital.json': clanBoard('capital'),
};
for (const [name, body] of Object.entries(files)) {
  writeFileSync(resolve(OUT, name), `${JSON.stringify(body, null, 2)}\n`);
}
console.log(
  `fixtures: ${Object.keys(files).length} files · ` +
    `${heroes.length} heroes, ${troops.length} troops, ${spells.length} spells, ` +
    `${heroEquipment.length} equipment, ${members.length} clan members, ` +
    `${capitalRaids.items.length}+${capitalRaidsPage2.items.length} raid weekends, ` +
    `${warLog.items.length} logged wars, ` +
    `${LEAGUE_CLANS.length} league clans over ${Object.keys(leagueWars).length} league wars`,
);
