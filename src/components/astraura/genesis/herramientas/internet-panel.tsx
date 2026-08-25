"use client";

/**
 * internet-panel.tsx — `CapacidadInternet`, EXPLICADA antes del clic (punto
 * 2 del encargo de OLA 2).
 *
 * Alex: "deben tener una opción de acceso a internet que use todas las
 * herramientas de la librería en línea del os y la biblioteca del usuario y
 * las carpetas y archivos de dispositivo". Cuatro fuentes que se conceden
 * POR SEPARADO — "leer la biblioteca del OS" y "leer tus carpetas" no son
 * el mismo permiso ni de lejos — así que cada interruptor vive SIEMPRE al
 * lado de la frase que dice qué concede exactamente, igual que
 * `soberania-panel.tsx` hace con sus tres zonas: nunca detrás de un tooltip
 * que nadie abre. Un permiso concedido sin entenderlo es un permiso mal
 * concedido.
 *
 * `ultimoError` se enseña APARTE del interruptor general y sin importar su
 * estado: un acceso roto no puede parecer un acceso apagado.
 *
 * Edición: mismo criterio no controlado que `soberania-panel.tsx` — texto
 * con `defaultValue`/`onBlur`, interruptores con `onCheckedChange`
 * inmediato. El padre debe montar este panel con `key={ser.id}` para que
 * cambiar de ser reinicie los campos de texto al ser nuevo.
 */
import { AlertTriangle, FolderHeart, HardDrive, Library, Globe as WebIcon, Wifi, WifiOff, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CapacidadInternet } from "@/lib/astraura/genesis-types";
import { Switch } from "@/components/ui/switch";
import { Badge, Field, LABEL, SUB, TEXTAREA, fmtTs } from "../../s158/shared";
import { joinLineList, parseLineList } from "../genesis-logic";
import {
  FUENTES_INTERNET,
  capacidadInternetEfectiva,
  describirCapacidadInternet,
  describirDominios,
  riesgoTono,
  type FuenteInternetId,
  type FuenteInternetInfo,
} from "./herramientas-logic";

const ICONO_FUENTE: Record<FuenteInternetId, LucideIcon> = {
  bibliotecaOS: Library,
  bibliotecaUsuario: FolderHeart,
  dispositivo: HardDrive,
  web: WebIcon,
};

export interface InternetPanelProps {
  value: CapacidadInternet | null | undefined;
  onCommit: (patch: Partial<CapacidadInternet>) => void;
  disabled?: boolean;
}

function FuenteRow({
  info,
  activo,
  disabled,
  onToggle,
}: {
  info: FuenteInternetInfo;
  activo: boolean;
  disabled?: boolean;
  onToggle: (v: boolean) => void;
}) {
  const Icon = ICONO_FUENTE[info.id];
  return (
    <div className={cn(SUB, "flex items-start gap-2 px-3 py-2")}>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-[11px] font-semibold text-white/85">{info.titulo}</p>
          <Badge tone={riesgoTono(info.riesgo)}>riesgo {info.riesgo}</Badge>
        </div>
        {/* La explicación va SIEMPRE aquí, visible antes del clic — nunca en un tooltip que nadie abre. */}
        <p className="mt-0.5 text-[10px] leading-snug text-white/60">{info.explicacion}</p>
      </div>
      <Switch
        checked={activo}
        disabled={disabled}
        aria-label={`${info.titulo} — ${info.explicacion}`}
        onCheckedChange={onToggle}
      />
    </div>
  );
}

export function InternetPanel({ value, onCommit, disabled }: InternetPanelProps) {
  const c = capacidadInternetEfectiva(value);
  const resumen = describirCapacidadInternet(value);
  const dominios = describirDominios(value);

  function commitDominios(campo: "dominiosPermitidos" | "dominiosBloqueados", texto: string) {
    const siguiente = parseLineList(texto);
    if (JSON.stringify(siguiente) === JSON.stringify(c[campo])) return; // sin cambios reales: no dispares un POST de la nada
    onCommit({ [campo]: siguiente } as Partial<CapacidadInternet>);
  }

  return (
    <div className="space-y-3">
      {/* Un acceso roto no puede parecer un acceso apagado: el error real, si lo hay, sale SIEMPRE — con el acceso encendido o apagado. */}
      {resumen.tieneError && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-400/40 bg-rose-500/[0.08] px-3 py-2" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-rose-100">El último acceso a la red falló de verdad: {c.ultimoError}</p>
            {c.ultimoAcceso ? <p className="mt-0.5 text-[10px] text-rose-200/70">Último intento: {fmtTs(c.ultimoAcceso)}.</p> : null}
          </div>
        </div>
      )}

      {/* Interruptor general — la verdad delante: apagado es apagado, aunque algo de abajo esté marcado. */}
      <div className={cn(SUB, "flex items-start gap-2 px-3 py-2")}>
        {c.activa ? (
          <Wifi className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
        ) : (
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-white/40" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-white/90">{resumen.resumen}</p>
          {c.ultimoAcceso && !resumen.tieneError ? <p className="mt-0.5 text-[10px] text-white/45">Último acceso real: {fmtTs(c.ultimoAcceso)}.</p> : null}
        </div>
        <Switch
          checked={c.activa}
          disabled={disabled}
          aria-label="Acceso a internet y herramientas — interruptor general"
          onCheckedChange={(v) => onCommit({ activa: v })}
        />
      </div>

      {/* Las cuatro fuentes, cada una con lo que concede AL LADO — nunca detrás de un clic. */}
      <div className="grid gap-1.5 sm:grid-cols-2">
        {FUENTES_INTERNET.map((info) => (
          <FuenteRow
            key={info.id}
            info={info}
            activo={c[info.id]}
            disabled={disabled}
            onToggle={(v) => onCommit({ [info.id]: v } as Partial<CapacidadInternet>)}
          />
        ))}
      </div>

      {/* Dominios: quién gana, explicado — no solo dos cajas de texto sueltas. */}
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label={`Dominios permitidos (${c.dominiosPermitidos.length})`} hint="Uno por línea. En cuanto esta lista tenga algo, la de bloqueados deja de mirarse.">
          <textarea
            className={cn(TEXTAREA, "min-h-[60px] font-code")}
            defaultValue={joinLineList(c.dominiosPermitidos)}
            disabled={disabled}
            aria-label="Dominios permitidos"
            onBlur={(e) => commitDominios("dominiosPermitidos", e.target.value)}
          />
        </Field>
        <Field label={`Dominios bloqueados (${c.dominiosBloqueados.length})`} hint="Uno por línea. Solo se aplica si la lista de permitidos está vacía.">
          <textarea
            className={cn(TEXTAREA, "min-h-[60px] font-code")}
            defaultValue={joinLineList(c.dominiosBloqueados)}
            disabled={disabled}
            aria-label="Dominios bloqueados"
            onBlur={(e) => commitDominios("dominiosBloqueados", e.target.value)}
          />
        </Field>
      </div>
      <p className={cn(LABEL, "normal-case tracking-normal text-white/45")}>{dominios.texto}</p>
    </div>
  );
}

export default InternetPanel;
