"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  AudioLines, Crown, Eye, FileAudio, FolderOpen, Gauge, Library, ListMusic, Lock, Music,
  Pause, Play, Plus, Radio, Settings2, SkipForward, SlidersHorizontal, Users, Volume2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  anadirACola, avanzar, cambiarControl, controladoresEfectivos,
  posicionEn, puedeControlar, saltarA,
  type ControlSala, type FuenteAudio, type SalaSonido as EstadoSalaSonido, type TipoFuente, type VisibilidadSonido,
} from "@/lib/sala-sonido/motor";
import {
  SILENCIO_DB, crearCanal, dbDesdeGanancia, gananciaEfectiva,
  type BandaEcualizador, type CanalMezcla, type Limitador, type MezclaSala, type ModoMezcla,
} from "@/lib/sala-sonido/mezcla";

/** De dónde elige la persona lo que añade a la cola común. */
export type GrupoFuente = "archivos" | "biblioteca" | "app";

export const ETIQUETA_GRUPO: Record<GrupoFuente, string> = {
  archivos: "Archivos",
  biblioteca: "Biblioteca",
  app: "App",
};

export const ETIQUETA_CONTROL: Record<ControlSala, string> = {
  una: "Una neurona",
  elegidas: "Las elegidas",
  todas: "Todas",
};

export const ETIQUETA_VISIBILIDAD: Record<VisibilidadSonido, string> = {
  publico: "Público",
  contactos: "Solo contactos",
  sala: "Solo la sala",
  nada: "Nada",
};

export interface AccionesSala {
  onAnadir?: (fuente: FuenteAudio) => void;
  onArchivos?: (archivos: File[]) => void;
  onSaltar?: (entradaId: string) => void;
  onAvanzar?: () => void;
  onPausar?: () => void;
  onReanudar?: () => void;
  onControl?: (control: ControlSala, controladores: string[]) => void;
  onVisibilidad?: (visibilidad: VisibilidadSonido) => void;
  onMezcla?: (mezcla: MezclaSala) => void;
  onCerrar?: () => void;
}

export interface PropsSalaSonido extends AccionesSala {
  sala: EstadoSalaSonido;
  /** Quién mira la sala; decide si puede mandar y cómo se marca. */
  neurona: string;
  mezcla?: MezclaSala;
  nombres?: Record<string, string>;
  /** Audio que se puede añadir: archivos, producciones de Biblioteca o apps. */
  disponibles?: FuenteAudio[];
  /** Reloj común en ms; sin él se usa el último estado conocido. */
  ahora?: number;
}

/** Nombre legible de una neurona o fuente, con su id como respaldo. */
export function nombreDe(id: string, nombres?: Record<string, string>): string {
  return nombres?.[id]?.trim() || id;
}

