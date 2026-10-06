import { useCallback, useState } from 'react';
import { ApiError } from '../api/client';

export interface Notice {
  kind: 'success' | 'error' | 'info';
  text: string;
}

/** Run an API call, track busy state and turn the result or error into a user-facing notice. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const run = useCallback(async <T,>(fn: () => Promise<T>, success?: (r: T) => string): Promise<T | null> => {
    setBusy(true);
    setNotice(null);
    try {
      const r = await fn();
      if (success) setNotice({ kind: 'success', text: success(r) });
      return r;
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof ApiError ? e.message : 'Something went wrong.' });
      return null;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, notice, setNotice, run };
}
