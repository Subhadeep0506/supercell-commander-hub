import { useEffect, useState } from 'react';

/**
 * Milliseconds remaining until `target`, re-rendering once a second.
 *
 * The interval is torn down once the target passes, so a sheet left open on a
 * finished raid weekend stops waking the component up every second.
 */
export function useCountdown(target?: Date): number {
  const time = target?.getTime();
  const [remaining, setRemaining] = useState(() => (time ? time - Date.now() : 0));

  useEffect(() => {
    if (!time) return;
    setRemaining(time - Date.now());
    if (time <= Date.now()) return;
    const id = setInterval(() => {
      const left = time - Date.now();
      setRemaining(left);
      if (left <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [time]);

  return remaining;
}
