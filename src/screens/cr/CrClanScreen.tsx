import { useEffect, useRef } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CrShell } from '@/components/cr/CrBits';
import { CrLookup } from '@/components/cr/CrLookup';
import { CrClanCard } from '@/components/cr/CrClanCard';
import { useDetailSheet } from '@/components/detail/DetailSheetProvider';
import type { RootStackParamList } from '@/navigation/routes';

type Props = NativeStackScreenProps<RootStackParamList, 'CrClan'>;

/**
 * The Royale clan finder.
 *
 * This screen used to render your own clan expanded in place -- banner, the
 * Overview / Members / Race / Log tabs, all of it -- while every other clan
 * opened in the sheet. That made the same clan look like two different things
 * depending on how you arrived at it, and it was the one place where Royale
 * and Clash of Clans disagreed about what a clan screen is.
 *
 * Now both games match: search and filters at the top, your clan offered as a
 * card beneath, and the full profile in the sheet wherever it is opened from.
 * `CrClanPanel` still renders that profile -- its only caller is CrLayers.
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
        {(clan) => <CrClanCard clan={clan} label="Your clan" />}
      </CrLookup>
    </CrShell>
  );
}
