"use client";

/**
 * AjustesRespuestaPopover — botón «Más ajustes» del compositor de Astraura.
 * ============================================================================
 * Popover compacto (vidrio: `rounded-2xl border-white/10` + fondo oscuro
 * translúcido, mismas tipografías que el resto del chat) con TRES controles —
 * Esfuerzo · Tipo de respuesta · Tiempo máximo aproximado — cada uno
 * gobernado por SU PROPIO interruptor «Automático» (ON por defecto). La
 * traducción de la selección a señales reales (maxTokens, sesgo de ruta,
 * instrucción de system prompt, plazo) vive en el módulo PURO
 * `lib/astraura/ajustes-respuesta.ts` — este archivo es sólo interfaz.
 *
 * DISEÑO DE CADA CONTROL (justificado, no arbitrario):
 *   · Esfuerzo / Tiempo máximo → deslizador de POSICIÓN discreta (4 y 6
 *     paradas) + un interruptor «Automático» que lo deshabilita: una posición
 *     de deslizador no tiene un "automático" natural, así que hace falta un
 *     interruptor aparte que decida si esa posición cuenta.
 *   · Tipo de respuesta → elección SEGMENTADA (7 opciones, "Automático" es UNA
 *     de ellas — así lo pide el encargo). Aquí "Automático" SÍ es un valor
 *     más del propio segmentado: no hace falta un interruptor aparte porque
 *     elegir cualquier otra opción YA es, por definición, salir de automático.
 *
 * COMPONENTE CONTROLADO: este archivo no guarda estado propio de la
 * selección — lo hace `chat-surface.tsx` (ver el porqué de "recordar para
 * este chat" vs "solo el próximo mensaje" en el JSDoc de `ajustes-respuesta.ts`).
 * Sólo expone los helpers de lectura/escritura del ajuste RECORDADO por chat
 * (mismo almacén que `ChatPersonalityTray`: `getChatConfig`/`patchChatConfig`).
 */

