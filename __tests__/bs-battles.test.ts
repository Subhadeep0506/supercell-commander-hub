import { record, rows } from '@/api/game-api';
import {
  battleTypeLabel,
  byBrawler,
  byMode,
  isRankedType,
  modeLabel,
  normalizeBattle,
  normalizeBattles,
  parseBattleTime,
  rankedTierName,
  summarize,
} from '@/lib/bs-battles';
import { brawlerMeta, collection, collectionSummary, rankBand, rankProgress } from '@/lib/bs-brawlers';
import { modeArt, rankArt } from '@/assets/brawl';

/**
 * The Brawl Stars battle log, run over the REAL captured responses.
 *
 * Every assertion that names a number here was read off
 * native/brawl-stars-player-api-dump_v2.json, not invented. If one starts
 * failing after a recapture, the API changed, not us.
 *
 * Four of these exist specifically because the bug they guard renders
 * *plausibly wrong* rather than crashing -- an inverted team, a mislabelled
 * ladder, a zero that should be a dash. None of them would be caught by the
 * type system or by the browser checks.
 *
 * Captured 2026-11-06 from #Q8R0UP09R.
 */

import playerJson from '../scripts/fixtures/bs-player.json';
import battlelogJson from '../scripts/fixtures/bs-battlelog.json';
import catalogJson from '../scripts/fixtures/bs-brawlers.json';
import ghostJson from '../scripts/fixtures/bs-player-ghost.json';

const ME = '#Q8R0UP09R';
const battles = normalizeBattles(battlelogJson.items, ME);

describe('the capture itself', () => {
  it('has the 23 battles the dump reports', () => {
    expect(battles).toHaveLength(23);
  });

  it('finds the player in every battle', () => {
    // If this fails, the tag threading is broken and every "my team" render
    // downstream is meaningless.
    expect(battles.every((b) => b.me !== undefined)).toBe(true);
  });
});

/*
 * ---- trap 1: team order is arbitrary ------------------------------------
 */
describe('team order', () => {
  it('does not put the player in teams[0]', () => {
    // The whole point. Battle index 22 of the capture has the player second.
    const elsewhere = battles.filter((b) => b.shape === 'team' && b.myTeamIndex !== 0);
    expect(elsewhere.length).toBeGreaterThan(0);
  });

  it('reads a defeat correctly when the player is in teams[1]', () => {
    const battle = battles[22]!;
    expect(battle.myTeamIndex).toBe(1);
    expect(battle.result).toBe('defeat');
    expect(battle.me?.tag).toBe(ME);
  });

  it('does not put the winner in teams[0] either', () => {
    // Battle 1 is a defeat with the player in teams[0]: "first team won" is
    // as wrong as "first team is mine".
    const battle = battles[1]!;
    expect(battle.myTeamIndex).toBe(0);
    expect(battle.result).toBe('defeat');
  });

  it('locates the player by tag regardless of case', () => {
    const battle = normalizeBattle(battlelogJson.items[22]!, ME.toLowerCase());
    expect(battle.myTeamIndex).toBe(1);
  });
});

/*
 * ---- trap 2: battle.mode is not event.mode ------------------------------
 */
describe('mode', () => {
  it('reports what was played, not the event slot', () => {
    const showdown = battles.find((b) => b.mode === 'soloShowdown')!;
    expect(showdown.mode).toBe('soloShowdown');
    // The event this ran in is megaShowdown / modeId 75.
    expect(showdown.eventModeId).toBe(75);
    expect(showdown.modeLabel).toBe('Solo Showdown');
  });

  it('keeps the event mode id for the icon', () => {
    const duo = battles.find((b) => b.mode === 'duoShowdown')!;
    expect(duo.eventModeId).toBe(86);
    // 48000000 + modeId. Resolving proves the offset and the bundle together.
    expect(modeArt(duo.eventModeId)).toBeDefined();
  });

  it('folds mega and ordinary showdown into one mode group', () => {
    const modes = byMode(battles).map((m) => m.key);
    expect(modes).toContain('soloShowdown');
    expect(modes).not.toContain('megaShowdown');
  });

  it('spells camelCase modes out', () => {
    expect(modeLabel('brawlBall')).toBe('Brawl Ball');
    expect(modeLabel('megaDuoShowdown')).toBe('Mega Duo Showdown');
    expect(modeLabel('brawlBall5V5')).toBe('Brawl Ball 5v5');
  });
});

