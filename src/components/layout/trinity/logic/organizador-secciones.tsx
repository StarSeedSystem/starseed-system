"use client";

/**
 * Organizador de secciones: subir, bajar, ocultar o mostrar cada una, y volver al orden de fábrica.
 * Cada fila tiene tres botones de 44 px. Nunca se puede ocultar la última sección visible.
 */
import { ArrowDown, ArrowUp, Eye, EyeOff, RotateCcw, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilaOrganizador {
  id: string;
  rotulo: string;
  icono: LucideIcon;
  oculta: boolean;
}

interface Props {
  filas: FilaOrganizador[];
  onMover: (id: string, dir: -1 | 1) => void;
  onAlternarOculta: (id: string) => void;
  onRestaurar: () => void;
  /** Aviso cuando se intentó ocultar la última sección. */
  aviso?: string | null;
}

const BOTON =
  "grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-lg text-amber-100/60 outline-none transition-colors duration-150 hover:bg-white/10 hover:text-amber-50 focus-visible:ring-2 focus-visible:ring-amber-300/70 disabled:cursor-not-allowed disabled:opacity-30";

export function OrganizadorSecciones({ filas, onMover, onAlternarOculta, onRestaurar, aviso }: Props) {
  return (
    <section aria-label="Organizar las secciones" data-testid="organizador-secciones" className="mb-4 rounded-2xl border border-amber-300/20 bg-black/40 p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="m-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200/80">Secciones del panel</h3>
        <button
          type="button"
          onClick={onRestaurar}
          title="Restaurar orden y visibilidad por defecto"
          className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-lg px-2 text-[12px] text-amber-100/60 outline-none transition-colors duration-150 hover:text-amber-50 focus-visible:ring-2 focus-visible:ring-amber-300/70"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Restaurar
        </button>
      </div>
      <ul className="space-y-1.5">
        {filas.map((f, i) => {
          const Icono = f.icono;
          return (
            <li
              key={f.id}
              data-fila={f.id}
              className={cn(
                "flex items-center gap-1 rounded-xl border pl-3 transition-opacity duration-150",
                f.oculta ? "border-white/5 bg-white/[0.02] opacity-60" : "border-white/10 bg-white/[0.04]",
              )}
            >
              <Icono className="h-4 w-4 shrink-0 text-amber-200" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate pl-1 text-[13px] font-medium text-amber-50">
                {f.rotulo}
                {f.oculta && <span className="ml-2 text-[11px] font-normal text-amber-100/55">oculta</span>}
              </span>
              <button type="button" onClick={() => onMover(f.id, -1)} disabled={i === 0} title="Subir" aria-label={`Subir ${f.rotulo}`} className={BOTON}>
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => onMover(f.id, 1)} disabled={i === filas.length - 1} title="Bajar" aria-label={`Bajar ${f.rotulo}`} className={BOTON}>
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => onAlternarOculta(f.id)}
                title={f.oculta ? "Mostrar" : "Ocultar"}
                aria-label={f.oculta ? `Mostrar ${f.rotulo}` : `Ocultar ${f.rotulo}`}
                className={BOTON}
              >
                {f.oculta ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              </button>
            </li>
          );
        })}
      </ul>
      <p role="status" className="mt-2 min-h-[1rem] text-[11px] leading-snug text-amber-100/60">
        {aviso ?? "Lo que ocultes sigue disponible: vuelve a mostrarlo aquí."}
      </p>
    </section>
  );
}
