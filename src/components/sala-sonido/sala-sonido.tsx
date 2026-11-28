"use client";

/**
 * StarSeed OS · Sala de sonido compartida · INTERFAZ (NFC1126L · contrato §11).
 * Quién está, cola común, lo que suena, quién controla, mezclador con nivel,
 * ecualizador y limitador por fuente, y visibilidad. Pieza controlada: el
 * cableado decide y esta interfaz solo pinta y avisa por `acciones`.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AudioLines,
  Crown,
  Eye,
  FileAudio,
  FolderOpen,
  Library,
  ListMusic,
  Lock,
  Pause,
  Play,
  SkipForward,
  SlidersHorizontal,
  Trash2,
  Users,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  controladoresEfectivos,
  posicionEn,
  puedeControlar,
  type ControlSala,
  type SalaSonido,
  type VisibilidadSonido,
} from "@/lib/sala-sonido/motor";
import {
  SILENCIO_DB,
  crearCanal,
  type CanalMezcla,
  type MezclaSala,
  type ModoMezcla,
} from "@/lib/sala-sonido/mezcla";

export type OrigenAudio = "archivos" | "biblioteca" | "app";

export interface AccionesSalaSonido {
  anadirFuente?: (origen: OrigenAudio) => void;
  saltarA?: (entradaId: string) => void;
  avanzar?: () => void;
  alternarReproduccion?: () => void;
  quitarDeCola?: (entradaId: string) => void;
  cambiarControl?: (control: ControlSala, controladores: string[]) => void;
  cambiarVisibilidad?: (visibilidad: VisibilidadSonido) => void;
  cambiarNivel?: (fuenteId: string, nivelDb: number) => void;
  alternarCanal?: (fuenteId: string, activo: boolean) => void;
  cambiarModoMezcla?: (modo: ModoMezcla) => void;
  cambiarBanda?: (fuenteId: string, indice: number, gananciaDb: number) => void;
}

export interface PropsSalaSonido {
  sala: SalaSonido;
  yo: string;
  mezcla?: MezclaSala;
  titulo?: string;
  nombres?: Record<string, string>;
  ahoraMs?: number;
  acciones?: AccionesSalaSonido;
  compacto?: boolean;
}

const ETIQUETA_CONTROL: Record<ControlSala, string> = {
  una: "Una",
  elegidas: "Elegidas",
  todas: "Todas",
};

const ETIQUETA_VISIBILIDAD: Record<VisibilidadSonido, string> = {
  publico: "Público",
  contactos: "Contactos",
  sala: "Solo la sala",
  nada: "Oculto",
};

const MODOS_CONTROL: readonly ControlSala[] = ["una", "elegidas", "todas"];
const VISIBILIDADES: readonly VisibilidadSonido[] = ["publico", "contactos", "sala", "nada"];

const BOTON =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
const BOTON_ICONO =
  "inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border/60 bg-background/60 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
const ACTIVO = "border-primary bg-primary/10 text-primary";

/** Nombre legible de una neurona; si no hay alias, su id. */
function nombreDe(nombres: Record<string, string> | undefined, id: string): string {
  return nombres?.[id]?.trim() || id;
}

/** Iniciales para el avatar de presencia (máximo dos letras). */
function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  const letras = partes.slice(0, 2).map((p) => p[0] ?? "");
  return letras.join("").toUpperCase() || "?";
}

/** ms → «m:ss» sin negativos ni NaN. */
function formatearMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0:00";
  const total = Math.floor(ms / 1000);
  const minutos = Math.floor(total / 60);
  const segundos = total % 60;
  return `${minutos}:${segundos.toString().padStart(2, "0")}`;
}

