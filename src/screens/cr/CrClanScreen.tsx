import { useEffect, useRef } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { text } from '@/api/game-api';
import { CrShell } from '@/components/cr/CrBits';
import { CrLookup } from '@/components/cr/CrLookup';
import { CrClanPanel } from '@/components/cr/CrClan';
import { useDetailSheet } from '@/components/detail/DetailSheetProvider';
import type { RootStackParamList } from '@/navigation/routes';

type Props = NativeStackScreenProps<RootStackParamList, 'CrClan'>;

/**
 * Your clan, inline.
 *
 * Unlike the Clash of Clans clan screen -- which is a finder, with every clan
 * living in the sheet -- this resolves your own clan off the saved player and
 * renders it here, with River Race as a tab. Other clans still open in the
 * sheet, so the two behaviours do not conflict.
 *
 * Arriving with `?tag=` opens that clan in the sheet, which keeps deep links
 * landing on the clan they name rather than on yours.
 */
export function CrClanScreen({ route }: Props) {
  const tag = route.params?.tag ?? '';
  const { openClan } = useDetailSheet();

  // Guarded so closing the sheet does not immediately reopen it, and so
  // returning to this screen later does not either.
  const opened = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!tag || opened.current === tag) return;
    opened.current = tag;
    openClan(tag, 'cr');
  }, [tag, openClan]);

  return (
    <CrShell>
      <CrLookup view="clan">
        {(clan) => <CrClanPanel clan={clan} tag={text(clan['tag'])} />}
      </CrLookup>
    </CrShell>
  );
}
