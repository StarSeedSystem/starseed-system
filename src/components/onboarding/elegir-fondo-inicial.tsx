"use client";

/** PASO «ELIGE TU FONDO» (Ola 1018F · FSH1018J · architecture/fondos-shaders.md §3): el fondo actual
 * va primero y sigue debajo; sets oficiales y catálogo se combinan para perfil y apps, se guardan en
 * «Fondos» (`fondos-biblioteca`), viajan como `ConfigFondo` y «Ahora no» aplaza siete días. */
import { useEffect, useState } from "react";
import { Check, Image as ImageIcon, Loader2, Smartphone, User } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  aplazarElegirFondo, elegirFondoUnico, incorporarFondo, modoVistaPrevia, opcionElegida, opcionesFondoCompletas,
  TARJETAS_ANADIR_FONDO, type OrigenAnadirFondo,
} from "@/lib/onboarding/fondo-inicial";
import type { AmbitoFondo, ConfigFondo } from "@/lib/appearance/alcance-fondos";
import { guardarSet } from "@/lib/appearance/fondos-biblioteca";
import { useMyLibraryDestinations } from "@/lib/library/entity-library";
import { FORMATO_SET, type SetFondo } from "@/lib/appearance/sets-fondo";
import { EFECTOS_FONDO, planFondo, type EfectoFondoId } from "@/lib/protomolecula/atomos/fondo-shader";
import { SETS_FONDO } from "@/lib/protomolecula/peticion/fondo";

export interface OpcionFondoInicial { id: string; nombre: string; descripcion?: string; set?: SetFondo }

export interface ElegirFondoInicialProps {
  fondoActual?: OpcionFondoInicial; oficiales?: OpcionFondoInicial[]; catalogo?: OpcionFondoInicial[];
  perfilId?: string; apps?: Array<{ id: string; nombre: string }>;
  onGuardar?: (config: ConfigFondo, itemId?: string) => void | Promise<void>;
  onAplazar?: (aplazadoHasta: string) => void | Promise<void>; className?: string;
  /** Abre el selector de Librería o de archivos y devuelve el fondo añadido (null = cancelado). */
  onAnadir?: (origen: OrigenAnadirFondo) => Promise<OpcionFondoInicial | null>;
}
const CREADO = "2026-10-18T00:00:00.000Z";
const MAPA: Record<string, EfectoFondoId> = { "diseno-cosmos-violeta": "aurora", "diseno-aurora-suave": "aurora",
  "diseno-vidrio-cuarzo": "cristal", "diseno-semilla-dorada": "gradiente" };
const dePlan = (id: string, nombre: string, efecto: EfectoFondoId): OpcionFondoInicial => ({
  id, nombre, set: planFondo({ id, nombre, autor: "StarSeed", creado: CREADO, valores: { efecto, capas: 1 } }),
});
/** Los cuatro sets oficiales StarSeed y los efectos del catálogo instalado (`shaders` 4.0.4). */
export const FONDOS_OFICIALES = SETS_FONDO.map((s) => dePlan(s.id, s.nombre, MAPA[s.id] ?? "aurora"));
export const CATALOGO_FONDOS = (Object.keys(EFECTOS_FONDO) as EfectoFondoId[]).map((id) => dePlan(id, EFECTOS_FONDO[id].nombre, id));
const ACTUAL: OpcionFondoInicial = { id: "actual", nombre: "Fondo actual", descripcion: "El motor base (Spline por defecto) sigue debajo." };

export function ElegirFondoInicial({
  fondoActual = ACTUAL, oficiales = FONDOS_OFICIALES, catalogo = CATALOGO_FONDOS,
  perfilId = "perfil", apps = [], onGuardar, onAplazar, onAnadir, className,
}: ElegirFondoInicialProps) {
  const [elegido, setElegido] = useState<string>(fondoActual.id);
  const [propios, setPropios] = useState<OpcionFondoInicial[]>([]);
  const [movimientoReducido, setMovimientoReducido] = useState(false);
  useEffect(() => { setMovimientoReducido(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false); }, []);
  const [alcances, setAlcances] = useState<AmbitoFondo[]>(["perfil"]);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const destino = useMyLibraryDestinations().destinations[0] ?? null;
  const opciones = opcionesFondoCompletas([fondoActual], oficiales, catalogo, propios);
  const actual = opcionElegida(opciones, elegido);
  const modo = modoVistaPrevia({ webgpu: typeof navigator !== "undefined" && "gpu" in navigator, movimientoReducido, rendimientoBajo: false, activa: true });
  const elegir = (id: string): void => setElegido((a) => elegirFondoUnico(a, id));
  const anadir = async (origen: OrigenAnadirFondo): Promise<void> => {
    const nuevo = await onAnadir?.(origen);
    if (!nuevo) return;
    setPropios((p) => incorporarFondo(p, nuevo));
    elegir(nuevo.id);
  };
  const alternarAlcance = (a: AmbitoFondo): void => setAlcances((s) => (s.includes(a) ? s.filter((x) => x !== a) : [...s, a]));

  const guardar = async (): Promise<void> => {
    setGuardando(true);
    try {
      const sets = actual?.set ? [actual.set] : [];
      const set: SetFondo | null = sets.length ? {
        formato: FORMATO_SET, version: 1, id: `fondo-inicial-${Date.now()}`, nombre: "Fondo de bienvenida",
        autor: "Yo", licencias: [...new Set(sets.flatMap((s) => s.licencias))], base: null,
        capas: sets.flatMap((s) => s.capas), creado: new Date().toISOString(),
      } : null;
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

  return (
    <section aria-label="Elige tu fondo" className={cn("space-y-3", className)}>
      <p className="text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">El fondo de tu StarSeed</p>
      <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Fondos disponibles">
        {opciones.map((o, i) => {
          const activo = actual?.id === o.id;
          return (
            <button key={o.id} type="button" onClick={() => elegir(o.id)} aria-pressed={activo}
              className={cn("flex cursor-pointer items-center gap-2.5 rounded-xl border p-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/60",
                activo ? "border-fuchsia-400/70 bg-fuchsia-500/[0.12]" : "border-white/10 bg-white/[0.03] hover:border-fuchsia-400/40")}>
              <span className="flex h-8 w-12 shrink-0 items-center justify-center rounded-md border border-white/10 bg-gradient-to-br from-fuchsia-500/20 to-cyan-400/15">
                <ImageIcon className="h-4 w-4 text-white/50" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold">{o.nombre}</span>
                <span className="block truncate text-[10.5px] text-white/50">{i === 0 ? "Opción principal · debajo" : "Fondo del catálogo"}</span>
              </span>
              {activo && <Check className="h-4 w-4 shrink-0 text-fuchsia-200" aria-hidden />}
            </button>
          );
        })}
        {TARJETAS_ANADIR_FONDO.map((t) => (
          <button key={t.origen} type="button" onClick={() => void anadir(t.origen)}
            className="flex cursor-pointer flex-col items-start rounded-xl border border-dashed border-white/20 p-2.5 text-left transition-colors hover:border-fuchsia-400/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/60">
            <span className="text-[12.5px] font-semibold">{t.titulo}</span>
            <span className="text-[10.5px] text-white/50">{t.ayuda}</span>
          </button>
        ))}
      </div>
      {actual && <p data-modo-vista-previa={modo} aria-live="polite" className="text-center text-[11px] text-white/70">Vista previa: {actual.nombre}</p>}
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
