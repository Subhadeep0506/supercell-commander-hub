import type { LinkingOptions } from '@react-navigation/native';
import { ROUTE_PATHS, type RootStackParamList } from './routes';


export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['supercellcommanderhub://', 'https://commanderhub.local'],
  config: { screens: ROUTE_PATHS },
};
