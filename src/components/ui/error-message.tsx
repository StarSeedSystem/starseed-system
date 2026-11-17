import { AlertTriangle, Info, ShieldAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContextoErrorArea } from "@/lib/mando/areas";

/** Gravedad del mensaje: decide color, icono y forma de anunciarlo. */
export type TonoError = "error" | "aviso" | "info";

export interface EntradaMensajeError {
  /** Qué pasó, en una frase directa. */
  mensaje: string;
  /** Consecuencia concreta; si falta, se usa la del tono. */
  detalle?: string;
  /** Salida recomendada; si falta, se usa la del contexto o la del tono. */
  sugerencia?: string;
  tono?: TonoError;
  contexto?: Pick<ContextoErrorArea, "nombre" | "salida">;
}

export interface MensajeError {
  titulo: string;
  detalle: string;
  sugerencia: string;
  tono: TonoError;
  anuncio: string;
}

const DETALLE_POR_TONO: Record<TonoError, string> = {
  error: "No se guardó ningún cambio. Tu progreso anterior sigue intacto.",
  aviso: "Puedes seguir usando el resto del OS mientras se resuelve.",
  info: "Esto es solo un aviso; no hace falta que hagas nada.",
};

const SUGERENCIA_POR_TONO: Record<TonoError, string> = {
  error: "Revisa la conexión y vuelve a intentarlo.",
  aviso: "Si vuelve a pasar, cambia esta opción desde Ajustes.",
  info: "No hace falta que hagas nada.",
};

/** Normaliza espacios y garantiza puntuación final sin duplicarla. */
function frase(texto: string, respaldo: string): string {
  const limpio = (texto || "").trim().replace(/\s+/g, " ");
  const base = limpio || respaldo;
  return /[.!?…]$/.test(base) ? base : `${base}.`;
}

/** Construye el mensaje completo sin tocar el DOM: entrada → salida. */
export function describirError(entrada: EntradaMensajeError): MensajeError {
  const tono = entrada.tono ?? "error";
  const base = frase(entrada.mensaje, "Algo no salió como esperaba");
  const titulo = entrada.contexto?.nombre ? `${entrada.contexto.nombre} · ${base}` : base;
  const detalle = frase(entrada.detalle ?? "", DETALLE_POR_TONO[tono]);
  const sugerencia = frase(entrada.sugerencia ?? entrada.contexto?.salida ?? "", SUGERENCIA_POR_TONO[tono]);
  return { titulo, detalle, sugerencia, tono, anuncio: `${titulo} ${detalle} ${sugerencia}` };
}

export interface ErrorMessageProps extends EntradaMensajeError {
  className?: string;
  onReintentar?: () => void;
  textoReintentar?: string;
}

type EstiloTono = { caja: string; icono: string; boton: string; Icono: LucideIcon };

const ESTILO_POR_TONO: Record<TonoError, EstiloTono> = {
  error: { caja: "border-rose-400/60 bg-rose-950/70 text-rose-50", icono: "text-rose-300", boton: "border-rose-300/60 text-rose-50 hover:bg-rose-400/20", Icono: ShieldAlert },
  aviso: { caja: "border-amber-400/60 bg-amber-950/65 text-amber-50", icono: "text-amber-300", boton: "border-amber-300/60 text-amber-50 hover:bg-amber-400/20", Icono: AlertTriangle },
  info: { caja: "border-cyan-400/50 bg-slate-900/85 text-cyan-50", icono: "text-cyan-300", boton: "border-cyan-300/60 text-cyan-50 hover:bg-cyan-400/20", Icono: Info },
};

export function ErrorMessage({
  className,
  onReintentar,
  textoReintentar = "Reintentar",
  ...entrada
}: ErrorMessageProps) {
  const { titulo, detalle, sugerencia, tono } = describirError(entrada);
  const estilo = ESTILO_POR_TONO[tono];
  const Icono = estilo.Icono;
  return (
    <div
      role={tono === "error" ? "alert" : "status"}
      aria-live={tono === "error" ? "assertive" : "polite"}
      className={cn("flex items-start gap-3 rounded-xl border p-3.5", estilo.caja, className)}
    >
      <Icono className={cn("mt-0.5 h-4 w-4 shrink-0", estilo.icono)} aria-hidden />
      <div className="min-w-0 space-y-1">
        <p className="text-base font-semibold leading-snug">{titulo}</p>
        <p className="text-sm leading-relaxed">{detalle}</p>
        <p className="text-sm leading-snug">
          <span className="font-semibold">Qué puedes hacer:</span> {sugerencia}
        </p>
        {onReintentar && (
          <button
            type="button"
            onClick={onReintentar}
            className={cn(
              "mt-1 min-h-11 cursor-pointer rounded-md border px-3 text-sm font-medium transition-colors duration-200",
              estilo.boton,
            )}
          >
            {textoReintentar}
          </button>
        )}
      </div>
    </div>
  );
}
