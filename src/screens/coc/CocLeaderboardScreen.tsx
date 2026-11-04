import { CocShell } from '@/components/coc/CocBits';
import { CocLeaderboard } from '@/components/coc/CocLeaderboard';

/** Ported from frontend/src/routes/coc_.leaderboard.tsx. */
export function CocLeaderboardScreen() {
  return (
    <CocShell>
      <CocLeaderboard />
    </CocShell>
  );
}
