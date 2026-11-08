import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { HubProvider } from '@/state/HubProvider';
import { ThemeProvider } from '@/theme/ThemeProvider';
import {
  CrownPair,
  CrownRecord,
  Metric,
  MetricGrid,
  PlayerPortrait,
  Podium,
  RankRow,
  modeIcon,
} from '@/components/cr/CrBits';
import { CopyBar } from '@/components/cr/CrCards';
import { LoadMore, usePaged } from '@/components/ui/Paged';

/**
 * Render tests for the shared Royale pieces.
 *
 * These exist for one failure mode the browser checks cannot see: React Native
 * throws on a raw string rendered as a child of a View, where react-native-web
 * only logs a warning. A component that puts a conditional figure next to an
 * icon -- which is every crown component below -- is exactly the shape that
 * slips through a browser-only pass and crashes on a phone.
 *
 * So the assertion is mostly "it renders at all", with the surrounding `act`
 * surfacing the invariant. The numbers are checked too, because a crown
 * component that renders an empty box would otherwise pass.
 */
/**
 * HubProvider is here for the click sound in Tabs/Collapsible/Button, not for
 * the theme. ThemeProvider used to read the active game off the hub; it no
 * longer does, which is what the theme suite below pins down.
 */
const wrap = (node: React.ReactElement) => (
  <HubProvider>
    <ThemeProvider>{node}</ThemeProvider>
  </HubProvider>
);

const render = async (node: React.ReactElement) => {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(wrap(node));
  });
  return tree!;
};

/** Every string the tree renders, flattened. */
const texts = (tree: ReactTestRenderer.ReactTestRenderer): string[] =>
  tree.root.findAllByType('Text' as never).flatMap((n) => {
    const kids = Array.isArray(n.props.children) ? n.props.children : [n.props.children];
    return kids.filter((c: unknown) => typeof c === 'string' || typeof c === 'number').map(String);
  });

describe('crown figures', () => {
  it('renders a record as two figures, not two crowns per win', async () => {
    const tree = await render(<CrownRecord wins={17} losses={11} />);
    const out = texts(tree).join(' ');
    expect(out).toContain('17');
    expect(out).toContain('11');
    // One image per figure. Seventeen crowns for seventeen wins was the thing
    // this component exists to rule out.
    expect(tree.root.findAllByType('Image' as never)).toHaveLength(2);
  });

  it('adds draws as a suffix with no crown of their own', async () => {
    const tree = await render(<CrownRecord wins={1} losses={2} draws={3} />);
    expect(texts(tree).join(' ')).toContain('· 3D');
    expect(tree.root.findAllByType('Image' as never)).toHaveLength(2);
  });

  it('renders a pair, and an em-dash for a missing side', async () => {
    const tree = await render(<CrownPair mine={3} theirs={null} />);
    const out = texts(tree).join(' ');
    expect(out).toContain('3');
    expect(out).toContain('—');
  });
});

describe('PlayerPortrait', () => {
  it('falls back to a framed icon when there is no art', async () => {
    const tree = await render(<PlayerPortrait player={null} />);
    expect(tree.toJSON()).toBeTruthy();
  });

  it('takes a clan crest from context when the record has none', async () => {
    // memberList rows carry an arena but no clan field; an unmapped arena id
    // has to fall through to the crest rather than straight to the king.
    const tree = await render(
      <PlayerPortrait player={{ arena: { id: 99999999 } }} badgeId={16000000} />,
    );
    expect(tree.toJSON()).toBeTruthy();
  });
});

describe('Metric', () => {
  it('passes a scalar through num()', async () => {
    const tree = await render(
      <MetricGrid>
        <Metric label="Battles" value={1234} />
      </MetricGrid>,
    );
    expect(texts(tree).join(' ')).toContain('1,234');
  });

  it('renders an element value without wrapping it in a Text', async () => {
    const tree = await render(
      <MetricGrid>
        <Metric label="Record" value={<CrownRecord wins={2} losses={0} />} />
      </MetricGrid>,
    );
    expect(texts(tree).join(' ')).toContain('Record');
    expect(tree.root.findAllByType('Image' as never)).toHaveLength(2);
  });
});

describe('RankRow art', () => {
  it('accepts an element and renders it', async () => {
    const tree = await render(
      <RankRow title="Someone" art={<PlayerPortrait player={null} size={20} />} />,
    );
    expect(texts(tree).join(' ')).toContain('Someone');
  });

  it('still treats a bare string as an image source', async () => {
    // Not a guard to relax: Metro resolves a bundled image to a numeric asset
    // id but Vite resolves it to a URL **string**, so narrowing this branch to
    // numbers and objects drops every row's art on web and nowhere else.
    const tree = await render(<RankRow title="Someone" art={'/img/x.webp' as never} />);
    expect(tree.root.findAllByType('Image' as never)).toHaveLength(1);
  });
});