/** Reloj local: si el padre no manda `ahoraMs`, avanza cada segundo. */
function useAhora(fijo?: number): number {
  const [ahora, setAhora] = useState(() => fijo ?? 0);
  useEffect(() => {
    if (fijo !== undefined) {
      setAhora(fijo);
      return;
    }
    setAhora(Date.now());
    const id = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [fijo]);
  return fijo ?? ahora;
}

/** Canales por defecto a partir de las fuentes que ya están en la cola. */
function derivarCanales(sala: SalaSonido): CanalMezcla[] {
  const vistos = new Set<string>();
  const canales: CanalMezcla[] = [];
  for (const entrada of sala.cola) {
    const id = entrada.fuente.id;
    if (vistos.has(id)) continue;
    vistos.add(id);
    canales.push(crearCanal(id));
  }
  return canales;
}

function Seccion({
  icono,
  titulo,
  extra,
  className,
  children,
}: {
  icono: ReactNode;
  titulo: string;
  extra?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("min-w-0 rounded-2xl border border-border/60 bg-background/40 p-3", className)}>
      <header className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <span className="shrink-0 text-muted-foreground" aria-hidden="true">
            {icono}
          </span>
          <span className="truncate">{titulo}</span>
        </h3>
        {extra}
      </header>
      {children}
    </section>
  );
}

