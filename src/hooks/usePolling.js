import { useEffect, useRef } from 'react';

// Lightweight polling — keeps views fresh now that all data
// flows through the Express API instead of direct DB subscriptions.
export function usePolling(fn, intervalMs = 5000) {
  const ref = useRef(fn);
  ref.current = fn;

  useEffect(() => {
    const id = setInterval(() => ref.current(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}
