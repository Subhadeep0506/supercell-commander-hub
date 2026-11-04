import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CrShell } from '@/components/cr/CrBits';
import { CrLookup } from '@/components/cr/CrLookup';
import { CrDecks } from '@/components/cr/CrDecks';
import type { RootStackParamList } from '@/navigation/routes';

type Props = NativeStackScreenProps<RootStackParamList, 'CrDecks'>;

/** Decks played, the whole collection, and the builder. */
export function CrDecksScreen({ route }: Props) {
  const tag = route.params?.tag ?? '';
  return (
    <CrShell>
      <CrLookup key={tag} view="player" initialTag={tag}>
        {(player, resolved) => <CrDecks player={player} tag={resolved} />}
      </CrLookup>
    </CrShell>
  );
}
