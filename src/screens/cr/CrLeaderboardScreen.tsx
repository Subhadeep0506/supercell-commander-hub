import { CrShell } from '@/components/cr/CrBits';
import { CrLeaderboard } from '@/components/cr/CrLeaderboard';

/** Path of Legend, the mode ladders, and the two clan ladders. */
export function CrLeaderboardScreen() {
  return (
    <CrShell>
      <CrLeaderboard />
    </CrShell>
  );
}
