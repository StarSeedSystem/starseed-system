"use client";

/*
 * SalaSonido — interfaz de la sala de sonido compartida (NFC1126L, contrato:
 * architecture/nfc-neuronas.md §11). Componente controlado: la cola, el control,
 * la mezcla y la visibilidad viven en quien lo monta; aquí solo se presentan y
 * se piden cambios. Cada gesto tiene su función pura exportada para probarlo sin
 * navegador, y la composición sigue la rejilla áurea de memory/diseno/armonia.md.
 */

import { useMemo, useState, type ChangeEvent } from "react";
import {
  AudioLines, Crown, Eye, FileAudio, FolderOpen, Gauge, Library, ListMusic, Lock,
  Music, Pause, Play, Plus, Radio, SkipForward, SlidersHorizontal, Users, Volume2, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  anadirACola, avanzar, cambiarControl, controladoresEfectivos, posicionEn, puedeControlar,
  saltarA, visibilidadPermitida,
  type ControlSala, type EntradaCola, type FuenteAudio, type SalaSonido as EstadoSalaSonido,
  type TipoFuente, type VisibilidadSonido,
} from "@/lib/sala-sonido/motor";
import {
  SILENCIO_DB, crearCanal, dbDesdeGanancia, gananciaEfectiva,
  type BandaEcualizador, type CanalMezcla, type Limitador, type MezclaSala, type ModoMezcla,
} from "@/lib/sala-sonido/mezcla";

/** De dónde elige la persona lo que añade a la cola común. */
export type GrupoFuente = "archivos" | "biblioteca" | "app";

export const GRUPOS: readonly GrupoFuente[] = ["archivos", "biblioteca", "app"];

export const ETIQUETA_GRUPO: Record<GrupoFuente, string> = {
  archivos: "Archivos",
  biblioteca: "Biblioteca",
  app: "App",
};

