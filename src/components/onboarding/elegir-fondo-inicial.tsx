"use client";

/** PASO «ELIGE TU FONDO» (Ola 1018F · FSH1018J · architecture/fondos-shaders.md §3): el fondo actual
 * va primero y sigue debajo; sets oficiales y catálogo se combinan para perfil y apps, se guardan en
 * «Fondos» (`fondos-biblioteca`), viajan como `ConfigFondo` y «Ahora no» aplaza siete días. */
import { useEffect, useState, useCallback } from "react";
import { Check, Loader2, Smartphone, User, Palette, Upload, Library, Play, Pause } from "lucide-react";
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
import { MiniaturaFondo } from "@/components/onboarding/miniatura-fondo";
import type { ModoVistaPrevia } from "@/lib/onboarding/fondo-inicial";

export interface OpcionFondoInicial { id: string; nombre: string; descripcion?: string; set?: SetFondo }

export interface ElegirFondoInicialProps {
  fondoActual?: OpcionFondoInicial; oficiales?: OpcionFondoInicial[]; catalogo?: OpcionFondoInicial[];
  perfilId?: string; apps?: Array<{ id: string; nombre: string }>;
  onGuardar?: (config: ConfigFondo, itemId?: string) => void | Promise<void>;
  onAplazar?: (aplazadoHasta: string) => void | Promise<void>; className?: string;
  /** Abre el selector de Librería o de archivos y devuelve el fondo añadido (null = cancelado). */
  onAnadir?: (origen: OrigenAnadirFondo) => Promise<OpcionFondoInicial | null>;
  /** Abre el editor de fondos/Protomolécula para personalizar un fondo existente. */
  onPersonalizar?: (opcion: OpcionFondoInicial) => Promise<OpcionFondoInicial | null>;
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
  perfilId = "perfil", apps = [], onGuardar, onAplazar, onAnadir, onPersonalizar, className,
}: ElegirFondoInicialProps) {
  const [elegido, setElegido] = useState<string>(fondoActual.id);
  const [propios, setPropios] = useState<OpcionFondoInicial[]>([]);
  const [movimientoReducido, setMovimientoReducido] = useState(false);
  const [webgpu, setWebgpu] = useState(false);
  const [rendimientoBajo, setRendimientoBajo] = useState(false);
  const [alcances, setAlcances] = useState<AmbitoFondo[]>(["perfil"]);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [mostrandoGrande, setMostrandoGrande] = useState<string | null>(null);
  const [modoGrande, setModoGrande] = useState<ModoVistaPrevia>("quieta");
  const destino = useMyLibraryDestinations().destinations[0] ?? null;
  const opciones = opcionesFondoCompletas([fondoActual], oficiales, catalogo, propios);
  const actual = opcionElegida(opciones, elegido);
  const modo = modoVistaPrevia({ webgpu, movimientoReducido, rendimientoBajo, activa: true });

  useEffect(() => {
    setMovimientoReducido(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
    setWebgpu(typeof navigator !== "undefined" && "gpu" in navigator);
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ charging: boolean; level: number }> };
    nav.getBattery?.().then((b) => { setRendimientoBajo(!b.charging && b.level < 0.2); });
  }, []);

  const elegir = useCallback((id: string) => {
    setElegido((a) => elegirFondoUnico(a, id));
    setMostrandoGrande(id);
  }, []);

  const anadir = async (origen: OrigenAnadirFondo): Promise<void> => {
    const nuevo = await onAnadir?.(origen);
    if (!nuevo) return;
    setPropios((p) => incorporarFondo(p, nuevo));
    elegir(nuevo.id);
  };

  const personalizar = async (opcion: OpcionFondoInicial): Promise<void> => {
    const editado = await onPersonalizar?.(opcion);
    if (!editado) return;
    setPropios((p) => incorporarFondo(p, editado));
    elegir(editado.id);
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

  const tarjetasGrupo = [
    { titulo: "Fondo actual", opciones: [fondoActual] },
    { titulo: "Sets oficiales", opciones: oficiales },
    { titulo: "Catálogo de efectos", opciones: catalogo },
    ...(propios.length ? [{ titulo: "Mis fondos", opciones: propios }] : []),
  ];

  return (
    <section aria-label="Elige tu fondo" className={cn("space-y-3", className)}>
      <p className="text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">El fondo de tu StarSeed</p>

      {/* Vista previa grande del elegido */}
      {actual && (
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/20 aspect-video sm:aspect-[16/9]">
          <MiniaturaFondo
            set={actual.set}
            size={{ w: 0, h: 0 }}
            className="absolute inset-0"
            modo={mostrandoGrande === actual.id ? modoGrande : modo}
            activa={mostrandoGrande === actual.id}
            ariaLabel={`Vista previa grande de ${actual.nombre}`}
          />
          <div className="absolute inset-0 flex items-end p-4 pointer-events-none bg-gradient-to-t from-black/60 to-transparent">
            <div className="w-full text-left">
              <p className="text-[13px] font-semibold text-white">{actual.nombre}</p>
              <p className="text-[11px] text-white/70">{actual.descripcion ?? (actual.id === "actual" ? "Opción principal · se queda debajo" : "Fondo del catálogo")}</p>
            </div>
          </div>
          {mostrandoGrande === actual.id && (
            <button
              type="button"
              onClick={() => { setModoGrande((m) => m === "animada" ? "quieta" : "animada"); }}
              className="absolute top-3 right-3 rounded-full bg-black/50 p-1.5 text-white/80 hover:text-white transition-colors"
              aria-label={modoGrande === "animada" ? "Pausar animación" : "Animar"}
              aria-pressed={modoGrande === "animada"}
            >
              {modoGrande === "animada" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
          )}
        </div>
      )}

      <div className="space-y-3" role="group" aria-label="Fondos disponibles">
        {tarjetasGrupo.map((grupo, gi) => (
          <div key={grupo.titulo} className="space-y-2">
            <h3 className="text-[10px] uppercase tracking-wider text-white/40 px-1">{grupo.titulo}</h3>
            <div className="grid gap-2 sm:grid-cols-2" role="list" aria-label={grupo.titulo}>
              {grupo.opciones.map((o, i) => {
                const activo = actual?.id === o.id;
                return (
                  <article
                    key={o.id}
                    role="listitem"
                    className={cn("group relative overflow-hidden rounded-xl border p-2.5 transition-all duration-200 focus-within:ring-2 focus-within:ring-fuchsia-400/60",
                      activo ? "border-fuchsia-400/70 bg-fuchsia-500/[0.12] shadow-[0_0_24px_-6px_rgba(217,70,239,0.4)]" : "border-white/10 bg-white/[0.03] hover:border-fuchsia-400/40")}
                  >
                    <div className="relative aspect-[4/3] overflow-hidden rounded-md border border-white/10 bg-black/20">
                      <MiniaturaFondo
                        set={o.set}
                        size={{ w: 0, h: 0 }}
                        className="absolute inset-0"
                        modo={activo && modo === "animada" ? "animada" : modo}
                        activa={activo}
                        ariaLabel={o.nombre}
                      />
                      {activo && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/20">
                          <Check className="h-6 w-6 text-fuchsia-200 drop-shadow-[0_0_8px_rgba(217,70,239,0.8)]" aria-hidden />
                        </div>
                      )}
                    </div>
                    <div className="mt-2 space-y-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="truncate text-[12px] font-semibold text-white">{o.nombre}</h4>
                        {onPersonalizar && o.id !== "actual" && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); personalizar(o); }}
                            className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity rounded-full bg-white/5 p-1 text-white/60 hover:bg-white/10 hover:text-white focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/60"
                            aria-label={`Personalizar ${o.nombre}`}
                          >
                            <Palette className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        )}
                      </div>
                      <p className="truncate text-[10px] text-white/50">
                        {o.id === "actual" ? "Opción principal · motor base" : gi === 1 ? "Set oficial StarSeed" : "Efecto del catálogo"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => elegir(o.id)}
                      className="absolute inset-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/60"
                      aria-pressed={activo}
                      aria-label={activo ? `${o.nombre}, seleccionado` : `Seleccionar ${o.nombre}`}
                    />
                  </article>
                );
              })}
            </div>
          </div>
        ))}

        {/* Tarjetas de añadir: Librería y Archivos */}
        <div className="grid gap-2 sm:grid-cols-2" role="list" aria-label="Añadir más fondos">
          {TARJETAS_ANADIR_FONDO.map((t) => (
            <article key={t.origen} role="listitem" className="group relative overflow-hidden rounded-xl border-2 border-dashed border-white/20 p-3 flex flex-col items-start justify-center min-h-[100px] transition-colors hover:border-fuchsia-400/40 focus-within:ring-2 focus-within:ring-fuchsia-400/60">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg border border-white/10 bg-gradient-to-br from-fuchsia-500/20 to-cyan-400/15">
                  {t.origen === "libreria" ? <Library className="h-4 w-4 text-white/60" /> : <Upload className="h-4 w-4 text-white/60" />}
                </div>
                <div className="min-w-0">
                  <h4 className="truncate text-[12px] font-semibold text-white">{t.titulo}</h4>
                  <p className="truncate text-[10px] text-white/50">{t.ayuda}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void anadir(t.origen)}
                className="w-full mt-auto rounded-full bg-fuchsia-500/15 border border-fuchsia-400/30 px-3 py-1.5 text-[11px] font-medium text-fuchsia-100 transition-colors hover:bg-fuchsia-500/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/60"
              >
                Añadir
              </button>
            </article>
          ))}
        </div>
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