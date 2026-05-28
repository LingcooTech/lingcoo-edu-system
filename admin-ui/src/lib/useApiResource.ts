import { useEffect, useState } from 'react';

import { api } from '@/api/client';

export function useApiResource<T>(path: string, key: string) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api<Record<string, T[]>>(path)
      .then((payload) => {
        if (!active) return;
        setData(payload[key] ?? []);
        setError(null);
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [path, key]);

  return { data, loading, error, setData };
}
