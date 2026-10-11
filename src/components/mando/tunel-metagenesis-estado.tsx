// src/components/mando/tunel-metagenesis-estado.tsx
'use client';

import { useEffect, useState } from 'react';

function tachar(linea: string): string {
  return linea.replace(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g, '[túnel]');
}

export function TunelMetaGenesisEstado() {
  const [estado, setEstado] = useState<{
    cargado: boolean;
    pid: number | null;
    ultimasLineas: string[];
    medidoEn: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  console.log('estado in render:', estado);
  console.log('error in render:', error);

  useEffect(() => {
    let fetchInterval: NodeJS.Timeout;
    let hidden: boolean | undefined;

    const updateVisibility = () => {
      hidden = document.hidden;
      if (!hidden) {
        // If becomes visible, fetch immediately and then set interval
        fetchEstado();
        if (fetchInterval) clearInterval(fetchInterval);
        fetchInterval = setInterval(fetchEstado, 60_000);
      } else {
        // If hidden, clear interval
        if (fetchInterval) clearInterval(fetchInterval);
      }
    };

    const fetchEstado = async () => {
      console.log('fetchEstado called');
      try {
        const res = await fetch('/api/mando/tunel-metagenesis');
        console.log('fetch response:', res);
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        const data = await res.json();
        console.log('fetch data:', data);
        // Apply tachar to ultimasLineas as a safety measure
        setEstado({
          ...data,
          ultimasLineas: data.ultimasLineas.map(tachar),
        });
        console.log('estado set:', { ...data, ultimasLineas: data.ultimasLineas.map(tachar) });
        setError(null);
      } catch (e) {
        console.log('fetch error:', e);
        setError(e instanceof Error ? e.message : 'Unknown error');
        setEstado(null);
      }
    };

    // Initialize visibility state and set up event listener
    hidden = document.hidden;
    document.addEventListener('visibilitychange', updateVisibility);

    // If not hidden initially, start fetching
    if (!hidden) {
      fetchEstado();
      fetchInterval = setInterval(fetchEstado, 60_000);
    }

    // Cleanup
    return () => {
      document.removeEventListener('visibilitychange', updateVisibility);
      if (fetchInterval) clearInterval(fetchInterval);
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-2xl border border-white/10 p-4 text-xs text-white/65">
        Error: {error}
      </div>
    );
  }

  if (!estado) {
    return (
      <div className="rounded-2xl border border-white/10 p-4 text-xs text-white/65">
        Cargando...
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 p-4">
      <div className="flex items-start gap-2 text-xs text-white/65">
        {/* We don't have an icon for tunnel, but we can use a simple text or leave it */}
        <div className="min-w-0 space-y-1">
          <p className="font-semibold text-white">
            Túnel de MetaGenesis:{' '}
            {estado.cargado
              ? ` activo (pid ${estado.pid ?? 'N/A'})`
              : ' parado'}
          </p>
          {/* Show the last lines in a small pre */}
          {estado.ultimasLineas.length > 0 && (
            <pre className="mt-1 text-[10px] text-white/60 break-all w-full">
              {estado.ultimasLineas.map((linea, index) => (
                <span key={index}>{linea}{index < estado.ultimasLineas.length - 1 ? '\n' : ''}</span>
              ))}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}