import AsyncStorage from '@react-native-async-storage/async-storage';


export async function readJson<T>(key: string): Promise<T | undefined> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore -- a failed write must not break the interaction that caused it */
  }
}

/**
 * Merge a patch into the object stored at `key`.
 *
 * Mirrors the reference's `save()` helper, which re-read the whole blob and
 * spread the patch over it on every setting change.
 */
export async function patchJson(key: string, patch: object): Promise<void> {
  const current = (await readJson<Record<string, unknown>>(key)) ?? {};
  await writeJson(key, { ...current, ...patch });
}