import { useId, type ReactNode } from "react";
import { SlidersHorizontal, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { getChatConfig } from "@/lib/aurora/turn";
import { patchChatConfig } from "@/lib/aurora/config-change";
import type { ChatConfig } from "@/components/aurora/chat-config-menu";
import {
  ajustesAutomaticosPorDefecto,
  esTodoAutomatico,
  NIVELES_ESFUERZO,
  ORDEN_ESFUERZO,
  ORDEN_TIEMPOS,
  ORDEN_TIPOS,
  resolverAjustes,
  TIEMPOS_MAXIMOS,
  TIPOS_RESPUESTA,
  type AjustesManualRespuesta,
} from "@/lib/astraura/ajustes-respuesta";

// ── Persistencia «Recordar para este chat» (mismo almacén que el resto de
//    ajustes por chat — Adenda 71-bis: aurora_conversations.meta.config) ────

/** Campo que este popover añade a `meta.config` del chat, fuera de `ChatConfig`
 *  (chat-config-menu.tsx no lo conoce: mismo patrón que ya usa
 *  `Astraura158ChatConfigExtra` en `chat-personality-tray.tsx`). */
export interface AjustesRespuestaChatConfigExtra {
  ajustesRespuesta?: AjustesManualRespuesta;
}

/** Selección recordada para este chat, o `null` si el usuario nunca marcó
 *  «Recordar para este chat» (entonces rige el estado local de sólo-próximo-mensaje). */
export function readAjustesRespuestaChat(convId: string | null | undefined): AjustesManualRespuesta | null {
  const cfg = getChatConfig(convId) as ChatConfig & AjustesRespuestaChatConfigExtra;
  return cfg.ajustesRespuesta ?? null;
}

/** Guarda (o borra, con `null`) la selección recordada de este chat. Nunca lanza. */
export async function persistAjustesRespuestaChat(
  convId: string | null | undefined,
  manual: AjustesManualRespuesta | null,
): Promise<void> {
  if (!convId) return;
  const patch: Partial<ChatConfig> & AjustesRespuestaChatConfigExtra = { ajustesRespuesta: manual ?? undefined };
  await patchChatConfig(convId, patch);
}

// ── Estilo «vidrio» compartido (consistente con ChatPersonalityTray/menús) ──

const GLASS_POPOVER =
  "z-[70] w-[min(92vw,380px)] rounded-2xl border border-white/10 bg-background/95 p-4 text-white shadow-2xl backdrop-blur-xl";

function clampIndex(i: number, len: number): number {
  return Math.max(0, Math.min(len - 1, i));
}

// ── Badge del compositor («Profundo · Paso a paso · ≤30 s») ─────────────────

export interface AjustesRespuestaBadgeProps {
  texto: string;
  onReset: () => void;
  className?: string;
}

/** Insignia compacta con lo NO automático elegido; un clic la resetea a
 *  automático (sin tocar «Recordar para este chat»: eso lo decide el popover). */
export function AjustesRespuestaBadge({ texto, onReset, className }: AjustesRespuestaBadgeProps) {
  if (!texto) return null;
  return (
    <button
      type="button"
      onClick={onReset}
      title="Restablecer a automático"
      aria-label={`Ajustes de esta respuesta: ${texto}. Pulsa para restablecer a automático.`}
      className={cn(
        "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-violet-400/30 bg-violet-500/10 px-2.5 text-[11px] font-medium text-violet-100 transition-colors hover:border-violet-400/50 hover:bg-violet-500/20",
        className,
      )}
    >
      <SlidersHorizontal className="h-3 w-3 shrink-0 text-violet-300" />
      <span className="max-w-[46vw] truncate sm:max-w-[220px]">{texto}</span>
      <X className="h-3 w-3 shrink-0 text-violet-300/70" />
    </button>
  );
}

// ── Popover principal ────────────────────────────────────────────────────────

export interface AjustesRespuestaPopoverProps {
  value: AjustesManualRespuesta;
  onChange: (next: AjustesManualRespuesta) => void;
  /** ¿Esta selección está "recordada" para el chat (persistida) o sólo rige el
   *  próximo mensaje? `undefined` si no aplica (p.ej. regenerar un mensaje ya
   *  enviado no ofrece recordar: sólo afecta a ESE turno). */
  remember?: boolean;
  onRememberChange?: (next: boolean) => void;
  /** Sin conversación activa aún no hay dónde recordar el ajuste. */
  canRemember?: boolean;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Título de la cabecera del popover — «Ajustar y regenerar» desde la
   *  acción por mensaje, «Más ajustes de esta respuesta» en el compositor. */
  title?: string;
  triggerClassName?: string;
  /** Contenido del botón disparador; por defecto el icono solo. */
  triggerChildren?: ReactNode;
  triggerLabel?: string;
  /**
   * Pie opcional bajo los tres controles — p.ej. el botón «Regenerar con estos
   * ajustes» de la acción «Ajustar» por mensaje. En el compositor se omite:
   * ahí los ajustes se aplican solos al enviar, sin un paso de confirmación.
   */
  footer?: ReactNode;
}

export function AjustesRespuestaPopover({
  value,
  onChange,
  remember,
  onRememberChange,
  canRemember = true,
  disabled,
  open,
  onOpenChange,
  title = "Más ajustes de esta respuesta",
  triggerClassName,
  triggerChildren,
  triggerLabel = "Más ajustes de la respuesta",
  footer,
}: AjustesRespuestaPopoverProps) {
  const idBase = useId();
  const resuelto = resolverAjustes(false, value);
  const esfuerzoIdx = clampIndex(ORDEN_ESFUERZO.indexOf(value.esfuerzo.valor), ORDEN_ESFUERZO.length);
  const tiempoIdx = clampIndex(ORDEN_TIEMPOS.indexOf(value.tiempo.valor), ORDEN_TIEMPOS.length);
  const nivelActual = NIVELES_ESFUERZO[ORDEN_ESFUERZO[esfuerzoIdx]];
  const tiempoActual = TIEMPOS_MAXIMOS[ORDEN_TIEMPOS[tiempoIdx]];

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={disabled}
          aria-label={triggerLabel}
          title={triggerLabel}
          className={cn(
            "mb-0.5 size-11 shrink-0 rounded-full border-white/12 bg-white/[0.03] text-white/70 hover:border-white/25 hover:text-white",
            !esTodoAutomatico(value) && "border-violet-400/40 text-violet-200",
            triggerClassName,
          )}
        >
          {triggerChildren ?? <SlidersHorizontal className="h-4 w-4" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" sideOffset={10} className={GLASS_POPOVER}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {!esTodoAutomatico(value) && (
            <button
              type="button"
              onClick={() => onChange(ajustesAutomaticosPorDefecto())}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-[11px] text-white/50 transition-colors hover:text-white"
              title="Restablecer los tres controles a automático"
            >
              <RotateCcw className="h-3 w-3" /> Automático
            </button>
          )}
        </div>

        <div className="mt-3 space-y-4">
          {/* ── Esfuerzo ─────────────────────────────────────────────── */}
          <section aria-labelledby={`${idBase}-esfuerzo-label`}>
            <div className="flex items-center justify-between gap-2">
              <span id={`${idBase}-esfuerzo-label`} className="text-xs font-medium text-white/80">
                Esfuerzo
              </span>
              <label className="flex items-center gap-2 text-[11px] text-white/50">
                Automático
                <Switch
                  checked={value.esfuerzo.auto}
                  onCheckedChange={(auto) => onChange({ ...value, esfuerzo: { ...value.esfuerzo, auto } })}
                  aria-label="Esfuerzo automático"
                />
              </label>
            </div>
            <Slider
              className="mt-3"
              min={0}
              max={ORDEN_ESFUERZO.length - 1}
              step={1}
              disabled={value.esfuerzo.auto}
              value={[esfuerzoIdx]}
              onValueChange={([i]) =>
                onChange({ ...value, esfuerzo: { auto: false, valor: ORDEN_ESFUERZO[clampIndex(i, ORDEN_ESFUERZO.length)] } })
              }
              getAriaValueText={(i) => NIVELES_ESFUERZO[ORDEN_ESFUERZO[clampIndex(i, ORDEN_ESFUERZO.length)]].etiqueta}
              aria-label="Nivel de esfuerzo"
            />
            <div className="mt-1.5 grid grid-cols-4 text-center text-[10px] text-white/40">
              {ORDEN_ESFUERZO.map((n, i) => (
                <span key={n} className={cn(i === esfuerzoIdx && !value.esfuerzo.auto && "font-semibold text-violet-200")}>
                  {NIVELES_ESFUERZO[n].etiqueta}
                </span>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-white/45">{nivelActual.explicacion}</p>
          </section>

          {/* ── Tipo de respuesta ────────────────────────────────────── */}
          <section aria-labelledby={`${idBase}-tipo-label`}>
            <span id={`${idBase}-tipo-label`} className="text-xs font-medium text-white/80">
              Tipo de respuesta
            </span>
            <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo de respuesta">
              {ORDEN_TIPOS.map((t) => {
                // Un pill está "seleccionado" cuando es el valor elegido — para
                // "auto" basta con que sea el valor actual (el interruptor de
                // Tipo no existe por separado: "Automático" es un pill más, ver
                // el JSDoc de cabecera).
                const selected = value.tipo.valor === t && (t !== "auto" ? !value.tipo.auto : true);
                return (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onChange({ ...value, tipo: { auto: t === "auto", valor: t } })}
                    className={cn(
                      "min-h-11 cursor-pointer rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors",
                      selected
                        ? "border-violet-400/50 bg-violet-500/20 text-violet-100"
                        : "border-white/10 bg-transparent text-white/50 hover:border-white/25 hover:text-white/80",
                    )}
                  >
                    {TIPOS_RESPUESTA[t].etiqueta}
                  </button>
                );
              })}
            </div>
            {resuelto.instruccion && (
              <p className="mt-1.5 text-[11px] leading-snug text-white/45">{resuelto.instruccion}</p>
            )}
          </section>

          {/* ── Tiempo máximo aproximado ─────────────────────────────── */}
          <section aria-labelledby={`${idBase}-tiempo-label`}>
            <div className="flex items-center justify-between gap-2">
              <span id={`${idBase}-tiempo-label`} className="text-xs font-medium text-white/80">
                Tiempo máximo aproximado
              </span>
              <label className="flex items-center gap-2 text-[11px] text-white/50">
                Automático
                <Switch
                  checked={value.tiempo.auto}
                  onCheckedChange={(auto) => onChange({ ...value, tiempo: { ...value.tiempo, auto } })}
                  aria-label="Tiempo máximo automático"
                />
              </label>
            </div>
            <Slider
              className="mt-3"
              min={0}
              max={ORDEN_TIEMPOS.length - 1}
              step={1}
              disabled={value.tiempo.auto}
              value={[tiempoIdx]}
              onValueChange={([i]) =>
                onChange({ ...value, tiempo: { auto: false, valor: ORDEN_TIEMPOS[clampIndex(i, ORDEN_TIEMPOS.length)] } })
              }
              getAriaValueText={(i) => TIEMPOS_MAXIMOS[ORDEN_TIEMPOS[clampIndex(i, ORDEN_TIEMPOS.length)]].etiqueta}
              aria-label="Tiempo máximo aproximado"
            />
            <div className="mt-1.5 grid grid-cols-6 text-center text-[9.5px] text-white/40">
              {ORDEN_TIEMPOS.map((t, i) => (
                <span key={t} className={cn(i === tiempoIdx && !value.tiempo.auto && "font-semibold text-violet-200")}>
                  {TIEMPOS_MAXIMOS[t].etiqueta}
                </span>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-white/45">
              Aproximado, no exacto — {tiempoActual.etiqueta === "sin límite" ? "sin cortar la respuesta." : "si se supera, verás la respuesta parcial con un aviso."}
            </p>
          </section>
        </div>

        {onRememberChange && (
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/10 pt-3">
            <label className="flex items-center gap-2 text-[11px] text-white/60">
              <Switch
                checked={!!remember}
                disabled={!canRemember}
                onCheckedChange={onRememberChange}
                aria-label="Recordar estos ajustes para este chat"
              />
              Recordar para este chat
            </label>
            <span className="text-[10px] text-white/35">
              {remember ? "Se aplica a los próximos turnos" : "Sólo el próximo mensaje"}
            </span>
          </div>
        )}

        {footer && <div className="mt-4 border-t border-white/10 pt-3">{footer}</div>}
      </PopoverContent>
    </Popover>
  );
}

export default AjustesRespuestaPopover;