/*
 * ---- trap 3: trophyChange is optional -----------------------------------
 */
describe('trophy change', () => {
  it('is undefined, not zero, where the service omitted it', () => {
    // Two of the 23 have no trophyChange at all.
    const missing = battles.filter((b) => b.trophyChange === undefined);
    expect(missing).toHaveLength(2);
    expect(battles[20]!.trophyChange).toBeUndefined();
    expect(battles[22]!.trophyChange).toBeUndefined();
  });

  it('counts only the battles that reported one', () => {
    const summary = summarize(battles);
    expect(summary.total).toBe(23);
    expect(summary.trophyCounted).toBe(21);
  });
});

/*
 * ---- trap 4: "ranked" is the trophy ladder ------------------------------
 */
describe('battle type', () => {
  it('calls type=ranked a trophy match', () => {
    expect(battleTypeLabel('ranked')).toBe('Trophies');
  });

  it('calls soloRanked and teamRanked the Ranked queue', () => {
    expect(battleTypeLabel('soloRanked')).toBe('Ranked');
    expect(battleTypeLabel('teamRanked')).toBe('Ranked');
  });

  it('passes an unsampled type through rather than guessing', () => {
    // friendly/challenge/tournament exist but are in neither capture.
    expect(battleTypeLabel('friendly')).toBe('Friendly');
    expect(battleTypeLabel('challenge')).toBe('Challenge');
  });

  it('labels the capture the way a player would read it', () => {
    expect(battles[0]!.type).toBe('ranked');
    expect(battles[0]!.typeLabel).toBe('Trophies');
    expect(battles[22]!.type).toBe('soloRanked');
    expect(battles[22]!.typeLabel).toBe('Ranked');
  });
});

/*
 * ---- trap 5: a Ranked match has no trophies -----------------------------
 *
 * The service sends a trophy count and a Ranked tier under the same key,
 * `brawler.trophies`, and only the battle type says which. The capture makes
 * the difference obvious once you look: the trophy ladder carries 1049-1508,
 * the Ranked match carries 7-8. Rendered as trophies, a power-11 brawler owned
 * "8" of them; it is Gold II.
 */
describe('ranked tiers', () => {
  it('separates the competitive queue from the trophy ladder', () => {
    expect(isRankedType('soloRanked')).toBe(true);
    expect(isRankedType('teamRanked')).toBe(true);
    // The one that inverts the whole feature if it goes wrong.
    expect(isRankedType('ranked')).toBe(false);
  });

  it('names the tiers the captures attest', () => {
    // rankedRank/rankedRankName pairs read off the two player dumps.
    expect(rankedTierName(1)).toBe('Bronze I');
    expect(rankedTierName(4)).toBe('Silver I');
    expect(rankedTierName(7)).toBe('Gold I');
    expect(rankedTierName(8)).toBe('Gold II');
  });

  it('keeps the three-step families aligned', () => {
    expect(rankedTierName(3)).toBe('Bronze III');
    expect(rankedTierName(6)).toBe('Silver III');
    expect(rankedTierName(9)).toBe('Gold III');
    expect(rankedTierName(10)).toBe('Diamond I');
    expect(rankedTierName(18)).toBe('Legendary III');
  });

  it('returns nothing rather than a wrong name off the end of the table', () => {
    expect(rankedTierName(0)).toBeUndefined(); // unranked, per the captures
    expect(rankedTierName(-1)).toBeUndefined();
    expect(rankedTierName(99)).toBeUndefined();
    expect(rankedTierName(undefined)).toBeUndefined();
    expect(rankedTierName(1.5)).toBeUndefined();
  });

  it('every tier it names has a badge to draw', () => {
    for (let rank = 1; rank <= 20; rank++) {
      const name = rankedTierName(rank);
      if (name) expect(rankArt(name)).toBeDefined();
    }
  });

  it('reads a Ranked battle number as a tier, never as trophies', () => {
    const ranked = battles[22]!;
    expect(ranked.type).toBe('soloRanked');
    const all = ranked.teams.flat();
    expect(all).toHaveLength(6);
    for (const p of all) {
      expect(p.trophies).toBeUndefined();
      expect(p.rankedRank).toBeDefined();
    }
    // 7 and 8 in the capture -- Gold I and Gold II.
    expect(rankedTierName(all[0]!.rankedRank)).toBe('Gold II');
  });

  it('still reads the trophy ladder as trophies', () => {
    const ladder = battles[0]!;
    expect(ladder.type).toBe('ranked');
    for (const p of ladder.teams.flat()) {
      expect(p.rankedRank).toBeUndefined();
      expect(p.trophies).toBeDefined();
    }
    // Four figures, which is what a trophy count looks like.
    expect(ladder.teams.flat()[0]!.trophies).toBe(1049);
  });

  it('treats every team alike, not just the first', () => {
    /*
     * Guards `rows(team).map(participant)`. Array.map hands the callback the
     * index as its second argument, which would arrive as the `ranked` flag --
     * false for team 0 and true for every team after it. The screen would show
     * one team in trophies and the other in tiers, which looks plausible
     * enough to survive a glance.
     */
    const ranked = battles[22]!;
    expect(ranked.teams).toHaveLength(2);
    for (const team of ranked.teams) {
      expect(team.length).toBeGreaterThan(0);
      for (const p of team) expect(p.rankedRank).toBeDefined();
    }
  });
});

