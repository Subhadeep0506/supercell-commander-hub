import { CocShell } from '@/components/coc/CocBits';
import { ClashBook } from '@/components/coc/ClashBook';

/** Ported from frontend/src/routes/coc_.book.tsx. */
export function CocBookScreen() {
  return (
    <CocShell>
      <ClashBook />
    </CocShell>
  );
}
