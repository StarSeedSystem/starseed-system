"use client";

import { useEffect, useState } from "react";

export function TunelMetagenesisEstado() {
  const [estado, setEstado] = useState<{
    cargado: boolean;
    pid: number | null;
    ultimasLineas: string[];
    medidoEn: string;
  } | null>(null);

  useEffect(() => {
    let fetchInterval: NodeJS.Timeout;
    const fetchData = async () => {
      try {
        const res = await fetch("/api/mando/tunel-metagenesis");
        if (res.ok) {
          const data = await res.json();
          setEstado(data);
        }
      } catch (err) {
        console.error("Error fetching tunnel status:", err);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchData();
        fetchInterval = setInterval(fetchData, 60_000);
      } else {
        clearInterval(fetchInterval);
      }
    };

    // Initial fetch if the tab is already visible
    if (document.visibilityState === "visible") {
      fetchData();
      fetchInterval = setInterval(fetchData, 60_000);
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      clearInterval(fetchInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  if (estado === null) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-xs text-white/65">
        Cargando estado del túnel de MetaGenesis...
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-xs text-white/65">
      <div className="mb-2">
        {estado.cargado ? (
          <span>Túnel de MetaGenesis: activo (pid {estado.pid})</span>
        ) : (
          <span>Túnel de MetaGenesis: parado</span>
        )}
      </div>
      {estado.ultimasLineas.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 font-semibold text-white/80">Últimas líneas:</p>
          <pre className="text-[10px] overflow-auto max-h-24 bg-black/40 p-2 rounded">
            {estado.ultimasLineas.map((line, idx) => (
              <div key={idx}>{line}</div>
            ))}
          </pre>
        </div>
      )}
    </div>
  );
}