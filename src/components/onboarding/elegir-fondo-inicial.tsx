"use client";

/**
 * PASO «ELIGE TU FONDO» (FON1126A · architecture/fondos-shaders.md §1–§3): vista previa REAL de
 * cada fondo, se elige UNO solo (radio), todo el catálogo con «Personalizar» y dos tarjetas para
 * añadir desde la Librería o desde los archivos. El actual sigue primero; «Ahora no» aplaza siete
 * días y el set se guarda en la carpeta «Fondos» de la Biblioteca. Nunca deja al usuario en bucle.
 */
import { useMemo, useState } from "react";
import { Check, Image as ImageIcon, Library, Loader2, Smartphone, Upload, User, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { aplazarElegirFondo } from "@/lib/onboarding/fondo-inicial";
import type { AmbitoFondo, ConfigFondo } from "@/lib/appearance/alcance-fondos";
import { guardarSet } from "@/lib/appearance/fondos-biblioteca";
import { useMyLibraryDestinations } from "@/lib/library/entity-library";
import { FORMATO_SET, type SetFondo } from "@/lib/appearance/sets-fondo";
import { EFECTOS_FONDO, planFondo, type EfectoFondoId } from "@/lib/protomolecula/atomos/fondo-shader";
import { SETS_FONDO } from "@/lib/protomolecula/peticion/fondo";
import { MiniaturaFondo } from "./miniatura-fondo";

export interface OpcionFondoInicial { id: string; nombre: string; descripcion?: string; set?: SetFondo }
export interface TarjetaAnadir { id: "libreria" | "archivos"; titulo: string; descripcion: string }

/** Las dos tarjetas que cierran SIEMPRE la rejilla: lo publicado y lo propio (local o del aparato). */
export const TARJETAS_ANADIR: readonly TarjetaAnadir[] = [
  { id: "libreria", titulo: "Añadir desde la Librería", descripcion: "Fondos y sets publicados." },
  { id: "archivos", titulo: "Desde mis archivos", descripcion: "Imagen, vídeo o set de tu Biblioteca o del aparato." },
];

/** Catálogo completo sin repetidos: el actual manda y luego oficiales, catálogo y lo añadido. */
export function opcionesDisponibles(
  fondoActual: OpcionFondoInicial, oficiales: readonly OpcionFondoInicial[],
  catalogo: readonly OpcionFondoInicial[], extras: readonly OpcionFondoInicial[] = [],
): OpcionFondoInicial[] {
  const vistos = new Set<string>();
  const salida: OpcionFondoInicial[] = [];
  for (const o of [fondoActual, ...oficiales, ...catalogo, ...extras]) {
    if (!o || vistos.has(o.id)) continue;
    vistos.add(o.id);
    salida.push(o);
  }
  return salida;
}

/** Selección única: si el id existe, pasa a ser el elegido; si no, se conserva el de antes. */
export function elegirUnico(opciones: readonly OpcionFondoInicial[], actualId: string, nuevoId: string): string {
  return opciones.some((o) => o.id === nuevoId) ? nuevoId : actualId;
}

/** La opción elegida, para la vista previa grande de arriba (null si ya no está). */
export function vistaPreviaElegida(opciones: readonly OpcionFondoInicial[], id: string): OpcionFondoInicial | null {
  return opciones.find((o) => o.id === id) ?? null;
}

/** Solo lo que trae un set (oficial o catálogo) se puede personalizar; el actual no. */
export function esPersonalizable(opcion: OpcionFondoInicial): boolean {
  return !!opcion.set;
}

export interface ElegirFondoInicialProps {
  fondoActual?: OpcionFondoInicial; oficiales?: OpcionFondoInicial[]; catalogo?: OpcionFondoInicial[];
  extras?: OpcionFondoInicial[];
  perfilId?: string; apps?: Array<{ id: string; nombre: string }>;
  onGuardar?: (config: ConfigFondo, itemId?: string) => void | Promise<void>;
  onAplazar?: (aplazadoHasta: string) => void | Promise<void>;
  onPersonalizar?: (opcion: OpcionFondoInicial) => void | Promise<void>;
  onAnadirDesdeBiblioteca?: () => void | Promise<void>;
  onAnadirDesdeArchivos?: () => void | Promise<void>;
  className?: string;
}

const CREADO = "2026-10-18T00:00:00.000Z";
const MAPA: Record<string, EfectoFondoId> = {
  "diseno-cosmos-violeta": "aurora", "diseno-aurora-suave": "aurora",
  "diseno-vidrio-cuarzo": "cristal", "diseno-semilla-dorada": "gradiente",
};
const dePlan = (id: string, nombre: string, efecto: EfectoFondoId): OpcionFondoInicial => ({
  id, nombre, set: planFondo({ id, nombre, autor: "StarSeed", creado: CREADO, valores: { efecto, capas: 1 } }),
});
/** Los cuatro sets oficiales StarSeed y todos los efectos del catálogo instalado (`shaders` 4.0.4). */
export const FONDOS_OFICIALES = SETS_FONDO.map((s) => dePlan(s.id, s.nombre, MAPA[s.id] ?? "aurora"));
export const CATALOGO_FONDOS = (Object.keys(EFECTOS_FONDO) as EfectoFondoId[]).map((id) => dePlan(id, EFECTOS_FONDO[id].nombre, id));
const ACTUAL: OpcionFondoInicial = { id: "actual", nombre: "Fondo actual", descripcion: "El motor base (Spline por defecto) sigue debajo." };

export function ElegirFondoInicial({
  fondoActual = ACTUAL, oficiales = FONDOS_OFICIALES, catalogo = CATALOGO_FONDOS, extras = [],
  perfilId = "perfil", apps = [], onGuardar, onAplazar, onPersonalizar,
  onAnadirDesdeBiblioteca, onAnadirDesdeArchivos, className,
}: ElegirFondoInicialProps) {
  const [elegido, setElegido] = useState<string>(fondoActual.id);
  const [activa, setActiva] = useState<string | null>(null);
  const [alcances, setAlcances] = useState<AmbitoFondo[]>(["perfil"]);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const destino = useMyLibraryDestinations().destinations[0] ?? null;
  const opciones = useMemo(
    () => opcionesDisponibles(fondoActual, oficiales, catalogo, extras),
    [fondoActual, oficiales, catalogo, extras],
  );
  const elegida = vistaPreviaElegida(opciones, elegido) ?? opciones[0] ?? fondoActual;
  const elegir = (id: string): void => setElegido((actual) => elegirUnico(opciones, actual, id));
  const alternarAlcance = (a: AmbitoFondo): void => setAlcances((s) => (s.includes(a) ? s.filter((x) => x !== a) : [...s, a]));

  const guardar = async (): Promise<void> => {
    setGuardando(true);
    try {
      const set: SetFondo | null = elegida.set ?? null;
      const config: ConfigFondo = set ? {
        ...(alcances.includes("perfil") ? { perfil: { [perfilId]: set } } : {}),
        ...(alcances.includes("app") ? { apps: Object.fromEntries((apps.length ? apps : [{ id: "app-activa", nombre: "Apps" }]).map((a) => [a.id, set])) } : {}),
      } : {};
      if (set && destino) {
        const r = await guardarSet(destino.ref, set);
        setAviso(r.ok ? "Set guardado en la carpeta «Fondos» de tu Biblioteca." : `No se pudo guardar (${r.motivo}); se aplica igualmente.`);
      } else setAviso(set ? "Se aplicará ahora; entra en tu cuenta para guardarlo." : "Se queda el fondo actual, sin cambios.");
      await onGuardar?.(config);
    } finally { setGuardando(false); }
  };

  const anadir: Record<TarjetaAnadir["id"], (() => void | Promise<void>) | undefined> = {
    libreria: onAnadirDesdeBiblioteca, archivos: onAnadirDesdeArchivos,
  };

  return (
    <section aria-label="Elige tu fondo" className={cn("space-y-3", className)}>
      <p className="text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">El fondo de tu StarSeed</p>

      <div
        className="relative overflow-hidden rounded-xl border border-fuchsia-400/40 bg-white/[0.03]"
        onMouseEnter={() => setActiva("elegido")} onMouseLeave={() => setActiva((a) => (a === "elegido" ? null : a))}
      >
        <MiniaturaFondo set={elegida.set} nombre={elegida.nombre} animar={activa === "elegido"} className="h-28 w-full rounded-none border-0 sm:h-32" grande />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent p-2.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-500/25 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-fuchsia-100">
            <Check className="h-2.5 w-2.5" aria-hidden /> Elegido
          </span>
          <p className="mt-1 truncate text-[12.5px] font-semibold text-white">{elegida.nombre}</p>
          {elegida.descripcion && <p className="truncate text-[10.5px] text-white/60">{elegida.descripcion}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Fondos disponibles">
        {opciones.map((o, i) => {
          const activo = o.id === elegida.id;
          return (
            <div key={o.id} role="radio" aria-checked={activo} aria-label={`Fondo ${o.nombre}`} tabIndex={0}
              onClick={() => elegir(o.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); elegir(o.id); } }}
              onMouseEnter={() => setActiva(o.id)} onMouseLeave={() => setActiva((a) => (a === o.id ? null : a))}
              onFocus={() => setActiva(o.id)} onBlur={() => setActiva((a) => (a === o.id ? null : a))}
              className={cn("flex cursor-pointer items-center gap-2.5 rounded-xl border p-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/60",
                activo ? "border-fuchsia-400/70 bg-fuchsia-500/[0.12]" : "border-white/10 bg-white/[0.03] hover:border-fuchsia-400/40")}>
              <MiniaturaFondo set={o.set} nombre={o.nombre} animar={activa === o.id} className="h-11 w-16 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold">{o.nombre}</span>
                <span className="block truncate text-[10.5px] text-white/50">{i === 0 ? "Opción principal · debajo" : "Fondo del catálogo"}</span>
              </span>
              {activo && <Check className="h-4 w-4 shrink-0 text-fuchsia-200" aria-hidden />}
              {esPersonalizable(o) && (
                <button type="button" onClick={(e) => { e.stopPropagation(); void onPersonalizar?.(o); }}
                  aria-label={`Personalizar ${o.nombre}`}
                  className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full border border-white/12 px-2 py-1 text-[10px] text-white/65 transition-colors hover:border-cyan-400/50 hover:text-cyan-100">
                  <Wand2 className="h-3 w-3" aria-hidden /> Personalizar
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Añadir más fondos">
        {TARJETAS_ANADIR.map((t) => (
          <button key={t.id} type="button" onClick={() => void anadir[t.id]?.()}
            className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-dashed border-white/20 bg-white/[0.02] p-2.5 text-left transition-colors hover:border-cyan-400/50 hover:bg-cyan-500/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04]">
              {t.id === "libreria" ? <Library className="h-4 w-4 text-cyan-200" aria-hidden /> : <Upload className="h-4 w-4 text-cyan-200" aria-hidden />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-semibold">{t.titulo}</span>
              <span className="block truncate text-[10.5px] text-white/50">{t.descripcion}</span>
            </span>
            <ImageIcon className="h-3.5 w-3.5 shrink-0 text-white/30" aria-hidden />
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2" role="group" aria-label="Dónde se aplica">
        <span className="text-[10px] uppercase tracking-wider text-white/40">Se aplica a</span>
        {(["perfil", "app"] as const).map((a) => (
          <button key={a} type="button" onClick={() => alternarAlcance(a)} aria-pressed={alcances.includes(a)}
            className={cn("inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
              alcances.includes(a) ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-100" : "border-white/12 text-white/60 hover:text-white/85")}>
            {a === "perfil" ? <User className="h-3 w-3" aria-hidden /> : <Smartphone className="h-3 w-3" aria-hidden />}
            {a === "perfil" ? "Perfil" : apps.length > 1 ? `${apps.length} apps` : "Apps"}
          </button>
        ))}
      </div>
      {aviso && <p role="status" className="text-center text-[10px] leading-snug text-white/60">{aviso}</p>}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={() => void onAplazar?.(aplazarElegirFondo(new Date()))}
          className="cursor-pointer rounded-full border border-white/12 px-3 py-1.5 text-[11px] text-white/60 transition-colors hover:border-white/25 hover:text-white/85">
          Ahora no · 7 días
        </button>
        <button type="button" onClick={() => void guardar()} disabled={guardando}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-fuchsia-400/50 bg-fuchsia-500/15 px-3 py-1.5 text-[11px] font-semibold text-fuchsia-100 transition-colors hover:bg-fuchsia-500/25 disabled:cursor-not-allowed disabled:opacity-50">
          {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
          Guardar y seguir
        </button>
      </div>
    </section>
  );
}

export default ElegirFondoInicial;
