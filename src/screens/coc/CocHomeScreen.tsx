import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CocShell } from '@/components/coc/CocBits';
import { CocLookup } from '@/components/coc/CocLookup';
import type { RootStackParamList } from '@/navigation/routes';

type Props = NativeStackScreenProps<RootStackParamList, 'CocHome'>;

/**
 * Ported from frontend/src/routes/coc.tsx.
 *
 * The `key` on CocLookup matters: arriving from a clan member row changes only
 * the tag param, and without remounting the lookup would keep the previous
 * account's override state.
 */
export function CocHomeScreen({ route }: Props) {
  const tag = route.params?.tag ?? '';
  return (
    <CocShell>
      <CocLookup key={tag} initialTag={tag} />
    </CocShell>
  );
}
