import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CrShell } from '@/components/cr/CrBits';
import { CrLookup } from '@/components/cr/CrLookup';
import { CrPlayer } from '@/components/cr/CrPlayer';
import type { RootStackParamList } from '@/navigation/routes';

type Props = NativeStackScreenProps<RootStackParamList, 'CrHome'>;

/**
 * Your Clash Royale account.
 *
 * The `key` on CrLookup matters for the same reason it does on the Clash of
 * Clans home screen: arriving from a roster row changes only the tag param,
 * and without a remount the lookup keeps the previous account's override.
 */
export function CrHomeScreen({ route }: Props) {
  const tag = route.params?.tag ?? '';
  return (
    <CrShell>
      <CrLookup key={tag} view="player" initialTag={tag}>
        {(player, resolved) => <CrPlayer player={player} tag={resolved} />}
      </CrLookup>
    </CrShell>
  );
}