/* ---- the three shapes --------------------------------------------------- */

describe('battle shapes', () => {
  it('reads a team battle as two teams with a result', () => {
    const battle = battles[0]!;
    expect(battle.shape).toBe('team');
    expect(battle.teams).toHaveLength(2);
    expect(battle.teams[0]).toHaveLength(3);
    expect(battle.result).toBe('victory');
    expect(battle.duration).toBe(44);
    expect(battle.rank).toBeUndefined();
  });

  it('reads duo showdown as ten teams of two with a rank', () => {
    const battle = battles[5]!;
    expect(battle.shape).toBe('showdown');
    expect(battle.teams).toHaveLength(10);
    expect(battle.teams[0]).toHaveLength(2);
    expect(battle.rank).toBe(8);
    expect(battle.result).toBeUndefined();
    expect(battle.duration).toBeUndefined();
  });

  it('wraps solo showdown players one per team', () => {
    const battle = battles[15]!;
    expect(battle.shape).toBe('showdown');
    expect(battle.teams).toHaveLength(20);
    expect(battle.teams.every((t) => t.length === 1)).toBe(true);
    expect(battle.rank).toBe(7);
  });

  it('places showdown entrants by finishing position', () => {
    // myIndex === rank - 1 holds for all 15 showdown battles in the capture,
    // so the list needs no sorting of its own.
    const showdowns = battles.filter((b) => b.rank !== undefined);
    expect(showdowns).toHaveLength(15);
    expect(showdowns.every((b) => b.myTeamIndex === (b.rank ?? 0) - 1)).toBe(true);
  });
});

describe('star player', () => {
  it('is read even when it is an opponent', () => {
    expect(battles[0]!.starPlayer?.name).toBe('まなあ');
    expect(battles[0]!.isStarPlayer).toBe(false);
  });

  it('is absent from every showdown', () => {
    expect(battles.filter((b) => b.rank !== undefined).every((b) => !b.starPlayer)).toBe(true);
  });

  it('survives a player literally named ERROR 404', () => {
    // The capture's owner is called "ERROR 404". A name is not a status.
    const named = battles.find((b) => b.starPlayer?.name === 'ERROR 404');
    expect(named).toBeDefined();
    expect(named!.isStarPlayer).toBe(true);
  });
});

