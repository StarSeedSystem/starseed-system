"use client";

/**
 * herramientas-lista.tsx — el catálogo real de `HerramientaDisponible[]`
 * (`GET /api/genesis/herramientas`, punto 3 del encargo de OLA 2).
 *
 * Cada herramienta dice si está disponible DE VERDAD y, si no, por qué. Este
 * fichero traduce eso a la interfaz con una regla sin excepciones: una
 * herramienta con `disponible !== true` se pinta como NO disponible, con su
 * `motivo` siempre visible al lado (nunca escondido, nunca en blanco) — no
 * se lista nunca como si funcionara. Agrupado por `fuente`, en el mismo
 * orden en que Alex las nombró: OS, usuario, dispositivo, web.
 *
 * Puramente de lectura: el contrato no da ningún endpoint para cambiar una
 * herramienta desde aquí — lo que el sistema realmente tiene es esto.
 *
 * Global, no por ser (el endpoint no lleva `{id}`), así que — igual que
 * `propuestas-bandeja.tsx` — este componente se planta con su propia tarjeta
 * y su propio título: se puede montar directamente, sin que un contenedor
 * externo tenga que envolverlo.
 */
import { Bot, Ban, CircleCheck, FolderHeart, HardDrive, Library, Wrench, Globe as WebIcon, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HerramientaDisponible } from "@/lib/astraura/genesis-types";
import { Badge, CARD, Empty, SUB, SectionTitle } from "../../s158/shared";
import { agruparHerramientasPorFuente, motivoNoDisponible, resumirHerramientas } from "./herramientas-logic";

const ICONO_FUENTE: Record<string, LucideIcon> = {
  "biblioteca-os": Library,
  "biblioteca-usuario": FolderHeart,
  dispositivo: HardDrive,
  web: WebIcon,
  nativa: Bot,
};

function HerramientaRow({ h }: { h: HerramientaDisponible }) {
  const disponible = h.disponible === true;
  return (
    <div className={cn(SUB, "flex items-start gap-2 px-3 py-2")}>
      {disponible ? (
        <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden="true" />
      ) : (
        <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-[11px] font-medium text-white/90">{h.nombre || "(sin nombre)"}</p>
          <Badge tone={disponible ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100" : "border-rose-400/30 bg-rose-500/10 text-rose-100"}>
            {disponible ? "disponible" : "no disponible"}
          </Badge>
          {h.requierePermiso && <Badge tone="border-amber-400/30 bg-amber-500/10 text-amber-100">requiere: {h.requierePermiso}</Badge>}
        </div>
        {h.descripcion && <p className="mt-0.5 text-[10px] leading-snug text-white/55">{h.descripcion}</p>}
        {/* Nunca se lista como si funcionara: el motivo real (o uno honesto por defecto) va siempre visible aquí. */}
        {!disponible && <p className="mt-0.5 text-[10px] leading-snug text-rose-200/75">{motivoNoDisponible(h)}</p>}
      </div>
    </div>
  );
}

export interface HerramientasListaProps {
  lista: HerramientaDisponible[] | null | undefined;
  loading?: boolean;
  error?: string;
}

export function HerramientasLista({ lista, loading, error }: HerramientasListaProps) {
  const seguras = Array.isArray(lista) ? lista : [];
  const resumen = resumirHerramientas(seguras);
  const grupos = agruparHerramientasPorFuente(seguras);

  return (
    <div className={cn(CARD, "space-y-2 p-3")}>
      <SectionTitle
        icon={Wrench}
        title={`Herramientas (${resumen.disponibles} de ${resumen.total} disponibles)`}
        tone="text-amber-300"
        hint="Lo que el sistema realmente tiene, agrupado por de dónde viene. Una herramienta no disponible se ve como no disponible, con su razón."
      />

      {seguras.length === 0 && <Empty loading={loading} error={error} text="Sin herramientas todavía: si no hay ninguna, es que el backend no expone ninguna ahora mismo." />}

      {grupos.map((g) => {
        const Icon = ICONO_FUENTE[g.fuente] ?? Wrench;
        return (
          <div key={g.fuente} className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/50">
              <Icon className="h-3 w-3 shrink-0" aria-hidden="true" /> {g.etiqueta} <span className="font-normal normal-case text-white/35">· {g.herramientas.length}</span>
            </p>
            <div className="space-y-1">
              {g.herramientas.map((h) => (
                <HerramientaRow key={h.id} h={h} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default HerramientasLista;