export const ETIQUETA_TIPO: Record<TipoFuente, string> = {
  archivo: "Archivo",
  sonido: "Sonido",
  produccion: "Producción",
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

/** Techo del nivel de una fuente en la interfaz; el limitador se encarga del resto. */
export const NIVEL_MAX_DB = 6;

/** Gestos que la pantalla que monta la sala conecta con el motor y la nube. */
export interface AccionesSala {
  /** Añade una fuente ya elegida (Biblioteca, app o un archivo ya resuelto). */
  onAnadir?: (fuente: FuenteAudio) => void;
  /** Archivos elegidos en el selector nativo; quien monta la sala los sube. */
  onArchivos?: (archivos: File[]) => void;
  onCerrar?: () => void;
}

export interface PropsSalaSonido extends AccionesSala {
  sala: EstadoSalaSonido;
  mezcla: MezclaSala;
  /** Quién mira la sala; decide si puede mandar y cómo se marca. */
  neurona: string;
  /** Reloj común de la malla, en ms. Sin él se usa el último estado conocido. */
  ahora?: number;
  nombres?: Record<string, string>;
  /** Audio que se puede añadir: archivos, producciones de Biblioteca o apps. */
  disponibles?: FuenteAudio[];
  /** Si quien mira es contacto de la sala, para la visibilidad «solo contactos». */
  esContacto?: boolean;
  onCambiarSala: (sala: EstadoSalaSonido) => void;
  onCambiarMezcla: (mezcla: MezclaSala) => void;
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
export function entradaEnCurso(sala: EstadoSalaSonido): EntradaCola | null {
  return sala.cola.find((e) => e.id === sala.reproduccion.entradaId) ?? null;
}

/** Mezcla inicial derivada de las fuentes que ya están en la cola. */
export function mezclaDesdeSala(sala: EstadoSalaSonido): MezclaSala {
  const ids = [...new Set(sala.cola.map((e) => e.fuente.id))];
  const actual = entradaEnCurso(sala);
  return {
    modo: "mezcla",
    canales: ids.map((id) => crearCanal(id)),
    turnoDe: actual?.fuente.id ?? null,
  };
}

/** Añade canales a una mezcla cuando la cola trae fuentes nuevas. */
export function asegurarCanales(mezcla: MezclaSala, sala: EstadoSalaSonido): MezclaSala {
  const existentes = new Set(mezcla.canales.map((c) => c.fuenteId));
  const faltan = [...new Set(sala.cola.map((e) => e.fuente.id))].filter((id) => !existentes.has(id));
  if (faltan.length === 0) return mezcla;
  return { ...mezcla, canales: [...mezcla.canales, ...faltan.map((id) => crearCanal(id))] };
}

function limitar(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function mapaCanales(
  mezcla: MezclaSala,
  fuenteId: string,
  cambio: (c: CanalMezcla) => CanalMezcla,
): MezclaSala {
  return { ...mezcla, canales: mezcla.canales.map((c) => (c.fuenteId === fuenteId ? cambio(c) : c)) };
}

/** Nivel de una fuente, acotado al rango audible de la interfaz. */
export function conNivel(mezcla: MezclaSala, fuenteId: string, nivelDb: number): MezclaSala {
  return mapaCanales(mezcla, fuenteId, (c) => ({ ...c, nivelDb: limitar(nivelDb, SILENCIO_DB, NIVEL_MAX_DB) }));
}

/** Enciende o apaga una fuente; si apaga el turno actual, pasa el turno a otra activa. */
export function conActivo(mezcla: MezclaSala, fuenteId: string, activo: boolean): MezclaSala {
  const siguiente = mapaCanales(mezcla, fuenteId, (c) => ({ ...c, activo }));
  if (activo || siguiente.turnoDe !== fuenteId) return siguiente;
  const primero = siguiente.canales.find((c) => c.activo)?.fuenteId ?? null;
  return { ...siguiente, turnoDe: primero };
}

/** Ganancia de una banda del ecualizador, acotada a ±12 dB. */
export function conBanda(mezcla: MezclaSala, fuenteId: string, indice: number, gananciaDb: number): MezclaSala {
  return mapaCanales(mezcla, fuenteId, (c) => ({
    ...c,
    bandas: c.bandas.map((b: BandaEcualizador, i) => (i === indice ? { ...b, gananciaDb: limitar(gananciaDb, -12, 12) } : b)),
  }));
}

/** Ajusta el limitador de una fuente y mantiene sus valores dentro de rango. */
export function conLimitador(mezcla: MezclaSala, fuenteId: string, cambio: Partial<Limitador>): MezclaSala {
  return mapaCanales(mezcla, fuenteId, (c) => {
    const l = { ...c.limitador, ...cambio };
    return {
      ...c,
      limitador: {
        umbralDb: limitar(l.umbralDb, -24, 0),
        ratio: limitar(l.ratio, 1, 20),
        ataqueMs: Math.max(0, l.ataqueMs),
        liberacionMs: Math.max(0, l.liberacionMs),
      },
    };
  });
}

/** Cambia entre mezcla (todas encima) y turnos (una cada vez). */
export function conModo(mezcla: MezclaSala, modo: ModoMezcla): MezclaSala {
  if (modo === mezcla.modo) return mezcla;
  if (modo === "turnos") {
    const turnoActivo = mezcla.canales.some((c) => c.fuenteId === mezcla.turnoDe && c.activo);
    if (!turnoActivo) {
      const primero = mezcla.canales.find((c) => c.activo)?.fuenteId ?? null;
      return { ...mezcla, modo, turnoDe: primero };
    }
  }
  return { ...mezcla, modo };
}

/** Da el turno a una fuente concreta, solo si está activa. */
export function conTurno(mezcla: MezclaSala, fuenteId: string): MezclaSala {
  const existe = mezcla.canales.some((c) => c.fuenteId === fuenteId && c.activo);
  return existe ? { ...mezcla, turnoDe: fuenteId } : mezcla;
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

/** Por qué esta neurona puede o no puede mandar en la sala. */
export type MotivoControl = "fuera" | "todas" | "propio" | "otros";

export function estadoControl(sala: EstadoSalaSonido, neurona: string): MotivoControl {
  if (!sala.oyentes.includes(neurona)) return "fuera";
  if (sala.control === "todas") return "todas";
  return sala.controladores.includes(neurona) ? "propio" : "otros";
}

/** Pausa o reanuda en el reloj común; solo con el control de la sala. */
export function pausarOReanudar(sala: EstadoSalaSonido, quien: string, ahora: number): EstadoSalaSonido {
  const r = sala.reproduccion;
  if (r.entradaId === null || !puedeControlar(sala, quien)) return sala;
  if (r.reproduciendo) {
    return {
      ...sala,
      reproduccion: { ...r, posicionMs: posicionEn(sala, ahora), reproduciendo: false, actualizadoEn: ahora },
    };
  }
  return { ...sala, reproduccion: { ...r, reproduciendo: true, actualizadoEn: ahora } };
}

/** Cambia la visibilidad de lo que suena; solo con el control de la sala. */
export function cambiarVisibilidad(
  sala: EstadoSalaSonido,
  quien: string,
  visibilidad: VisibilidadSonido,
): EstadoSalaSonido {
  return puedeControlar(sala, quien) ? { ...sala, visibilidad } : sala;
}

/** Nivel en dB → porcentaje del deslizador, con el silencio en el extremo izquierdo. */
export function nivelDbAPorcentaje(nivelDb: number): number {
  const rango = NIVEL_MAX_DB - SILENCIO_DB;
  return Math.round(limitar(((nivelDb - SILENCIO_DB) / rango) * 100, 0, 100));
}

/** Porcentaje del deslizador → nivel en dB, redondeado al decibelio. */
export function porcentajeANivelDb(porcentaje: number): number {
  const p = limitar(porcentaje, 0, 100);
  return Math.round(SILENCIO_DB + (p / 100) * (NIVEL_MAX_DB - SILENCIO_DB));
}

const BOTON = "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 text-sm transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none";
const BOTON_ACTIVO = "border-primary/60 bg-primary/15 text-primary";
const BOTON_BASE = "border-border/60 bg-background/40 text-muted-foreground hover:bg-muted/40";
const CAMPO = "h-11 w-full cursor-pointer rounded-xl border border-border/60 bg-background/60 px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50";
const TARJETA = "min-w-0 rounded-2xl border border-border/50 bg-background/40 p-4";
const DESLIZADOR = "h-11 w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50";

export function SalaSonido({
  sala,
  mezcla,
  neurona,
  ahora,
  nombres,
  disponibles = [],
  esContacto = false,
  onCambiarSala,
  onCambiarMezcla,
  onAnadir,
  onArchivos,
  onCerrar,
}: PropsSalaSonido) {
  const [grupo, setGrupo] = useState<GrupoFuente>("archivos");
  const reloj = ahora ?? sala.reproduccion.actualizadoEn;
  const actual = entradaEnCurso(sala);
  const posicion = posicionEn(sala, reloj);
  const controla = puedeControlar(sala, neurona);
  const puedeVer = visibilidadPermitida(sala, neurona, esContacto);
  const mezclaActual = useMemo(() => asegurarCanales(mezcla, sala), [mezcla, sala]);
  const fuentes = useMemo(() => new Map(sala.cola.map((e) => [e.fuente.id, e.fuente])), [sala.cola]);
  const visibles = disponibles.filter((f) => grupoFuente(f.tipo) === grupo);

  const saltar = (entradaId: string) => onCambiarSala(saltarA(sala, entradaId, neurona, reloj));
  const siguiente = () => onCambiarSala(avanzar(sala, neurona, reloj));
  const pausa = () => onCambiarSala(pausarOReanudar(sala, neurona, reloj));
  const cambiarModoControl = (modo: ControlSala) => onCambiarSala(cambiarControl(sala, neurona, modo, sala.controladores));
  const elegirUnico = (id: string) => onCambiarSala(cambiarControl(sala, neurona, "una", [id]));
  const alternarControlador = (id: string) => {
    const elegidos = new Set(sala.controladores);
    if (elegidos.has(id)) elegidos.delete(id);
    else elegidos.add(id);
    onCambiarSala(cambiarControl(sala, neurona, "elegidas", [...elegidos]));
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
          <h2 className="truncate text-lg font-semibold sm:text-xl">{sala.salaId}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" aria-hidden /> {resumenSala(sala)}</span>
            <span className="inline-flex items-center gap-1"><Lock className="h-3.5 w-3.5" aria-hidden /> {ETIQUETA_VISIBILIDAD[sala.visibilidad]}</span>
            <span className="inline-flex items-center gap-1"><Radio className="h-3.5 w-3.5" aria-hidden /> Reloj común</span>
          </p>
        </div>
        {onCerrar && (
          <button type="button" aria-label="Cerrar la sala de sonido" onClick={onCerrar} className="cursor-pointer rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted/50 motion-reduce:transition-none">
            <X className="h-5 w-5" aria-hidden />
          </button>
        )}
      </header>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[1.618fr_1fr]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className={TARJETA} data-testid="sala-ahora">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                  <Radio className={cn("h-4 w-4", sala.reproduccion.reproduciendo && "text-primary")} aria-hidden />
                  {sala.reproduccion.reproduciendo ? "Suena ahora" : "En pausa"}
                </p>
                <p className="mt-1 truncate text-base font-medium">
                  {puedeVer ? (actual?.fuente.nombre ?? "Nada en la cola") : "Lo que suena no se comparte"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {puedeVer && actual
                    ? `${ETIQUETA_TIPO[actual.fuente.tipo]} · ${nombreDe(actual.fuente.aportadaPor, nombres)} · añadida por ${nombreDe(actual.anadidaPor, nombres)}`
                    : puedeVer
                      ? "Añade audio de tus archivos, la Biblioteca o una app."
                      : "La sala decidió no mostrar lo que suena fuera de ella."}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label={sala.reproduccion.reproduciendo ? "Pausar" : "Reanudar"}
                  className={cn(BOTON, BOTON_BASE, "w-11 px-0")}
                  disabled={!controla || !actual}
                  onClick={pausa}
                >
                  {sala.reproduccion.reproduciendo ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
                </button>
                <button
                  type="button"
                  aria-label="Siguiente"
                  className={cn(BOTON, BOTON_BASE, "w-11 px-0")}
                  disabled={!controla || sala.cola.length === 0}
                  onClick={siguiente}
                >
                  <SkipForward className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="tabular-nums">{formatearTiempo(puedeVer ? posicion : undefined)}</span>
              <div
                className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label="Avance de lo que suena"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={puedeVer ? Math.round(progreso(actual?.fuente.duracionMs, posicion)) : 0}
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
                  style={{ width: `${puedeVer ? progreso(actual?.fuente.duracionMs, posicion) : 0}%` }}
                />
              </div>
              <span className="tabular-nums">{formatearTiempo(puedeVer ? actual?.fuente.duracionMs : undefined)}</span>
            </div>
          </div>
          <div className={TARJETA} data-testid="sala-cola">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <ListMusic className="h-4 w-4" aria-hidden /> Cola común
              </h3>
              <span className="text-xs text-muted-foreground">
                {sala.cola.length} {sala.cola.length === 1 ? "pista" : "pistas"}
              </span>
            </div>
            {sala.cola.length === 0 ? (
              <div className="relative overflow-hidden rounded-xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
                <div aria-hidden className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full border border-primary/20" />
                <div aria-hidden className="pointer-events-none absolute -bottom-6 -left-6 h-24 w-24 rounded-full border border-primary/20" />
                <p className="relative">La cola está vacía. Cualquier neurona de la sala puede añadir audio.</p>
              </div>
            ) : (
              <ol className="flex max-h-64 flex-col gap-1 overflow-y-auto pr-1">
                {sala.cola.map((e, i) => {
                  const suena = e.id === sala.reproduccion.entradaId;
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        aria-current={suena ? "true" : undefined}
                        disabled={!controla}
                        onClick={() => saltar(e.id)}
                        className={cn(
                          "flex min-h-11 w-full min-w-0 items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors duration-200 motion-reduce:transition-none",
                          suena ? "border-primary/50 bg-primary/10" : "border-transparent hover:bg-muted/40",
                          controla ? "cursor-pointer" : "cursor-not-allowed opacity-70",
                        )}
                      >
                        <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{e.fuente.nombre}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {ETIQUETA_TIPO[e.fuente.tipo]} · {nombreDe(e.anadidaPor, nombres)} · {formatearTiempo(e.fuente.duracionMs)}
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
          <div className={TARJETA} data-testid="sala-anadir">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Plus className="h-4 w-4" aria-hidden /> Añadir a la cola
            </h3>
            <div role="group" aria-label="Origen del audio" className="mb-3 flex flex-wrap gap-1">
              {GRUPOS.map((g) => (
                <button
                  key={g}
                  type="button"
                  aria-pressed={grupo === g}
                  onClick={() => setGrupo(g)}
                  className={cn(BOTON, "rounded-full px-3", grupo === g ? BOTON_ACTIVO : BOTON_BASE)}
                >
                  {ETIQUETA_GRUPO[g]}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-1">
              {visibles.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay audio de {ETIQUETA_GRUPO[grupo].toLowerCase()} para añadir.</p>
              ) : (
                visibles.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    disabled={!onAnadir}
                    onClick={() => onAnadir?.(f)}
                    className={cn(BOTON, BOTON_BASE, "w-full justify-start text-left")}
                  >
                    {grupo === "archivos" ? (
                      <FileAudio className="h-4 w-4 shrink-0" aria-hidden />
                    ) : grupo === "biblioteca" ? (
                      <Library className="h-4 w-4 shrink-0" aria-hidden />
                    ) : (
                      <Radio className="h-4 w-4 shrink-0" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{f.nombre}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {nombreDe(f.aportadaPor, nombres)} · {formatearTiempo(f.duracionMs)}
                      </span>
                    </span>
                    <Plus className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  </button>
                ))
              )}
            </div>
            <label className={cn(BOTON, "mt-3 w-full justify-center border-dashed text-muted-foreground", !onArchivos && "cursor-not-allowed opacity-50")}>
              <FolderOpen className="h-4 w-4" aria-hidden /> Añadir archivos
              <input
                type="file"
                multiple
                accept="audio/*"
                className="sr-only"
                onChange={cambiarArchivos}
                disabled={!onArchivos}
                aria-label="Elegir archivos de audio"
              />
            </label>
          </div>
        </div>
        <aside className="flex min-w-0 flex-col gap-4">
          <div className={TARJETA} data-testid="sala-control">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Users className="h-4 w-4" aria-hidden /> Quién está
            </h3>
            <ul className="mb-4 flex flex-wrap gap-1">
              {sala.oyentes.map((id) => {
                const manda = sala.control === "todas" || sala.controladores.includes(id);
                return (
                  <li
                    key={id}
                    className={cn(
                      "inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-xs",
                      manda ? "border-primary/40 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground",
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", manda ? "bg-primary" : "bg-muted-foreground/50")} aria-hidden />
                    <span className="truncate">{nombreDe(id, nombres)}{id === neurona ? " (tú)" : ""}</span>
                    {manda && <Crown className="h-3 w-3 shrink-0" aria-hidden />}
                  </li>
                );
              })}
            </ul>
            <fieldset disabled={!controla} className="min-w-0 border-0 p-0">
              <legend className="mb-1 flex items-center gap-2 text-sm font-medium">
                <Crown className="h-4 w-4" aria-hidden /> Quién controla
              </legend>
              <p className="mb-2 text-xs text-muted-foreground">{descripcionControl(sala, nombres)}</p>
              <div role="group" aria-label="Quién controla la reproducción" className="flex flex-wrap gap-1">
                {(Object.keys(ETIQUETA_CONTROL) as ControlSala[]).map((modo) => (
                  <button
                    key={modo}
                    type="button"
                    aria-pressed={sala.control === modo}
                    disabled={!controla}
                    onClick={() => cambiarModoControl(modo)}
                    className={cn(BOTON, "rounded-full px-3", sala.control === modo ? BOTON_ACTIVO : BOTON_BASE)}
                  >
                    {ETIQUETA_CONTROL[modo]}
                  </button>
                ))}
              </div>
              {sala.control === "una" && (
                <select
                  aria-label="Neurona que controla"
                  className={cn(CAMPO, "mt-2")}
                  value={controladoresEfectivos(sala)[0] ?? ""}
                  onChange={(e) => elegirUnico(e.target.value)}
                  disabled={!controla}
                >
                  {sala.oyentes.map((id) => (
                    <option key={id} value={id}>{nombreDe(id, nombres)}</option>
                  ))}
                </select>
              )}
              {sala.control === "elegidas" && (
                <ul className="mt-2 flex flex-col gap-1">
                  {sala.oyentes.map((id) => (
                    <li key={id}>
                      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer accent-primary"
                          checked={sala.controladores.includes(id)}
                          disabled={!controla}
                          onChange={() => alternarControlador(id)}
                        />
                        <span className="truncate">{nombreDe(id, nombres)}</span>
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
                className={CAMPO}
                value={sala.visibilidad}
                onChange={(e) => onCambiarSala(cambiarVisibilidad(sala, neurona, e.target.value as VisibilidadSonido))}
                disabled={!controla}
              >
                {(Object.keys(ETIQUETA_VISIBILIDAD) as VisibilidadSonido[]).map((v) => (
                  <option key={v} value={v}>{ETIQUETA_VISIBILIDAD[v]}</option>
                ))}
              </select>
            </label>
          </div>
          <div className={TARJETA} data-testid="sala-mezcla">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <SlidersHorizontal className="h-4 w-4" aria-hidden /> Mezclador
              </h3>
              <div role="group" aria-label="Modo de mezcla" className="flex gap-1">
                {(["mezcla", "turnos"] as ModoMezcla[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={mezclaActual.modo === m}
                    disabled={!controla}
                    onClick={() => onCambiarMezcla(conModo(mezclaActual, m))}
                    className={cn(BOTON, "rounded-full px-3 text-xs", mezclaActual.modo === m ? BOTON_ACTIVO : BOTON_BASE)}
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
                  return (
                    <div key={canal.fuenteId} className="rounded-xl border border-border/40 bg-background/50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{nombre}</p>
                          <p className="text-xs text-muted-foreground">{textoGanancia(canal, mezclaActual)}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {mezclaActual.modo === "turnos" && (
                            <button
                              type="button"
                              disabled={!controla}
                              onClick={() => onCambiarMezcla(conTurno(mezclaActual, canal.fuenteId))}
                              className={cn(BOTON, "px-2 text-xs", mezclaActual.turnoDe === canal.fuenteId ? BOTON_ACTIVO : BOTON_BASE)}
                            >
                              Turno
                            </button>
                          )}
                          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              className="h-4 w-4 cursor-pointer accent-primary"
                              checked={canal.activo}
                              disabled={!controla}
                              onChange={(e) => onCambiarMezcla(conActivo(mezclaActual, canal.fuenteId, e.target.checked))}
                            />
                            {canal.activo ? "Activa" : "Apagada"}
                          </label>
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-[3.5rem_1fr_3.5rem] items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Volume2 className="h-3.5 w-3.5" aria-hidden /> Nivel</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={nivelDbAPorcentaje(canal.nivelDb)}
                          onChange={(e) => onCambiarMezcla(conNivel(mezclaActual, canal.fuenteId, porcentajeANivelDb(Number(e.target.value))))}
                          disabled={!controla}
                          aria-label={`Nivel de ${nombre}`}
                          aria-valuetext={`${canal.nivelDb} dB`}
                          className={DESLIZADOR}
                        />
                        <span className="text-right tabular-nums">{canal.nivelDb > SILENCIO_DB ? `${canal.nivelDb} dB` : "silencio"}</span>
                      </div>
                      <details className="mt-2 border-t border-border/40 pt-2">
                        <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
                          <Gauge className="h-3.5 w-3.5" aria-hidden /> Ecualizador y limitador
                        </summary>
                        <div className="mt-2 flex flex-col gap-2">
                          {canal.bandas.map((banda, i) => (
                            <div key={`${canal.fuenteId}-${banda.frecuencia}`} className="grid grid-cols-[3.5rem_1fr_3.5rem] items-center gap-2 text-xs text-muted-foreground">
                              <span className="tabular-nums">{formatearFrecuencia(banda.frecuencia)}</span>
                              <input
                                type="range"
                                min={-12}
                                max={12}
                                step={1}
                                value={banda.gananciaDb}
                                onChange={(e) => onCambiarMezcla(conBanda(mezclaActual, canal.fuenteId, i, Number(e.target.value)))}
                                disabled={!controla}
                                aria-label={`Banda ${formatearFrecuencia(banda.frecuencia)} de ${nombre}`}
                                aria-valuetext={`${banda.gananciaDb} dB`}
                                className={DESLIZADOR}
                              />
                              <span className="text-right tabular-nums">{banda.gananciaDb > 0 ? `+${banda.gananciaDb}` : banda.gananciaDb} dB</span>
                            </div>
                          ))}
                          <div className="grid grid-cols-[3.5rem_1fr_3.5rem] items-center gap-2 text-xs text-muted-foreground">
                            <span>Umbral</span>
                            <input
                              type="range"
                              min={-24}
                              max={0}
                              step={1}
                              value={canal.limitador.umbralDb}
                              onChange={(e) => onCambiarMezcla(conLimitador(mezclaActual, canal.fuenteId, { umbralDb: Number(e.target.value) }))}
                              disabled={!controla}
                              aria-label={`Umbral del limitador de ${nombre}`}
                              aria-valuetext={`${canal.limitador.umbralDb} dB`}
                              className={DESLIZADOR}
                            />
                            <span className="text-right tabular-nums">{canal.limitador.umbralDb} dB</span>
                          </div>
                          <div className="grid grid-cols-[3.5rem_1fr_3.5rem] items-center gap-2 text-xs text-muted-foreground">
                            <span>Ratio</span>
                            <input
                              type="range"
                              min={1}
                              max={20}
                              step={1}
                              value={canal.limitador.ratio}
                              onChange={(e) => onCambiarMezcla(conLimitador(mezclaActual, canal.fuenteId, { ratio: Number(e.target.value) }))}
                              disabled={!controla}
                              aria-label={`Ratio del limitador de ${nombre}`}
                              aria-valuetext={`${canal.limitador.ratio}:1`}
                              className={DESLIZADOR}
                            />
                            <span className="text-right tabular-nums">{canal.limitador.ratio}:1</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Ataque {canal.limitador.ataqueMs} ms · Liberación {canal.limitador.liberacionMs} ms
                          </p>
                        </div>
                      </details>
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

export default SalaSonido;

