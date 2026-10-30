import { useEffect, useState } from "react";
import type { ResumenRecursos } from "@/lib/mando/recursos-red";

export function PanelRecursosRed() {
  const [data, setData] = useState<ResumenRecursos | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/mando/recursos-red", { cache: "no-store" })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ResumenRecursos>;
      })
      .then(setData)
      .catch(e => setError(String(e)));
  }, []);

  if (error) return <div className="p-4 text-red-500">Error: {error}</div>;
  if (!data) return <div className="p-4">Cargando recursos…</div>;

  return (
    <div className="p-4 space-y-6">
      <h2 className="text-lg font-semibold">Recursos de la red</h2>

      <section>
        <h3 className="font-medium mb-2">Ofertas visibles por medio</h3>
        <ul className="space-y-1">
          {data.ofertasPorMedio.map(o => (
            <li key={o.medio} className="flex gap-2 text-sm cursor-pointer">
              <span className="font-mono">{o.medio}</span>
              <span>{o.total} total</span>
              <span className="text-zinc-400">medidos {o.medidos}</span>
              <span className="text-zinc-400">sin medir {o.sinMedir}</span>
            </li>
          ))}
          {data.ofertasPorMedio.length === 0 && <li className="text-sm text-zinc-500">Sin ofertas</li>}
        </ul>
      </section>

      <section>
        <h3 className="font-medium mb-2">Préstamos vivos</h3>
        <ul className="space-y-1">
          {data.prestamosVivos.map(p => (
            <li key={p.id} className="text-sm cursor-pointer">
              {p.recurso} en {p.medio} ({p.id})
            </li>
          ))}
          {data.prestamosVivos.length === 0 && <li className="text-sm text-zinc-500">Sin préstamos</li>}
        </ul>
      </section>

      <section>
        <h3 className="font-medium mb-2">Volúmenes con réplicas bajas</h3>
        <ul className="space-y-1">
          {data.volumenesBajos.map(v => (
            <li key={v.id} className="text-sm cursor-pointer">
              {v.id}: {v.actual} / {v.deseadas}
            </li>
          ))}
          {data.volumenesBajos.length === 0 && <li className="text-sm text-zinc-500">Todos al día</li>}
        </ul>
      </section>
    </div>
  );
}
