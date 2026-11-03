import { useEffect, useRef } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CocShell } from '@/components/coc/CocBits';
import { CocLookup } from '@/components/coc/CocLookup';
import { useDetailSheet } from '@/components/coc/clan/DetailSheetProvider';
import type { RootStackParamList } from '@/navigation/routes';

type Props = NativeStackScreenProps<RootStackParamList, 'CocClan'>;

/**
 * Ported from frontend/src/routes/coc_.clan.tsx.
 *
 * The screen itself is still the clan *finder* -- search by name or tag, with
 * the saved account's clan offered as a card. The profile is a sheet now.
 *
 * Arriving with `?tag=` opens that sheet directly, which is what keeps the
 * reference app's deep links (`/coc/clan?tag=%232PP`) landing on the clan
 * rather than on an empty search box.
 */
export function CocClanScreen({ route }: Props) {
  const tag = route.params?.tag ?? '';
  const { openClan } = useDetailSheet();

  // Guarded so closing the sheet does not immediately reopen it on the next
  // render, and so returning to this screen later does not reopen it either.
  const opened = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!tag || opened.current === tag) return;
    opened.current = tag;
    openClan(tag);
  }, [tag, openClan]);

  return (
    <CocShell title="Clan">
      <CocLookup key={tag} view="clan" initialTag={tag} />
    </CocShell>
  );
}
