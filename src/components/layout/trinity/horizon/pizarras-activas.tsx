"use client";

/**
 * Pizarras activas, compactas y legibles: crear y abrir rápido, búsqueda y orden cuando hay muchas, y borrado
 * con confirmación en la misma fila (borrar es irreversible: las pizarras locales no tienen papelera).
 * «Abrir» y «Nueva» llevan a la pizarra dentro de la cortina Logic (donde vive su visor).
 */
import { useMemo, useState } from "react";
import { ArrowDownAZ, Clock3, Cloud, Layout, Plus, Search, Trash2 } from "lucide-react";
import { useBoardSystem } from "@/context/board-context";
import { cn } from "@/lib/utils";
import { RUTA_PIZARRAS_NUBE } from "./datos";
import { Seccion } from "./seccion";

/** Con más pizarras que esto aparecen la búsqueda y el orden. */
export const UMBRAL_BUSQUEDA = 4;

const formatearFecha = (ts: number) =>
  new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(ts));

type Orden = "recientes" | "nombre";

interface Props {
  ir: (href: string) => void;
  /** Abre la pizarra en su visor (sin id: la última creada, que `createBoard` deja activa). */
  abrirPizarra: (id?: string) => void;
}

export function PizarrasActivas({ ir, abrirPizarra }: Props) {
  const { boards, createBoard, deleteBoard } = useBoardSystem();
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<Orden>("recientes");
  const [confirmando, setConfirmando] = useState<string | null>(null);

  const crear = () => {
    createBoard(`Nueva Pizarra ${boards.length + 1}`);
    abrirPizarra();
  };

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const lista = q ? boards.filter((b) => b.name.toLowerCase().includes(q)) : [...boards];
    return orden === "nombre"
      ? lista.sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }))
      : lista.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [boards, busqueda, orden]);

  const muchas = boards.length > UMBRAL_BUSQUEDA;

  const acciones = (
    <div className="flex shrink-0 items-center gap-1">
      <BotonCabecera onClick={() => ir(RUTA_PIZARRAS_NUBE)} icono={<Cloud className="h-4 w-4" aria-hidden="true" />}>
        Nube
      </BotonCabecera>
      <BotonCabecera onClick={crear} icono={<Plus className="h-4 w-4" aria-hidden="true" />} destacado>
        Nueva
      </BotonCabecera>
    </div>
  );

  return (
    <Seccion titulo="Pizarras" icono={Layout} insignia={boards.length ? String(boards.length) : undefined} acciones={acciones}>
      {muchas && (
        <div className="mb-2 flex items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Buscar pizarras</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-200/50" aria-hidden="true" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar pizarra…"
              className="h-11 w-full rounded-full border border-emerald-400/20 bg-black/30 pl-9 pr-3 text-sm text-emerald-50 outline-none transition-colors duration-150 placeholder:text-emerald-100/40 focus:border-lime-300/60 focus-visible:ring-2 focus-visible:ring-lime-300/50"
            />
          </label>
          <button
            type="button"
            onClick={() => setOrden((o) => (o === "recientes" ? "nombre" : "recientes"))}
            aria-label={orden === "recientes" ? "Ordenadas por recientes: cambiar a orden alfabético" : "Ordenadas A–Z: cambiar a recientes"}
            title={orden === "recientes" ? "Más recientes primero" : "Orden alfabético"}
            className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full border border-emerald-400/20 text-emerald-200/80 outline-none transition-colors duration-150 hover:bg-emerald-400/10 focus-visible:ring-2 focus-visible:ring-lime-300/60"
          >
            {orden === "recientes" ? <Clock3 className="h-4 w-4" aria-hidden="true" /> : <ArrowDownAZ className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
      )}

      {boards.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-emerald-400/20 px-4 py-6 text-center text-sm text-emerald-100/55">
          <Layout className="h-7 w-7 opacity-40" aria-hidden="true" />
          <p>Aún no hay pizarras.</p>
          <button type="button" onClick={crear} className="min-h-[44px] cursor-pointer rounded-full px-4 text-emerald-300 underline-offset-4 transition-colors duration-150 hover:text-emerald-200 hover:underline">
            Crear la primera
          </button>
        </div>
      ) : visibles.length === 0 ? (
        <p role="status" className="rounded-2xl border border-dashed border-emerald-400/20 px-4 py-5 text-center text-sm text-emerald-100/55">
          Ninguna pizarra se llama así.
        </p>
      ) : (
        <ul className="custom-scrollbar max-h-64 space-y-1.5 overflow-y-auto overscroll-contain pr-0.5" aria-label="Pizarras guardadas">
          {visibles.map((b) =>
            confirmando === b.id ? (
              <li key={b.id} className="flex min-h-[52px] items-center gap-2 rounded-2xl border border-red-400/40 bg-red-500/10 px-3 py-1.5">
                <p className="min-w-0 flex-1 truncate text-xs text-red-100">¿Borrar «{b.name}»?</p>
                <button
                  type="button"
                  onClick={() => { deleteBoard(b.id); setConfirmando(null); }}
                  className="min-h-[44px] cursor-pointer rounded-full bg-red-500/80 px-3 text-xs font-semibold text-white outline-none transition-colors duration-150 hover:bg-red-500 focus-visible:ring-2 focus-visible:ring-red-200"
                >
                  Borrar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmando(null)}
                  className="min-h-[44px] cursor-pointer rounded-full px-3 text-xs text-red-100/80 outline-none transition-colors duration-150 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-red-200"
                >
                  Cancelar
                </button>
              </li>
            ) : (
              <li key={b.id} className="group flex min-h-[52px] items-center rounded-2xl border border-emerald-400/10 bg-black/30 transition-colors duration-150 hover:border-emerald-300/35 hover:bg-emerald-500/10">
                <button
                  type="button"
                  onClick={() => abrirPizarra(b.id)}
                  aria-label={`Abrir la pizarra ${b.name}`}
                  className="flex min-h-[52px] min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-2xl px-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-lime-300/60"
                >
                  <span aria-hidden="true" className="h-8 w-1 shrink-0 rounded-full bg-emerald-500/50 transition-colors duration-150 group-hover:bg-lime-300" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-emerald-50">{b.name}</span>
                    <span className="block truncate text-[11px] text-emerald-200/50">
                      {formatearFecha(b.updatedAt)} · {b.widgets.length} {b.widgets.length === 1 ? "elemento" : "elementos"}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Borrar la pizarra ${b.name}`}
                  onClick={() => setConfirmando(b.id)}
                  className={cn(
                    "mr-1 grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full text-red-300/70 outline-none transition-[opacity,background-color] duration-150 hover:bg-red-500/15 hover:text-red-200 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-red-300/60",
                    "opacity-70 md:opacity-0 md:group-hover:opacity-100",
                  )}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ),
          )}
        </ul>
      )}
    </Seccion>
  );
}

function BotonCabecera({ onClick, icono, children, destacado }: { onClick: () => void; icono: React.ReactNode; children: React.ReactNode; destacado?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-lime-300/60",
        destacado ? "text-lime-300 hover:bg-lime-300/10" : "text-emerald-300/80 hover:bg-emerald-400/10 hover:text-emerald-200",
      )}
    >
      {icono}
      {children}
    </button>
  );
}
