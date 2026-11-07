import { record, rows, text, type ApiRecord } from '@/api/game-api';
import { attacksPerMember, memberTh, warSides } from './cwl';

export type Side = 'us' | 'them';

export type AttackEvent = {
  order: number;
  side: Side;
  attacker: ApiRecord;
  defender: ApiRecord;
  stars: number;
  destruction: number;
  duration: number;

  usStars: number;
  themStars: number;
};

export function memberIndex(side: ApiRecord): Map<string, ApiRecord> {
  const index = new Map<string, ApiRecord>();
  for (const m of rows(side['members'])) index.set(text(m['tag']).toUpperCase(), m);
  return index;
}

export function position(member: ApiRecord | undefined): string {
  return member ? text(member['mapPosition']) : '—';
}

export function memberName(member: ApiRecord | undefined, fallback: string): string {
  return member ? text(member['name']) : fallback;
}

/**
 * Every attack in the war, newest first, with the score as it stood after it.
 *
 * Stars count the best result per defender, which is why the score is replayed
 * in `order` rather than summed: a second attack on a base already three-starred
 * adds nothing.
 */
export function warEvents(war: ApiRecord, clanTag?: string): AttackEvent[] {
  const { us, them } = warSides(war, clanTag);
  const usBy = memberIndex(us);
  const themBy = memberIndex(them);

  const raw: { order: number; side: Side; attack: ApiRecord }[] = [];
  for (const [side, army] of [
    ['us', us],
    ['them', them],
  ] as const) {
    for (const m of rows(army['members'])) {
      for (const a of rows(m['attacks'])) {
        raw.push({ order: Number(a['order']) || 0, side, attack: a });
      }
    }
  }
  raw.sort((a, b) => a.order - b.order);

  const best = { us: new Map<string, number>(), them: new Map<string, number>() };
  let usStars = 0;
  let themStars = 0;
  const events: AttackEvent[] = [];

  for (const { order, side, attack } of raw) {
    const stars = Number(attack['stars']) || 0;
    const defTag = text(attack['defenderTag']).toUpperCase();
    const seen = best[side].get(defTag) ?? 0;
    if (stars > seen) {
      best[side].set(defTag, stars);
      if (side === 'us') usStars += stars - seen;
      else themStars += stars - seen;
    }
    const attackerBy = side === 'us' ? usBy : themBy;
    const defenderBy = side === 'us' ? themBy : usBy;
    events.push({
      order,
      side,
      attacker: attackerBy.get(text(attack['attackerTag']).toUpperCase()) ?? {},
      defender: defenderBy.get(defTag) ?? {},
      stars,
      destruction: Number(attack['destructionPercentage']) || 0,
      duration: Number(attack['duration']) || 0,
      usStars,
      themStars,
    });
  }

  return events.reverse();
}


export function stillToAttack(side: ApiRecord, per: number) {
  const members = [...rows(side['members'])].sort(
    (a, b) => (Number(a['mapPosition']) || 0) - (Number(b['mapPosition']) || 0),
  );
  const pending = members.filter((m) => rows(m['attacks']).length < per);
  const left = pending.reduce((n, m) => n + (per - rows(m['attacks']).length), 0);
  return { pending, left };
}


export function starHistogram(side: ApiRecord): number[] {
  const buckets = [0, 0, 0, 0];
  for (const m of rows(side['members'])) {
    for (const a of rows(m['attacks'])) {
      const s = Math.max(0, Math.min(3, Number(a['stars']) || 0));
      buckets[s]! += 1;
    }
  }
  return buckets;
}

export function attackCount(side: ApiRecord): number {
  return rows(side['members']).reduce((n, m) => n + rows(m['attacks']).length, 0);
}

export function avgStars(side: ApiRecord): number {
  const buckets = starHistogram(side);
  const total = buckets.reduce((n, c) => n + c, 0);
  if (!total) return 0;
  return buckets.reduce((sum, count, stars) => sum + count * stars, 0) / total;
}

export function avgDestruction(side: ApiRecord): number {
  const all = rows(side['members']).flatMap((m) => rows(m['attacks']));
  if (!all.length) return 0;
  return all.reduce((n, a) => n + (Number(a['destructionPercentage']) || 0), 0) / all.length;
}


export function memberResult(member: ApiRecord) {
  const made = rows(member['attacks']);
  const taken = record(member['bestOpponentAttack']);
  return { made, taken: taken['stars'] === undefined ? undefined : taken };
}

export function perMember(war: ApiRecord): number {
  return attacksPerMember(war);
}

export function thOf(member: ApiRecord): number {
  return memberTh(member);
}


export function clockDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
