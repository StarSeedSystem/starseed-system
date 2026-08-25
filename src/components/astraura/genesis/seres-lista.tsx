"use client";

/**
 * seres-lista.tsx — la lista de seres: avatar, estado, generación,
 * comunidad y experiencia de cada uno (punto 2 del encargo). Cada fila abre
 * su ficha; el botón "Nuevo ser" abre el ritual de creación.
 *
 * Sin datos de ejemplo: si el backend no tiene seres todavía, se dice con
 * palabras — nunca se pintan seres inventados para "que se vea bonito".
 */
import dynamic from "next/dynamic";
import { Plus, RefreshCw, Sparkles, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Comunidad, SerListado } from "@/lib/astraura/genesis-types";
import { fetchGenesisComunidades, fetchGenesisSeres, type GenesisTarget } from "@/lib/astraura/genesis-client";
import { BTN, BTN_PRIMARY, Badge, CARD, Empty, SUB, SectionTitle, useS158Load } from "../s158/shared";
import { adnDeSer, nivelEvolutivoLabel, nombrePorId } from "./genesis-logic";
import { EstadoSerBadge } from "./genesis-shared";

// `SerAvatarSlot` monta un <Canvas> WebGL (react-three-fiber): no es
// SSR-safe, así que se difiere igual que el resto de paneles 3D del OS.
const SerAvatarSlot = dynamic(() => import("./ser-avatar-slot"), {
  ssr: false,
  loading: () => <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-white/10" aria-hidden="true" />,
});

function SerRow({ ser, comunidades, onAbrir }: { ser: SerListado; comunidades: Comunidad[]; onAbrir: (id: string) => void }) {
  const adn = adnDeSer(ser);
  const nombresComunidades = (ser.comunidades ?? []).map((id) => nombrePorId(id, comunidades));
  return (
    <button
      type="button"
      onClick={() => onAbrir(ser.id)}
      className={cn(SUB, "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:border-cyan-400/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400/70")}
      aria-label={`Abrir la ficha de ${ser.nombre}`}
    >
      <SerAvatarSlot ser={ser} tamano={48} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-[13px] font-medium text-white/90">{ser.nombre}</p>
          <EstadoSerBadge estado={ser.estado} />
        </div>
        <p className="truncate text-[10px] text-white/55">{ser.rol || "sin rol definido"}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge tone="border-white/10 bg-white/[0.03] text-white/60">gen. {ser.generacion}</Badge>
          <Badge tone="border-amber-400/25 bg-amber-500/10 text-amber-100/90">{ser.experiencia} exp · {nivelEvolutivoLabel(adn.evolucion)}</Badge>
          {nombresComunidades.slice(0, 2).map((n, i) => (
            <Badge key={`${n}-${i}`} tone="border-violet-400/25 bg-violet-500/10 text-violet-100/90">{n}</Badge>
          ))}
          {nombresComunidades.length > 2 && <Badge tone="border-white/10 bg-white/[0.03] text-white/50">+{nombresComunidades.length - 2}</Badge>}
          {nombresComunidades.length === 0 && <span className="text-[10px] text-white/35">sin comunidad</span>}
        </div>
      </div>
    </button>
  );
}

export function SeresLista({ target, onAbrir, onCrear }: { target: GenesisTarget; onAbrir: (id: string) => void; onCrear: () => void }) {
  const seres = useS158Load(fetchGenesisSeres, target, 20_000);
  const comunidades = useS158Load(fetchGenesisComunidades, target, 60_000);
  const lista = seres.data ?? [];
  const comunidadesLista = comunidades.data ?? [];

  return (
    <div className={cn(CARD, "p-3")}>
      <SectionTitle
        icon={Users}
        title={`Seres (${lista.length})`}
        tone="text-cyan-300"
        hint="Cada ser vive de su propia ADN visual, deriva de quién es. Toca uno para abrir su ficha."
        right={
          <>
            <button type="button" className={BTN} onClick={() => { void seres.reload(); void comunidades.reload(); }} aria-label="Recargar seres">
              <RefreshCw className={cn("h-3 w-3", seres.loading && "animate-spin")} aria-hidden="true" />
            </button>
            <button type="button" className={BTN_PRIMARY} onClick={onCrear} aria-label="Iniciar el ritual de creación de un nuevo ser">
              <Plus className="h-3 w-3" aria-hidden="true" /> Nuevo ser
            </button>
          </>
        }
      />
      {!seres.data && <Empty loading={seres.loading} error={seres.error} text="El backend no expone Génesis de Seres todavía." />}
      {seres.data && lista.length === 0 && (
        <div className="mt-3 flex flex-col items-center gap-2 rounded-lg border border-dashed border-white/15 px-4 py-8 text-center">
          <Sparkles className="h-5 w-5 text-white/30" aria-hidden="true" />
          <p className="text-[12px] text-white/70">Todavía no hay ningún ser.</p>
          <p className="max-w-sm text-[10px] leading-snug text-white/45">Ninguno se ha invocado aún — no hay nada que mostrar aquí hasta que empieces el ritual de creación.</p>
          <button type="button" className={cn(BTN_PRIMARY, "mt-1")} onClick={onCrear}>
            <Plus className="h-3 w-3" aria-hidden="true" /> Empezar el ritual
          </button>
        </div>
      )}
      {lista.length > 0 && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map((ser) => (
            <SerRow key={ser.id} ser={ser} comunidades={comunidadesLista} onAbrir={onAbrir} />
          ))}
        </div>
      )}
    </div>
  );
}

export default SeresLista;