function FilaCanal({
  canal,
  nombres,
  acciones,
}: {
  canal: CanalMezcla;
  nombres?: Record<string, string>;
  acciones?: AccionesSalaSonido;
}) {
  const nombre = nombreDe(nombres, canal.fuenteId);
  return (
    <div className="min-w-0 rounded-xl border border-border/50 bg-background/50 p-2">
      <div className="flex min-w-0 items-center gap-2">
        <Switch
          checked={canal.activo}
          onCheckedChange={(v) => acciones?.alternarCanal?.(canal.fuenteId, v)}
          disabled={!acciones?.alternarCanal}
          aria-label={`${canal.activo ? "Silenciar" : "Activar"} ${nombre}`}
        />
        <span className="min-w-0 flex-1 truncate text-sm">{nombre}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {Math.round(canal.nivelDb)} dB
        </span>
      </div>
      <Slider
        className="mt-2"
        min={SILENCIO_DB}
        max={6}
        step={1}
        value={[canal.nivelDb]}
        onValueChange={(valores) => {
          const nivel = valores[0];
          if (nivel !== undefined) acciones?.cambiarNivel?.(canal.fuenteId, nivel);
        }}
        disabled={!acciones?.cambiarNivel}
        aria-label={`Nivel de ${nombre}`}
      />
      <details className="mt-1">
        <summary className="cursor-pointer text-xs text-muted-foreground">
          Ecualizador y limitador
        </summary>
        <div className="mt-2 space-y-2">
          {canal.bandas.map((banda, indice) => (
            <div key={`${canal.fuenteId}-${banda.frecuencia}`} className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-xs tabular-nums text-muted-foreground">
                {banda.frecuencia} Hz
              </span>
              <Slider
                min={-12}
                max={12}
                step={1}
                value={[banda.gananciaDb]}
                onValueChange={(valores) => {
                  const ganancia = valores[0];
                  if (ganancia !== undefined) acciones?.cambiarBanda?.(canal.fuenteId, indice, ganancia);
                }}
                disabled={!acciones?.cambiarBanda}
                aria-label={`Banda de ${banda.frecuencia} Hz de ${nombre}`}
              />
              <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {banda.gananciaDb} dB
              </span>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Limitador {canal.limitador.umbralDb} dB · {canal.limitador.ratio}:1
          </p>
        </div>
      </details>
    </div>
  );
}

export function PanelSalaSonido({
  sala,
  yo,
  mezcla,
  titulo,
  nombres,
  ahoraMs,
  acciones,
  compacto = false,
}: PropsSalaSonido) {
  const ahora = useAhora(ahoraMs);
  const canales = useMemo(() => mezcla?.canales ?? derivarCanales(sala), [mezcla, sala]);
  const modo = mezcla?.modo ?? "mezcla";
  const controladores = controladoresEfectivos(sala);
  const mando = puedeControlar(sala, yo);
  const actual = sala.cola.find((e) => e.id === sala.reproduccion.entradaId) ?? null;
  const duracion = actual?.fuente.duracionMs;
  const posicion = posicionEn(sala, ahora);
  const progreso = duracion && duracion > 0 ? Math.min(100, (posicion / duracion) * 100) : 0;
  const nombreSala = titulo?.trim() || "Sala compartida";

  return (
    <section
      className={cn(
        "flex w-full min-w-0 flex-col gap-3 overflow-hidden rounded-2xl border border-border/60 bg-card/80 text-card-foreground shadow-sm backdrop-blur",
        compacto ? "p-3" : "p-4",
      )}
      aria-label={`Sala de sonido ${nombreSala}`}
    >
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Sala de sonido
          </p>
          <h2 className="truncate text-base font-semibold sm:text-lg">{nombreSala}</h2>
          <p className="text-xs text-muted-foreground">
            {sala.oyentes.length} en la sala · {mando ? "Puedes controlar" : "Solo escuchas"}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1">
          <Badge variant="outline">{ETIQUETA_VISIBILIDAD[sala.visibilidad]}</Badge>
          <Badge variant="secondary">{modo === "mezcla" ? "Mezcla" : "Turnos"}</Badge>
        </div>
      </header>

      <div className={cn("grid min-w-0 gap-3", compacto ? "grid-cols-1" : "md:grid-cols-2")}>
        <div className="flex min-w-0 flex-col gap-3">
          <Seccion icono={<AudioLines className="h-4 w-4" />} titulo="Suena ahora">
            {actual ? (
              <div className="min-w-0 space-y-2">
                <div className="flex min-w-0 items-center gap-2">
                  <FileAudio className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{actual.fuente.nombre}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatearMs(posicion)}{duracion ? ` / ${formatearMs(duracion)}` : ""}
                  </span>
                </div>
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progreso)}
                  aria-label="Avance de la pista"
                >
                  <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${progreso}%` }} />
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={BOTON_ICONO}
                    onClick={() => acciones?.alternarReproduccion?.()}
                    disabled={!mando || !acciones?.alternarReproduccion}
                    aria-label={sala.reproduccion.reproduciendo ? "Pausar" : "Reproducir"}
                  >
                    {sala.reproduccion.reproduciendo ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    className={BOTON_ICONO}
                    onClick={() => acciones?.avanzar?.()}
                    disabled={!mando || !acciones?.avanzar}
                    aria-label="Pasar a la siguiente"
                  >
                    <SkipForward className="h-4 w-4" />
                  </button>
                  <span className="min-w-0 truncate text-xs text-muted-foreground">
                    La añadió {nombreDe(nombres, actual.anadidaPor)}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                La cola está vacía. Añade audio desde tus archivos, la Biblioteca o una app.
              </p>
            )}
          </Seccion>

          <div className="flex flex-wrap gap-2">
            <button type="button" className={BOTON} onClick={() => acciones?.anadirFuente?.("archivos")} disabled={!acciones?.anadirFuente}>
              <FolderOpen className="h-4 w-4" aria-hidden="true" /> Archivos
            </button>
            <button type="button" className={BOTON} onClick={() => acciones?.anadirFuente?.("biblioteca")} disabled={!acciones?.anadirFuente}>
              <Library className="h-4 w-4" aria-hidden="true" /> Biblioteca
            </button>
            <button type="button" className={BOTON} onClick={() => acciones?.anadirFuente?.("app")} disabled={!acciones?.anadirFuente}>
              <ListMusic className="h-4 w-4" aria-hidden="true" /> App
            </button>
          </div>

          <Seccion icono={<ListMusic className="h-4 w-4" />} titulo={`Cola (${sala.cola.length})`}>
            {sala.cola.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin pistas todavía.</p>
            ) : (
              <ScrollArea className="max-h-56 pr-2">
                <ol className="space-y-1">
                  {sala.cola.map((entrada, indice) => {
                    const sonando = entrada.id === sala.reproduccion.entradaId;
                    return (
                      <li
                        key={entrada.id}
                        className={cn(
                          "flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5",
                          sonando ? "bg-primary/10" : "hover:bg-accent/50",
                        )}
                      >
                        <span className="w-4 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                          {indice + 1}
                        </span>
                        <button
                          type="button"
                          className="min-w-0 flex-1 cursor-pointer truncate text-left text-sm disabled:cursor-not-allowed"
                          onClick={() => acciones?.saltarA?.(entrada.id)}
                          disabled={!mando || !acciones?.saltarA}
                          title={entrada.fuente.nombre}
                        >
                          {entrada.fuente.nombre}
                        </button>
                        <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                          {nombreDe(nombres, entrada.anadidaPor)}
                        </span>
                        {acciones?.quitarDeCola && (
                          <button
                            type="button"
                            className={cn(BOTON_ICONO, "h-7 w-7")}
                            onClick={() => acciones?.quitarDeCola?.(entrada.id)}
                            aria-label={`Quitar ${entrada.fuente.nombre} de la cola`}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </ScrollArea>
            )}
          </Seccion>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <Seccion
            icono={<SlidersHorizontal className="h-4 w-4" />}
            titulo="Mezclador"
            extra={
              <div className="flex gap-1" role="group" aria-label="Modo de mezcla">
                {(["mezcla", "turnos"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={cn(BOTON, "px-2 py-1", modo === m && ACTIVO)}
                    onClick={() => acciones?.cambiarModoMezcla?.(m)}
                    disabled={!mando || !acciones?.cambiarModoMezcla}
                    aria-pressed={modo === m}
                  >
                    {m === "mezcla" ? "Mezcla" : "Turnos"}
                  </button>
                ))}
              </div>
            }
          >
            {canales.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Añade una fuente para ajustar su nivel, ecualizador y limitador.
              </p>
            ) : (
              <div className="space-y-2">
                {canales.map((canal) => (
                  <FilaCanal key={canal.fuenteId} canal={canal} nombres={nombres} acciones={acciones} />
                ))}
              </div>
            )}
          </Seccion>

          <Seccion
            icono={sala.visibilidad === "nada" ? <Lock className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            titulo="Quién controla y quién ve"
          >
            <div className="flex flex-wrap gap-1" role="group" aria-label="Modo de control">
              {MODOS_CONTROL.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={cn(BOTON, "px-2 py-1", sala.control === m && ACTIVO)}
                  onClick={() => acciones?.cambiarControl?.(m, sala.controladores)}
                  disabled={!mando || !acciones?.cambiarControl}
                  aria-pressed={sala.control === m}
                >
                  {ETIQUETA_CONTROL[m]}
                </button>
              ))}
            </div>
            <ul className="mt-2 space-y-1">
              {sala.oyentes.map((n) => {
                const controla = controladores.includes(n);
                const alternar = () => {
                  const siguiente = controla
                    ? sala.controladores.filter((x) => x !== n)
                    : [...sala.controladores, n];
                  acciones?.cambiarControl?.("elegidas", siguiente);
                };
                return (
                  <li key={n} className="flex min-w-0 items-center gap-2 rounded-lg px-1 py-1 text-sm">
                    <span
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-semibold uppercase"
                      aria-hidden="true"
                    >
                      {iniciales(nombreDe(nombres, n))}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {nombreDe(nombres, n)}
                      {n === yo ? " (tú)" : ""}
                    </span>
                    {controla && (
                      <Badge variant="secondary" className="shrink-0 gap-1">
                        <Crown className="h-3 w-3" aria-hidden="true" /> Controla
                      </Badge>
                    )}
                    {sala.control === "elegidas" && mando && (
                      <button
                        type="button"
                        className={cn(BOTON, "px-2 py-0.5")}
                        onClick={alternar}
                        disabled={!acciones?.cambiarControl}
                      >
                        {controla ? "Quitar" : "Dar"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 border-t border-border/50 pt-3">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Lo que suena lo ven
              </p>
              <div className="flex flex-wrap gap-1" role="group" aria-label="Visibilidad de lo que suena">
                {VISIBILIDADES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={cn(BOTON, "px-2 py-1", sala.visibilidad === v && ACTIVO)}
                    onClick={() => acciones?.cambiarVisibilidad?.(v)}
                    disabled={!mando || !acciones?.cambiarVisibilidad}
                    aria-pressed={sala.visibilidad === v}
                  >
                    {ETIQUETA_VISIBILIDAD[v]}
                  </button>
                ))}
              </div>
            </div>
          </Seccion>
        </div>
      </div>
    </section>
  );
}