describe('Podium', () => {
  const place = (rank: number) => ({
    key: `p${rank}`,
    rank,
    art: <PlayerPortrait player={null} size={20} />,
    name: `Player ${rank}`,
    subtitle: 'member',
    score: rank * 100,
    onPress: () => {},
  });

  it('renders three places in 2-1-3 order', async () => {
    const tree = await render(<Podium icon="trophy" places={[1, 2, 3].map(place)} />);
    const names = texts(tree).filter((v) => v.startsWith('Player '));
    expect(names).toEqual(['Player 2', 'Player 1', 'Player 3']);
  });

  it('renders nothing with fewer than three', async () => {
    const tree = await render(<Podium icon="trophy" places={[1, 2].map(place)} />);
    expect(tree.toJSON()).toBeNull();
  });
});

describe('usePaged', () => {
  const items = Array.from({ length: 26 }, (_, i) => i);

  function Harness({ resetKey }: { resetKey: string }) {
    const paged = usePaged(items, resetKey);
    return (
      <>
        <RankRow title={`shown ${paged.shown.length} of ${items.length}`} />
        <LoadMore remaining={paged.remaining} onPress={paged.loadMore} />
      </>
    );
  }

  it('shows the first page and counts the rest', async () => {
    const tree = await render(<Harness resetKey="a" />);
    const out = texts(tree).join(' ');
    expect(out).toContain('shown 10 of 26');
    expect(out).toContain('Load 10 more · 16 left');
  });

  it('grows a page at a time, and the last page is short', async () => {
    const tree = await render(<Harness resetKey="a" />);
    const press = () =>
      ReactTestRenderer.act(() => {
        tree.root
          .findAll((n) => n.props?.accessibilityLabel === 'Load more')[0]!
          .props.onPress();
      });
    await press();
    expect(texts(tree).join(' ')).toContain('shown 20 of 26');
    // Six left, so the button offers six rather than a flat ten.
    expect(texts(tree).join(' ')).toContain('Load 6 more · 6 left');
    await press();
    expect(texts(tree).join(' ')).toContain('shown 26 of 26');
  });

  it('collapses back to one page when the filter changes', async () => {
    const tree = await render(<Harness resetKey="a" />);
    await ReactTestRenderer.act(() => {
      tree.root
        .findAll((n) => n.props?.accessibilityLabel === 'Load more')[0]!
        .props.onPress();
    });
    expect(texts(tree).join(' ')).toContain('shown 20 of 26');
    // A different sort or search hands back the same rows in a new order, so
    // staying on page two would leave the user mid-list in a list that no
    // longer means what it did.
    await ReactTestRenderer.act(() => {
      tree.update(wrap(<Harness resetKey="b" />));
    });
    expect(texts(tree).join(' ')).toContain('shown 10 of 26');
  });

  it('renders no button when nothing is hidden', async () => {
    function Short() {
      const paged = usePaged([1, 2], 'x');
      return <LoadMore remaining={paged.remaining} onPress={paged.loadMore} />;
    }
    const tree = await render(<Short />);
    expect(tree.toJSON()).toBeNull();
  });
});

describe('modeIcon', () => {
  it('gives every mode name some art', () => {
    for (const name of ['Ladder', 'Merge Tactics', '2v2', 'Retro Royale', 'Nonsense Mode']) {
      expect(modeIcon(name)).toBeDefined();
    }
  });
});

/*
 * The copy bar's three states.
 *
 * The maxed one is gold, and **no card in the captured fixture is maxed**, so
 * the browser checks can never reach that branch -- this is the only place it
 * is exercised at all. Its ink is `royale.onHighlight` rather than
 * `foreground`, because on the dark scheme `foreground` is near-white and
 * would sit at roughly 1.6:1 on gold.
 */
describe('CopyBar', () => {
  it('says Max for a card at its ceiling', async () => {
    const tree = await render(<CopyBar card={{ level: 14, maxLevel: 14, count: 0 }} />);
    expect(texts(tree).join(' ')).toContain('Max');
  });

  it('counts copies towards the next level otherwise', async () => {
    const tree = await render(<CopyBar card={{ level: 3, maxLevel: 14, count: 7 }} />);
    expect(texts(tree).join(' ')).toContain('7');
  });
});