describe('battle time', () => {
  it('parses the compact form the service uses', () => {
    const at = parseBattleTime('20261106T183115.000Z');
    expect(at?.toISOString()).toBe('2026-11-06T18:31:15.000Z');
  });

  it('rejects the raw string rather than producing an Invalid Date', () => {
    // Date.parse of the compact form is NaN on every engine the app runs on.
    expect(parseBattleTime('not a date')).toBeUndefined();
    expect(parseBattleTime(undefined)).toBeUndefined();
  });

  it('dates every battle in the capture', () => {
    expect(battles.every((b) => b.at instanceof Date)).toBe(true);
  });
});

describe('derived stats', () => {
  it('rates only the battles that were decided', () => {
    const summary = summarize(battles);
    // 8 team battles carry victory/defeat; the other 15 are showdowns, which
    // have a placement instead and must not be counted as losses.
    expect(summary.decided).toBe(8);
    expect(summary.wins).toBe(6);
    expect(summary.losses).toBe(2);
    expect(summary.winRate).toBeCloseTo(0.75);
    expect(summary.showdowns).toBe(15);
  });

  it('groups by the brawler the player used, not by everyone in the lobby', () => {
    const groups = byBrawler(battles);
    const played = groups.reduce((n, g) => n + g.played, 0);
    expect(played).toBe(23);
    // Twenty opponents in a solo showdown must not each become a group.
    expect(groups.length).toBeLessThan(10);
  });
});

/* ---- the brawler metadata ---------------------------------------------- */

describe('brawler metadata', () => {
  const entries = collection(catalogJson.items, playerJson.brawlers);

  it('covers every brawler the live catalog returns', () => {
    expect(entries).toHaveLength(111);
    expect(entries.every((e) => e.rarity && e.className)).toBe(true);
  });

  it('resolves the rarities and classes a player would recognise', () => {
    expect(brawlerMeta(16000003)).toMatchObject({ class: 'marksman', rarity: 'rare' }); // Brock
    expect(brawlerMeta(16000043)).toMatchObject({ class: 'assassin', rarity: 'epic' }); // Edgar
    expect(brawlerMeta(16000108)).toMatchObject({ class: 'controller', rarity: 'mega_epic' }); // Wendy
  });

  it('keeps locked brawlers in the collection', () => {
    const summary = collectionSummary(entries);
    expect(summary.owned).toBe(108);
    expect(summary.total).toBe(111);
    expect(entries.filter((e) => !e.owned)).toHaveLength(3);
  });

  it('sums brawler trophies to exactly the player total', () => {
    // True on every captured account, so the contribution breakdown needs no
    // second source and cannot disagree with the headline figure.
    expect(collectionSummary(entries).trophies).toBe(playerJson.trophies);
  });
});

describe('ranked bands', () => {
  it('places the captured account in its real band', () => {
    // rankedRank 7 / 1968 Elo / "GOLD I".
    expect(rankBand(7)).toMatchObject({ name: 'Gold I', minElo: 1500, maxElo: 1999 });
    expect(rankProgress(7, 1968)).toBeCloseTo((1968 - 1500) / 499, 3);
  });

  it('draws no meter at the top of the ladder', () => {
    // Pro carries maxElo 0 to mean "no ceiling", not an empty range.
    expect(rankProgress(22, 12000)).toBeUndefined();
  });

  it('finds art for every rank family', () => {
    expect(rankArt('GOLD I')).toBeDefined();
    expect(rankArt('Mythic III')).toBeDefined();
    expect(rankArt('masters ii')).toBeDefined();
  });
});

/* ---- the ghost ---------------------------------------------------------- */

describe('a reset account', () => {
  it('answers 200 with every optional field missing', () => {
    const ghost = record(ghostJson as unknown);
    expect(ghost['trophies']).toBe(0);
    expect(ghost['expLevel']).toBe(1);
    // Absent, not null -- and `club` is an empty object rather than missing.
    expect('nameColor' in ghost).toBe(false);
    expect('rankedRankName' in ghost).toBe(false);
    expect(record(ghost['club'])).toEqual({});
    expect(rows(ghost['brawlers'])).toHaveLength(1);
  });

  it('still collapses into a full collection', () => {
    const entries = collection(catalogJson.items, (ghostJson as { brawlers: unknown }).brawlers);
    expect(entries).toHaveLength(111);
    expect(collectionSummary(entries).owned).toBe(1);
  });
});
