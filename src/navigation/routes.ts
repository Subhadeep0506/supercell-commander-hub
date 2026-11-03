/**
 * Route names and params for the root stack.
 *
 * `tag` is optional on the three lookup screens, carried through as a query
 * param so the reference app's deep links keep working: a clan member row
 * links to /coc?tag=%232PP, and that URL must still open the right village
 * after a refresh or when pasted into a new tab.
 */
export type RootStackParamList = {
  Today: undefined;
  Passport: undefined;
  CocHome: { tag?: string } | undefined;
  CocWar: { tag?: string } | undefined;
  CocWarRound: { tag?: string; round?: number } | undefined;
  CocClan: { tag?: string } | undefined;
  CocLeaderboard: undefined;
  CocBuilder: undefined;
  CocBook: undefined;
  CrHome: undefined;
  BsHome: undefined;
};

export type RouteName = keyof RootStackParamList;

/**
 * Route name -> browser path, identical to the reference app's URLs.
 *
 * Deliberately all-static: a dynamic `:game` segment would also swallow
 * /passport and every typo'd path.
 */
export const ROUTE_PATHS: Record<RouteName, string> = {
  CocLeaderboard: 'coc/leaderboard',
  CocBuilder: 'coc/builder',
  CocBook: 'coc/book',
  CocWarRound: 'coc/war/round',
  CocWar: 'coc/war',
  CocClan: 'coc/clan',
  CocHome: 'coc',
  CrHome: 'cr',
  BsHome: 'bs',
  Passport: 'passport',
  Today: '',
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
