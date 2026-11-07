import { BsShell } from '@/components/bs/BsBits';
import { BsLeaderboard } from '@/components/bs/BsLeaderboard';

/** Global players, global clubs, and the 111 per-brawler ladders. */
export function BsLeaderboardScreen() {
  return (
    <BsShell>
      <BsLeaderboard />
    </BsShell>
  );
}
