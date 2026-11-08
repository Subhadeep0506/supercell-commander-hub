import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HubProvider, useHub, type Passport } from '@/state/HubProvider';

/**
 * The passport list: storage shape, migration, and the four operations.
 *
 * The migration case is the one that has to be covered here and nowhere else.
 * Every browser check now seeds the *new* `{ passports, activeId }` shape, so
 * nothing else in the suite exercises the single-`passport` key that every
 * build before this one wrote -- and getting it wrong silently empties the
 * passport of anyone upgrading.
 */
const KEY = 'sch';

let hub: ReturnType<typeof useHub>;
function Probe() {
  hub = useHub();
  return null;
}

/** Mounts the provider and waits for the async read-back to land. */
async function mount() {
  let tree: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <HubProvider>
        <Probe />
      </HubProvider>,
    );
  });
  // `ready` flips in a promise chain, so one more flush is needed.
  await ReactTestRenderer.act(async () => {});
  return tree!;
}

const stored = async () => JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}');
const act = (fn: () => void) => ReactTestRenderer.act(() => { fn(); });

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('migration from the single-passport key', () => {
  it('promotes an existing passport to the first list entry and activates it', async () => {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({ passport: { name: 'Chief', coc: '#2PP', cr: '#ABC', bs: '' } }),
    );
    await mount();

    expect(hub.passports).toHaveLength(1);
    expect(hub.passport.name).toBe('Chief');
    expect(hub.passport.coc).toBe('#2PP');
    // An id is minted on the way through -- the old shape had none, and the
    // active pointer and list keys both hang off it.
    expect(hub.passport.id).toBeTruthy();
    expect(hub.passports[0]!.id).toBe(hub.passport.id);
  });

  it('ignores an empty legacy passport rather than listing a blank row', async () => {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({ passport: { name: '', coc: '', cr: '', bs: '' } }),
    );
    await mount();
    expect(hub.passports).toEqual([]);
  });

  it('prefers the list when both shapes are present', async () => {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({
        passport: { name: 'Old', coc: '#OLD', cr: '', bs: '' },
        passports: [{ id: 'a', name: 'New', coc: '#NEW', cr: '', bs: '' }],
        activeId: 'a',
      }),
    );
    await mount();
    expect(hub.passports.map((p) => p.name)).toEqual(['New']);
  });

  it('falls back to the first entry when activeId points at nothing', async () => {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({
        passports: [
          { id: 'a', name: 'A', coc: '', cr: '', bs: '' },
          { id: 'b', name: 'B', coc: '', cr: '', bs: '' },
        ],
        activeId: 'gone',
      }),
    );
    await mount();
    expect(hub.passport.name).toBe('A');
  });
});

describe('saving', () => {
  it('adds a passport and makes it active', async () => {
    await mount();
    await act(() => hub.savePassport({ name: 'Main', coc: '#2PP', cr: '', bs: '' }));

    expect(hub.passports).toHaveLength(1);
    expect(hub.passport.name).toBe('Main');
    expect((await stored()).activeId).toBe(hub.passport.id);
  });

  it('overwrites the entry with the same name instead of adding a twin', async () => {
    await mount();
    await act(() => hub.savePassport({ name: 'Main', coc: '#AAA', cr: '', bs: '' }));
    const first = hub.passport.id;
    await act(() => hub.savePassport({ name: 'main', coc: '#BBB', cr: '', bs: '' }));

    // Case-insensitive, and the id survives so the active pointer still holds.
    expect(hub.passports).toHaveLength(1);
    expect(hub.passports[0]!.coc).toBe('#BBB');
    expect(hub.passports[0]!.id).toBe(first);
  });

  it('reports whether it replaced', async () => {
    await mount();
    let out!: { replaced: boolean };
    await act(() => {
      out = hub.savePassport({ name: 'Main', coc: '', cr: '#A', bs: '' });
    });
    expect(out.replaced).toBe(false);
    await act(() => {
      out = hub.savePassport({ name: 'Main', coc: '', cr: '#B', bs: '' });
    });
    expect(out.replaced).toBe(true);
  });

  it('keeps separate names apart', async () => {
    await mount();
    await act(() => hub.savePassport({ name: 'Main', coc: '#AAA', cr: '', bs: '' }));
    await act(() => hub.savePassport({ name: 'Alt', coc: '#BBB', cr: '', bs: '' }));
    expect(hub.passports.map((p) => p.name)).toEqual(['Main', 'Alt']);
  });
});