/** Duración en ms → «m:ss» o «h:mm:ss»; lo desconocido se dice, no se inventa. */
export function formatearTiempo(ms: number | undefined | null): string {
  if (ms === undefined || ms === null || !Number.isFinite(ms) || ms < 0) return "—";
  const total = Math.floor(ms / 1_000);
  const h = Math.floor(total / 3_600);
  const m = Math.floor((total % 3_600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/** Frecuencia de una banda del ecualizador, en pasos de Fibonacci. */
export function formatearFrecuencia(hz: number): string {
  if (!Number.isFinite(hz) || hz <= 0) return "—";
  if (hz >= 1_000) return `${(hz / 1_000).toFixed(hz % 1_000 === 0 ? 0 : 1)} kHz`;
  return `${Math.round(hz)} Hz`;
}

/** Grupo de la interfaz al que pertenece una fuente. */
export function grupoFuente(tipo: TipoFuente): GrupoFuente {
  if (tipo === "app") return "app";
  if (tipo === "archivo") return "archivos";
  return "biblioteca";
}

/** Quién manda ahora mismo, dicho para leerse en voz alta. */
export function descripcionControl(sala: EstadoSalaSonido, nombres?: Record<string, string>): string {
  if (sala.control === "todas") return "Controla toda la sala";
  const efectivos = controladoresEfectivos(sala);
  if (efectivos.length === 0) return "Nadie tiene el control";
  const lista = efectivos.map((n) => nombreDe(n, nombres));
  if (lista.length === 1) return `Controla ${lista[0]}`;
  if (lista.length === 2) return `Controlan ${lista[0]} y ${lista[1]}`;
  return `Controlan ${lista.slice(0, -1).join(", ")} y ${lista[lista.length - 1]}`;
}

/** Cuántas neuronas comparten la sala, en singular o plural. */
export function resumenSala(sala: EstadoSalaSonido): string {
  const n = sala.oyentes.length;
  return `${n} ${n === 1 ? "neurona" : "neuronas"} en la sala`;
}

/** Entrada que suena ahora, si la cola la contiene. */
export function entradaEnCurso(sala: EstadoSalaSonido) {
  return sala.cola.find((e) => e.id === sala.reproduccion.entradaId) ?? null;
}

/** Mezcla inicial derivada de las fuentes que ya están en la cola. */
export function mezclaDesdeSala(sala: EstadoSalaSonido): MezclaSala {
  const ids = [...new Set(sala.cola.map((e) => e.fuente.id))];
  const actual = entradaEnCurso(sala);
  return { modo: "mezcla", canales: ids.map((id) => crearCanal(id)), turnoDe: actual?.fuente.id ?? null };
}

/** Añade canales a una mezcla cuando la cola trae fuentes nuevas. */
export function asegurarCanales(mezcla: MezclaSala, sala: EstadoSalaSonido): MezclaSala {
  const existentes = new Set(mezcla.canales.map((c) => c.fuenteId));
  const faltan = [...new Set(sala.cola.map((e) => e.fuente.id))].filter((id) => !existentes.has(id));
  if (faltan.length === 0) return mezcla;
  return { ...mezcla, canales: [...mezcla.canales, ...faltan.map((id) => crearCanal(id))] };
}

const limitar = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

function mapaCanales(mezcla: MezclaSala, fuenteId: string, cambio: (c: CanalMezcla) => CanalMezcla): MezclaSala {
  return { ...mezcla, canales: mezcla.canales.map((c) => (c.fuenteId === fuenteId ? cambio(c) : c)) };
}

/** Nivel de una fuente, acotado al rango audible de la interfaz. */
export function conNivel(mezcla: MezclaSala, fuenteId: string, nivelDb: number): MezclaSala {
  return mapaCanales(mezcla, fuenteId, (c) => ({ ...c, nivelDb: limitar(nivelDb, SILENCIO_DB, 6) }));
}

/** Enciende o apaga una fuente sin borrar su nivel ni su cadena. */
export function conActivo(mezcla: MezclaSala, fuenteId: string, activo: boolean): MezclaSala {
  return mapaCanales(mezcla, fuenteId, (c) => ({ ...c, activo }));
}

/** Ganancia de una banda del ecualizador, acotada a ±12 dB. */
export function conBanda(mezcla: MezclaSala, fuenteId: string, indice: number, gananciaDb: number): MezclaSala {
  return mapaCanales(mezcla, fuenteId, (c) => ({
    ...c,
    bandas: c.bandas.map((b: BandaEcualizador, i) => (i === indice ? { ...b, gananciaDb: limitar(gananciaDb, -12, 12) } : b)),
  }));
}

/** Ajusta el limitador de una fuente sin tocar las demás. */
export function conLimitador(mezcla: MezclaSala, fuenteId: string, cambio: Partial<Limitador>): MezclaSala {
  return mapaCanales(mezcla, fuenteId, (c) => ({ ...c, limitador: { ...c.limitador, ...cambio } }));
}

/** Cambia entre mezcla (todas encima) y turnos (una cada vez). */
export function conModo(mezcla: MezclaSala, modo: ModoMezcla): MezclaSala {
  return { ...mezcla, modo };
}

/** Da el turno a una fuente concreta. */
export function conTurno(mezcla: MezclaSala, fuenteId: string): MezclaSala {
  return { ...mezcla, turnoDe: fuenteId };
}

/** Avance de una entrada, en porcentaje, sin pasarse de su duración. */
export function progreso(duracionMs: number | undefined, posicionMs: number): number {
  if (duracionMs === undefined || duracionMs <= 0) return 0;
  return limitar((posicionMs / duracionMs) * 100, 0, 100);
}

/** Cómo se oye una fuente: apagada, esperando turno o su ganancia en dB. */
export function textoGanancia(canal: CanalMezcla, mezcla: Pick<MezclaSala, "modo" | "turnoDe">): string {
  if (!canal.activo) return "apagada";
  if (mezcla.modo === "turnos" && canal.fuenteId !== mezcla.turnoDe) return "en espera";
  return `${dbDesdeGanancia(gananciaEfectiva(canal, mezcla)).toFixed(1)} dB`;
}

export function SalaSonido({
  sala,
  neurona,
  mezcla,
  nombres,
  disponibles = [],
  ahora,
  onAnadir,
  onArchivos,
  onSaltar,
  onAvanzar,
  onPausar,
  onReanudar,
  onControl,
  onVisibilidad,
  onMezcla,
  onCerrar,
}: PropsSalaSonido) {
  const [salaViva, setSalaViva] = useState<EstadoSalaSonido>(sala);
  const [mezclaViva, setMezclaViva] = useState<MezclaSala>(() => mezcla ?? mezclaDesdeSala(sala));
  const [grupo, setGrupo] = useState<GrupoFuente>("archivos");
  const [abierto, setAbierto] = useState<string | null>(null);

  useEffect(() => setSalaViva((v) => (v === sala ? v : sala)), [sala]);
  useEffect(() => {
    if (mezcla) setMezclaViva((v) => (v === mezcla ? v : mezcla));
  }, [mezcla]);

  const reloj = ahora ?? salaViva.reproduccion.actualizadoEn;
  const actual = entradaEnCurso(salaViva);
  const posicion = posicionEn(salaViva, reloj);
  const controla = puedeControlar(salaViva, neurona);
  const mezclaActual = useMemo(() => asegurarCanales(mezclaViva, salaViva), [mezclaViva, salaViva]);
  const fuentes = useMemo(() => new Map(salaViva.cola.map((e) => [e.fuente.id, e.fuente])), [salaViva.cola]);
  const visibles = disponibles.filter((f) => grupoFuente(f.tipo) === grupo);

  const fijarMezcla = (nueva: MezclaSala) => {
    setMezclaViva(nueva);
    onMezcla?.(nueva);
  };
  const anadir = (fuente: FuenteAudio) => {
    setSalaViva(anadirACola(salaViva, fuente, neurona, reloj));
    onAnadir?.(fuente);
  };
  const saltar = (entradaId: string) => {
    const nueva = saltarA(salaViva, entradaId, neurona, reloj);
    if (nueva === salaViva) return;
    setSalaViva(nueva);
    onSaltar?.(entradaId);
  };
  const siguiente = () => {
    setSalaViva(avanzar(salaViva, neurona, reloj));
    onAvanzar?.();
  };
  const cambiarModoControl = (modo: ControlSala) => {
    const nueva = cambiarControl(salaViva, neurona, modo, salaViva.controladores);
    setSalaViva(nueva);
    onControl?.(nueva.control, nueva.controladores);
  };
  const elegirUnico = (id: string) => {
    const nueva = cambiarControl(salaViva, neurona, "una", [id]);
    setSalaViva(nueva);
    onControl?.(nueva.control, nueva.controladores);
  };
  const alternarControlador = (id: string) => {
    const elegidos = new Set(salaViva.controladores);
    if (elegidos.has(id)) elegidos.delete(id);
    else elegidos.add(id);
    const nueva = cambiarControl(salaViva, neurona, "elegidas", [...elegidos]);
    setSalaViva(nueva);
    onControl?.(nueva.control, nueva.controladores);
  };
  const cambiarVisibilidad = (visibilidad: VisibilidadSonido) => {
    setSalaViva({ ...salaViva, visibilidad });
    onVisibilidad?.(visibilidad);
  };
  const cambiarArchivos = (e: ChangeEvent<HTMLInputElement>) => {
    const lista = Array.from(e.target.files ?? []);
    if (lista.length > 0) onArchivos?.(lista);
    e.currentTarget.value = "";
  };

  return (
    <section
      aria-label="Sala de sonido compartida"
      data-testid="sala-sonido"
      className="relative isolate flex min-w-0 flex-col gap-4 overflow-hidden rounded-2xl border border-border/60 bg-card/70 p-4 text-card-foreground shadow-lg backdrop-blur-xl sm:p-5"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,hsl(var(--primary)/0.14),transparent_62%)]"
      />
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <AudioLines className="h-4 w-4" aria-hidden /> Sala de sonido
          </p>
          <h2 className="truncate text-lg font-semibold sm:text-xl">{salaViva.salaId}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" aria-hidden /> {resumenSala(salaViva)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Lock className="h-3.5 w-3.5" aria-hidden /> {ETIQUETA_VISIBILIDAD[salaViva.visibilidad]}
            </span>
          </p>
        </div>
        {onCerrar && (
          <Button type="button" variant="ghost" size="icon" aria-label="Cerrar la sala de sonido" className="cursor-pointer" onClick={onCerrar}>
            <X className="h-5 w-5" aria-hidden />
          </Button>
        )}
      </header>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[1.618fr_1fr]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="rounded-2xl border border-border/50 bg-background/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                  <Radio className={cn("h-4 w-4", salaViva.reproduccion.reproduciendo && "text-primary")} aria-hidden />
                  {salaViva.reproduccion.reproduciendo ? "Suena ahora" : "En pausa"}
                </p>
                <p className="mt-1 truncate text-base font-medium">{actual ? actual.fuente.nombre : "Nada en la cola"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {actual
                    ? `${nombreDe(actual.fuente.aportadaPor, nombres)} · añadida por ${nombreDe(actual.anadidaPor, nombres)}`
                    : "Añade audio de tus archivos, la Biblioteca o una app."}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={salaViva.reproduccion.reproduciendo ? "Pausar" : "Reanudar"}
                  className="cursor-pointer"
                  disabled={!actual || (!onPausar && !onReanudar)}
                  onClick={() => (salaViva.reproduccion.reproduciendo ? onPausar?.() : onReanudar?.())}
                >
                  {salaViva.reproduccion.reproduciendo ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Siguiente"
                  className="cursor-pointer"
                  disabled={!controla || salaViva.cola.length === 0}
                  onClick={siguiente}
                >
                  <SkipForward className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="tabular-nums">{formatearTiempo(posicion)}</span>
              <div
                className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label="Avance de lo que suena"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progreso(actual?.fuente.duracionMs, posicion))}
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300"
                  style={{ width: `${progreso(actual?.fuente.duracionMs, posicion)}%` }}
                />
              </div>
              <span className="tabular-nums">{formatearTiempo(actual?.fuente.duracionMs)}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-border/50 bg-background/40 p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <ListMusic className="h-4 w-4" aria-hidden /> Cola común
              </h3>
              <span className="text-xs text-muted-foreground">
                {salaViva.cola.length} {salaViva.cola.length === 1 ? "pista" : "pistas"}
              </span>
            </div>
            {salaViva.cola.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
                La cola está vacía. Cualquier neurona de la sala puede añadir audio.
              </p>
            ) : (
              <ol className="flex max-h-64 flex-col gap-1 overflow-y-auto pr-1">
                {salaViva.cola.map((e, i) => {
                  const suena = e.id === salaViva.reproduccion.entradaId;
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        aria-current={suena ? "true" : undefined}
                        disabled={!controla}
                        onClick={() => saltar(e.id)}
                        className={cn(
                          "flex w-full min-w-0 items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors",
                          suena ? "border-primary/50 bg-primary/10" : "border-transparent hover:bg-muted/40",
                          controla ? "cursor-pointer" : "cursor-not-allowed opacity-70",
                        )}
                      >
                        <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{e.fuente.nombre}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {nombreDe(e.fuente.aportadaPor, nombres)} · {formatearTiempo(e.fuente.duracionMs)}
                          </span>
                        </span>
                        {suena && <Music className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          <div className="rounded-2xl border border-border/50 bg-background/40 p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Plus className="h-4 w-4" aria-hidden /> Añadir a la cola
            </h3>
            <div role="tablist" aria-label="Origen del audio" className="mb-3 flex flex-wrap gap-1">
              {(Object.keys(ETIQUETA_GRUPO) as GrupoFuente[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  role="tab"
                  aria-selected={grupo === g}
                  onClick={() => setGrupo(g)}
                  className={cn(
                    "min-h-11 cursor-pointer rounded-full border px-3 text-sm",
                    grupo === g ? "border-primary bg-primary/15 text-primary" : "border-border/60 text-muted-foreground hover:bg-muted/40",
                  )}
                >
                  {ETIQUETA_GRUPO[g]}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-1">
              {visibles.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay audio de {ETIQUETA_GRUPO[grupo].toLowerCase()} para añadir.
                </p>
              ) : (
                visibles.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => anadir(f)}
                    className="flex min-h-11 w-full min-w-0 cursor-pointer items-center gap-3 rounded-xl border border-border/40 px-3 py-2 text-left hover:bg-muted/40"
                  >
                    {grupo === "archivos" ? (
                      <FileAudio className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    ) : grupo === "biblioteca" ? (
                      <Library className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    ) : (
                      <Radio className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{f.nombre}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {nombreDe(f.aportadaPor, nombres)} · {formatearTiempo(f.duracionMs)}
                      </span>
                    </span>
                    <Plus className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  </button>
                ))
              )}
            </div>
            <label className="mt-3 flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 px-3 text-sm text-muted-foreground hover:bg-muted/40">
              <FolderOpen className="h-4 w-4" aria-hidden /> Añadir archivos
              <input type="file" multiple className="sr-only" onChange={cambiarArchivos} disabled={!onArchivos} aria-label="Elegir archivos de audio" />
            </label>
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <div className="rounded-2xl border border-border/50 bg-background/40 p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Users className="h-4 w-4" aria-hidden /> Quién está
            </h3>
            <ul className="mb-4 flex flex-col gap-1">
              {salaViva.oyentes.map((id) => {
                const manda = salaViva.control === "todas" || salaViva.controladores.includes(id);
                return (
                  <li key={id} className="flex min-h-11 items-center justify-between gap-2 rounded-xl px-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", manda ? "bg-primary" : "bg-muted-foreground/50")} aria-hidden />
                      <span className="truncate text-sm">
                        {nombreDe(id, nombres)}
                        {id === neurona ? " (tú)" : ""}
                      </span>
                    </span>
                    {manda && (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-primary">
                        <Crown className="h-3.5 w-3.5" aria-hidden /> controla
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <fieldset disabled={!controla} className="min-w-0 border-0 p-0">
              <legend className="mb-1 flex items-center gap-2 text-sm font-medium">
                <Crown className="h-4 w-4" aria-hidden /> Quién controla
              </legend>
              <p className="mb-2 text-xs text-muted-foreground">{descripcionControl(salaViva, nombres)}</p>
              <div role="radiogroup" aria-label="Quién controla la reproducción" className="flex flex-wrap gap-1">
                {(Object.keys(ETIQUETA_CONTROL) as ControlSala[]).map((modo) => (
                  <button
                    key={modo}
                    type="button"
                    role="radio"
                    aria-checked={salaViva.control === modo}
                    disabled={!controla}
                    onClick={() => cambiarModoControl(modo)}
                    className={cn(
                      "min-h-11 rounded-full border px-3 text-sm",
                      salaViva.control === modo ? "border-primary bg-primary/15 text-primary" : "border-border/60 text-muted-foreground",
                      controla ? "cursor-pointer hover:bg-muted/40" : "cursor-not-allowed opacity-50",
                    )}
                  >
                    {ETIQUETA_CONTROL[modo]}
                  </button>
                ))}
              </div>
              {salaViva.control === "una" && (
                <select
                  aria-label="Neurona que controla"
                  className="mt-2 h-11 w-full cursor-pointer rounded-xl border border-border/60 bg-background/60 px-3 text-sm"
                  value={controladoresEfectivos(salaViva)[0] ?? ""}
                  onChange={(e) => elegirUnico(e.target.value)}
                  disabled={!controla}
                >
                  {salaViva.oyentes.map((id) => (
                    <option key={id} value={id}>{nombreDe(id, nombres)}</option>
                  ))}
                </select>
              )}
              {salaViva.control === "elegidas" && (
                <ul className="mt-2 flex flex-col gap-1">
                  {salaViva.oyentes.map((id) => (
                    <li key={id}>
                      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer accent-primary"
                          checked={salaViva.controladores.includes(id)}
                          disabled={!controla}
                          onChange={() => alternarControlador(id)}
                        />
                        {nombreDe(id, nombres)}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>
            <label className="mt-4 flex flex-col gap-1 text-sm">
              <span className="flex items-center gap-2 font-medium">
                <Eye className="h-4 w-4" aria-hidden /> Quién ve lo que suena
              </span>
              <select
                aria-label="Visibilidad de lo que suena"
                className="h-11 w-full cursor-pointer rounded-xl border border-border/60 bg-background/60 px-3 text-sm"
                value={salaViva.visibilidad}
                onChange={(e) => cambiarVisibilidad(e.target.value as VisibilidadSonido)}
                disabled={!controla}
              >
                {(Object.keys(ETIQUETA_VISIBILIDAD) as VisibilidadSonido[]).map((v) => (
                  <option key={v} value={v}>{ETIQUETA_VISIBILIDAD[v]}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="rounded-2xl border border-border/50 bg-background/40 p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <SlidersHorizontal className="h-4 w-4" aria-hidden /> Mezclador
              </h3>
              <div role="group" aria-label="Modo de mezcla" className="flex gap-1">
                {(["mezcla", "turnos"] as ModoMezcla[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => fijarMezcla(conModo(mezclaActual, m))}
                    disabled={!controla}
                    className={cn(
                      "min-h-11 rounded-full border px-3 text-xs",
                      mezclaActual.modo === m ? "border-primary bg-primary/15 text-primary" : "border-border/60 text-muted-foreground hover:bg-muted/40",
                      controla ? "cursor-pointer" : "cursor-not-allowed opacity-50",
                    )}
                  >
                    {m === "mezcla" ? "Mezcla" : "Turnos"}
                  </button>
                ))}
              </div>
            </div>
            {mezclaActual.canales.length === 0 ? (
              <p className="text-sm text-muted-foreground">El mezclador se llena con las fuentes que entran en la cola.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {mezclaActual.canales.map((canal) => {
                  const fuente = fuentes.get(canal.fuenteId);
                  const nombre = fuente?.nombre ?? canal.fuenteId;
                  const expandido = abierto === canal.fuenteId;
                  return (
                    <div key={canal.fuenteId} className="rounded-xl border border-border/40 bg-background/50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{nombre}</p>
                          <p className="text-xs text-muted-foreground">{textoGanancia(canal, mezclaActual)}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {mezclaActual.modo === "turnos" && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="cursor-pointer"
                              disabled={!controla}
                              onClick={() => fijarMezcla(conTurno(mezclaActual, canal.fuenteId))}
                            >
                              Turno
                            </Button>
                          )}
                          <Switch
                            aria-label={`Activar ${nombre}`}
                            checked={canal.activo}
                            disabled={!controla}
                            onCheckedChange={(v) => fijarMezcla(conActivo(mezclaActual, canal.fuenteId, v))}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-expanded={expandido}
                            aria-label={`Ecualizador y limitador de ${nombre}`}
                            className="cursor-pointer"
                            onClick={() => setAbierto(expandido ? null : canal.fuenteId)}
                          >
                            <Settings2 className="h-4 w-4" aria-hidden />
                          </Button>
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-[3.5rem_1fr_3.5rem] items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Volume2 className="h-3.5 w-3.5" aria-hidden /> Nivel
                        </span>
                        <Slider
                          aria-label={`Nivel de ${nombre}`}
                          value={[canal.nivelDb]}
                          min={SILENCIO_DB}
                          max={6}
                          step={1}
                          disabled={!controla}
                          onValueChange={(v) => fijarMezcla(conNivel(mezclaActual, canal.fuenteId, v[0] ?? canal.nivelDb))}
                        />
                        <span className="text-right tabular-nums">
                          {canal.nivelDb > SILENCIO_DB ? `${canal.nivelDb} dB` : "silencio"}
                        </span>
                      </div>
                      {expandido && (
                        <div className="mt-3 flex flex-col gap-3 border-t border-border/40 pt-3">
                          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                            <Gauge className="h-3.5 w-3.5" aria-hidden /> Ecualizador
                          </p>
                          {canal.bandas.map((banda, i) => (
                            <div key={`${canal.fuenteId}-${banda.frecuencia}`} className="grid grid-cols-[3.5rem_1fr_3.5rem] items-center gap-2 text-xs text-muted-foreground">
                              <span className="tabular-nums">{formatearFrecuencia(banda.frecuencia)}</span>
                              <Slider
                                aria-label={`Banda ${formatearFrecuencia(banda.frecuencia)} de ${nombre}`}
                                value={[banda.gananciaDb]}
                                min={-12}
                                max={12}
                                step={1}
                                disabled={!controla}
                                onValueChange={(v) => fijarMezcla(conBanda(mezclaActual, canal.fuenteId, i, v[0] ?? banda.gananciaDb))}
                              />
                              <span className="text-right tabular-nums">
                                {banda.gananciaDb > 0 ? `+${banda.gananciaDb}` : banda.gananciaDb} dB
                              </span>
                            </div>
                          ))}
                          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                            <Lock className="h-3.5 w-3.5" aria-hidden /> Limitador
                          </p>
                          <div className="grid grid-cols-[3.5rem_1fr_3.5rem] items-center gap-2 text-xs text-muted-foreground">
                            <span>Umbral</span>
                            <Slider
                              aria-label={`Umbral del limitador de ${nombre}`}
                              value={[canal.limitador.umbralDb]}
                              min={-24}
                              max={0}
                              step={1}
                              disabled={!controla}
                              onValueChange={(v) => fijarMezcla(conLimitador(mezclaActual, canal.fuenteId, { umbralDb: v[0] ?? canal.limitador.umbralDb }))}
                            />
                            <span className="text-right tabular-nums">{canal.limitador.umbralDb} dB</span>
                          </div>
                          <div className="grid grid-cols-[3.5rem_1fr_3.5rem] items-center gap-2 text-xs text-muted-foreground">
                            <span>Ratio</span>
                            <Slider
                              aria-label={`Ratio del limitador de ${nombre}`}
                              value={[canal.limitador.ratio]}
                              min={1}
                              max={20}
                              step={1}
                              disabled={!controla}
                              onValueChange={(v) => fijarMezcla(conLimitador(mezclaActual, canal.fuenteId, { ratio: v[0] ?? canal.limitador.ratio }))}
                            />
                            <span className="text-right tabular-nums">{canal.limitador.ratio}:1</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Ataque {canal.limitador.ataqueMs} ms · Liberación {canal.limitador.liberacionMs} ms
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
