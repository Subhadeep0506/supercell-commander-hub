import { useEffect, useRef } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BsShell } from '@/components/bs/BsBits';
import { BsLookup } from '@/components/bs/BsLookup';
import { BsClub } from '@/components/bs/BsClub';
import { useDetailSheet } from '@/components/detail/DetailSheetProvider';
import type { RootStackParamList } from '@/navigation/routes';

type Props = NativeStackScreenProps<RootStackParamList, 'BsClub'>;

/**
 * Your club.
 *
 * Unlike the other two games' clan tabs there is **no finder here**: Brawl
 * Stars exposes no club search endpoint, and `gameRequestSchema` rejects
 * `clanSearch` for `bs`. So this tab is your own club, rendered in place, and
 * other clubs are reached the only way the API allows -- through a player who
 * is in one.
 *
 * Arriving with `?tag=` opens that club in the sheet instead, which keeps the
 * deep links from roster rows and battle opponents landing on the club they
 * name rather than on yours.
 */
export function BsClubScreen({ route }: Props) {
  const tag = route.params?.tag ?? '';
  const { openClan } = useDetailSheet();

  // Guarded so closing the sheet does not immediately reopen it, and so
  // returning to this screen later does not either -- same as CrClanScreen.
  const opened = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!tag || opened.current === tag) return;
    opened.current = tag;
    openClan(tag, 'bs');
  }, [tag, openClan]);

  return (
    <BsShell>
      <BsLookup view="clan">{(club) => <BsClub club={club} />}</BsLookup>
    </BsShell>
  );
}