describe('setPassport, used when a searched tag is adopted', () => {
  it('updates the active record rather than adding one', async () => {
    await mount();
    await act(() => hub.savePassport({ name: 'Main', coc: '', cr: '', bs: '' }));
    const id = hub.passport.id;

    await act(() => hub.setPassport({ ...hub.passport, coc: '#LJ9V8LCYQ' }));

    expect(hub.passports).toHaveLength(1);
    expect(hub.passport.id).toBe(id);
    expect(hub.passport.coc).toBe('#LJ9V8LCYQ');
  });

  it('creates the first passport when nothing is saved at all', async () => {
    await mount();
    // A user who types a tag on Home before ever opening Passport still has to
    // end up with a record, or the tag has nowhere to live.
    await act(() => hub.setPassport({ ...hub.passport, coc: '#2PP' }));
    expect(hub.passports).toHaveLength(1);
    expect(hub.passport.coc).toBe('#2PP');
  });
});

describe('editing and deleting', () => {
  const two = async () => {
    await act(() => hub.savePassport({ name: 'Main', coc: '#AAA', cr: '', bs: '' }));
    await act(() => hub.savePassport({ name: 'Alt', coc: '#BBB', cr: '', bs: '' }));
  };

  it('edits by id without moving the active pointer', async () => {
    await mount();
    await two();
    await act(() => hub.activatePassport(hub.passports[0]!.id));
    const target = hub.passports[1]!.id;

    await act(() => hub.updatePassport(target, { name: 'Renamed', coc: '#CCC', cr: '', bs: '' }));

    expect(hub.passports[1]!.name).toBe('Renamed');
    expect(hub.passport.name).toBe('Main');
  });

  it('promotes the next passport when the active one is deleted', async () => {
    await mount();
    await two();
    expect(hub.passport.name).toBe('Alt');

    await act(() => hub.deletePassport(hub.passport.id));

    // Never left resolving screens from an id that no longer exists.
    expect(hub.passports).toHaveLength(1);
    expect(hub.passport.name).toBe('Main');
  });

  it('leaves the active one alone when another is deleted', async () => {
    await mount();
    await two();
    await act(() => hub.deletePassport(hub.passports[0]!.id));
    expect(hub.passport.name).toBe('Alt');
  });

  it('falls back to the empty default once the last one goes', async () => {
    await mount();
    await two();
    await act(() => hub.deletePassport(hub.passports[1]!.id));
    await act(() => hub.deletePassport(hub.passports[0]!.id));

    expect(hub.passports).toEqual([]);
    expect(hub.passport.coc).toBe('');
  });

  it('ignores activating an id that is not in the list', async () => {
    await mount();
    await two();
    await act(() => hub.activatePassport('nonsense'));
    expect(hub.passport.name).toBe('Alt');
  });
});

describe('persistence', () => {
  it('writes the list and survives a remount', async () => {
    await mount();
    await act(() => hub.savePassport({ name: 'Main', coc: '#2PP', cr: '#ABC', bs: '' }));
    const saved: { passports: Passport[]; activeId: string } = await stored();
    expect(saved.passports).toHaveLength(1);
    expect(saved.activeId).toBe(saved.passports[0]!.id);

    await mount();
    expect(hub.passport.name).toBe('Main');
    expect(hub.passport.cr).toBe('#ABC');
  });

  it('does not disturb the other settings in the blob', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ game: 'cr', sound: true }));
    await mount();
    await act(() => hub.savePassport({ name: 'Main', coc: '#2PP', cr: '', bs: '' }));

    const saved = await stored();
    expect(saved.game).toBe('cr');
    expect(saved.sound).toBe(true);
    expect(saved.passports).toHaveLength(1);
  });
});
