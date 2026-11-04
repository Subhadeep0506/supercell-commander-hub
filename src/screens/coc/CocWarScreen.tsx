import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CocShell } from '@/components/coc/CocBits';
import { CocLookup } from '@/components/coc/CocLookup';
import type { RootStackParamList } from '@/navigation/routes';

type Props = NativeStackScreenProps<RootStackParamList, 'CocWar'>;

/** Ported from frontend/src/routes/coc_.war.tsx. */
export function CocWarScreen({ route }: Props) {
  const tag = route.params?.tag ?? '';
  return (
    <CocShell>
      <CocLookup key={tag} view="war" initialTag={tag} />
    </CocShell>
  );
}
