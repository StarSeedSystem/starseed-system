"use client";

/**
 * Indicador de sentidos del bot (BOT1011E2 · contrato `architecture/astraura-bots.md` §5.2).
 *
 * El anillo rodea la orbe y muestra UN icono Lucide por sentido ENCENDIDO. Mientras haya uno
 * encendido el indicador es visible (`indicadorVisible` del bucle): el Exocórtex es leal a la
 * persona y ningún sentido se enciende sin que se vea. Tocar un icono apaga ese sentido; el
 * botón «Pausar el bot» es la SALIDA siempre (pausar apaga todos los sentidos).
 */
import {
  Activity, Camera, Clipboard, FolderOpen, Globe, Mail, MapPin,
  Mic, MonitorUp, ScanEye, TerminalSquare, Usb, type LucideIcon,
} from "lucide-react";
import { indicadorVisible, type EstadoBucle } from "@/lib/astraura-bots/bucle";
import type { Sentido } from "@/lib/astraura-bots/tipos";
import { NOMBRE_SENTIDO } from "./sentidos-ui";

/** Un icono Lucide por sentido (nunca emojis). */
export const ICONO_SENTIDO: Record<Sentido, LucideIcon> = {
  microfono: Mic, camara: Camera, pantalla: MonitorUp, "captura-pantalla": ScanEye,
  archivos: FolderOpen, red: Globe, correo: Mail, terminal: TerminalSquare,
  sensores: Activity, ubicacion: MapPin, portapapeles: Clipboard, aparatos: Usb,
};

/** Diámetro del anillo en píxeles (la orbe hermana mide 48). */
export const DIAMETRO_ANILLO = 64;

export interface IndicadorSentidosProps {
  /** Estado del bucle del bot: qué sentidos están encendidos ahora mismo. */
  estado: EstadoBucle;
  /** Nombre del bot para el texto del indicador (por defecto, «Astraura»). */
  nombreBot?: string;
  /** Tocar el icono de un sentido lo apaga. */
  onApagarSentido: (sentido: Sentido) => void;
  /** Botón de salida: pausar el bot (siempre disponible). */
  onPausarBot: () => void;
}

/** Punto del icono sobre el círculo del anillo, en porcentajes. */
function posicionEnAnillo(indice: number, total: number): { izquierda: number; arriba: number } {
  const angulo = (indice / Math.max(1, total)) * Math.PI * 2 - Math.PI / 2;
  return { izquierda: 50 + 50 * Math.cos(angulo), arriba: 50 + 50 * Math.sin(angulo) };
}

export function IndicadorSentidos({
  estado,
  nombreBot = "Astraura",
  onApagarSentido,
  onPausarBot,
}: IndicadorSentidosProps) {
  const sentidos = estado.sentidosActivos;
  const visible = indicadorVisible(estado);
  const texto = sentidos.length
    ? `${nombreBot} está usando: ${sentidos.map((s) => NOMBRE_SENTIDO[s]).join(", ")}`
    : `${nombreBot} no está usando ningún sentido`;
  return (
    <div className="pointer-events-none absolute inset-0">
      <p role="status" aria-live="polite" className="sr-only">
        {texto}
      </p>
      {visible && (
        <div
          data-testid="anillo-sentidos"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/40 transition-opacity duration-200"
          style={{ width: DIAMETRO_ANILLO, height: DIAMETRO_ANILLO }}
        >
          {sentidos.map((sentido, i) => {
            const Icono = ICONO_SENTIDO[sentido];
            const { izquierda, arriba } = posicionEnAnillo(i, sentidos.length);
            return (
              <button
                key={sentido}
                type="button"
                onClick={() => onApagarSentido(sentido)}
                aria-label={`Apagar este sentido: ${NOMBRE_SENTIDO[sentido]}`}
                title="Apagar este sentido"
                style={{ left: `${izquierda}%`, top: `${arriba}%` }}
                className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full border border-cyan-200/50 bg-zinc-950/85 p-1 text-cyan-200 transition-transform duration-200 hover:scale-110"
              >
                <Icono className="h-3 w-3" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      )}
      <button
        type="button"
        onClick={onPausarBot}
        aria-label="Pausar el bot"
        title="Pausar el bot"
        style={{ top: "calc(50% + 38px)" }}
        className="pointer-events-auto absolute left-1/2 -translate-x-1/2 cursor-pointer rounded-full border border-white/20 bg-zinc-950/85 px-2 py-0.5 text-xs text-white/90 transition-colors duration-200 hover:bg-zinc-800"
      >
        Pausar el bot
      </button>
    </div>
  );
}
