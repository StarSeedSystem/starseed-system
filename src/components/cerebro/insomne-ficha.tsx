"use client";

/* insomne-ficha — «Siempre disponible (pantalla cerrada)» por neurona (INS1027D). Contrato:
 * architecture/neurona-insomne.md §5. El OS LEE el estado (presencia y ruta local); nunca
 * ejecuta `pmset` ni su sudoers. */
import { useEffect, useState } from "react";
import { MoonStar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { usePresenciaNeuronas } from "@/lib/neurons/presencia";
import type { Neuron } from "@/lib/neurons/neurons";
import {
  capacidadInsomne, debeSoltarTrabajo, politicaInsomne,
  type EstadoInsomne, type PoliticaInsomne, type ProveedorInsomne,
} from "@/lib/neurons/insomne";

/** Ficha «Insomnia» (lib-insomnia) de la Biblioteca. */
export const RUTA_FICHA_INSOMNIA = "/library?tab=destacado";

/** Lo que la ficha necesita de un medio (estructural: `PresenciaMedio` lo satisface). */
export interface MedioAnuncio { n: string; t: number; s?: { insomne?: { hasta: number; proveedor: string } } }

const PROVEEDOR_NOMBRE: Record<ProveedorInsomne, string> = {
  insomnia: "Insomnia (barra de menús de la Mac)", caffeinate: "caffeinate (Genesis · Servidor 1.58)",
  "systemd-inhibit": "systemd-inhibit (Linux)", powercfg: "powercfg (Windows)",
  siempre: "siempre encendido (servidor)", "wake-lock": "Screen Wake Lock (pestaña visible)", no: "sin proveedor",
};
const ETIQUETAS: Array<[keyof PoliticaInsomne, string]> = [
  ["agentes", "agentes del enjambre"], ["programados", "procesos programados"], ["malla", "malla P2P (faros y relé)"],
  ["servidorCerebro", "servidor del cerebro"], ["biblioteca", "biblioteca y archivos"],
];

/** Hora local «HH:MM» a partir de un fin de sesión (ISO o epoch ms); «?» si no se entiende. */
export function horaInsomne(fin: string | number | null): string {
  const ms = fin === null ? NaN : typeof fin === "number" ? fin : Date.parse(fin);
  return Number.isFinite(ms) ? new Date(ms).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "?";
}

/** Plataforma normalizada para `capacidadInsomne`. */
export function plataformaInsomne(caps: Neuron["capabilities"] | undefined, kind?: string): string {
  const p = String(caps?.platform ?? "").toLowerCase();
  if (kind === "server") return "servidor"; if (p.startsWith("mac")) return "macos";
  return ["windows", "linux", "android"].includes(p) ? p : p === "ios" || p === "ipados" ? "ios" : "navegador";
}
/** El anuncio insomne de la presencia de la neurona, convertido en EstadoInsomne (pura). */
export function estadoDePresencia(medios: readonly MedioAnuncio[], idNeurona: string, ahora: number): EstadoInsomne | null {
  const anuncio = medios.filter((m) => m.n === idNeurona && m.s?.insomne && m.s.insomne.hasta > ahora)
    .reduce<MedioAnuncio | null>((a, b) => (!a || b.t > a.t ? b : a), null)?.s?.insomne;
  if (!anuncio) return null;
  const proveedor: ProveedorInsomne = anuncio.proveedor === "caffeinate" ? "caffeinate" : "insomnia";
  return { activo: true, hasta: new Date(anuncio.hasta).toISOString(), proveedor, motivo: "lo anuncia la presencia" };
}
/** La ficha por neurona: proveedor, estado, política e instalación en la Mac. */
export default function InsomneFicha({ neurona: n }: { neurona: Neuron }) {
  const presencia = usePresenciaNeuronas();
  const plataforma = plataformaInsomne(n.capabilities, n.kind);
  const mac = plataforma === "macos";
  const capacidad = capacidadInsomne(plataforma);
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), 30_000); return () => clearInterval(t); }, []);
  const estado = estadoDePresencia(presencia.medios, n.id, ahora);
  const activo = !!estado && estado.hasta !== null && Date.parse(estado.hasta) > ahora;
  const elegido: ProveedorInsomne = activo && estado ? estado.proveedor : capacidad.proveedor;
  const compatible = mac || (elegido !== "no" && elegido !== "wake-lock");
  const soltar = activo && estado ? debeSoltarTrabajo(estado, ahora) : false;
  return (
    <div className="rounded-xl border border-sky-400/15 bg-sky-500/[0.04] p-2.5 space-y-1.5">
      <div className="flex items-center gap-2">
        <MoonStar className="w-4 h-4 text-sky-300 shrink-0" />
        <span className="text-xs font-semibold text-white/85">Siempre disponible (pantalla cerrada)</span>
        <Badge variant="outline" className={cn("text-[9px] ml-auto shrink-0",
          activo ? "border-emerald-400/30 text-emerald-300 bg-emerald-500/10"
            : compatible ? "border-sky-400/30 text-sky-200 bg-sky-500/10" : "border-zinc-500/30 text-zinc-400 bg-black/20")}>
          {activo && estado ? `activa hasta ${horaInsomne(estado.hasta)}` : compatible ? "compatible" : "no compatible"}
        </Badge>
      </div>
      <p className="text-[11px] text-white/60 leading-relaxed">
        {mac ? (
          <>
            Proveedor: <strong className="text-white/85">Insomnia</strong> si es macOS 26 en Apple Silicon; con la tapa
            cerrada sigue sirviendo hasta la hora de fin de la sesión. Otra Mac: solo con corriente y pantalla externa (caffeinate).
          </>
        ) : (
          <>Proveedor: <strong className="text-white/85">{PROVEEDOR_NOMBRE[elegido]}</strong> — {capacidad.motivo}.</>
        )}
      </p>
      {activo && estado && (
        <p className="text-[11px] text-emerald-200/90 leading-relaxed">
          Sesión activa con {PROVEEDOR_NOMBRE[estado.proveedor]}: sigue en servicio con la pantalla cerrada hasta las {horaInsomne(estado.hasta)}.
          {soltar && " Queda poco (menos de 15 min o batería baja): soltará trabajo y la colmena lo reenruta."}
        </p>
      )}
      {!estado && !presencia.conectado && (
        <p className="text-[11px] text-amber-300/80">Sin anuncio en vivo ahora mismo: la presencia no está conectada.</p>
      )}
      {compatible && (
        <div className="flex items-center gap-1 flex-wrap text-[11px] text-white/50">
          <span>Sigue funcionando:</span>
          {ETIQUETAS.filter(([c]) => politicaInsomne()[c]).map(([c, etiqueta]) => (
            <Badge key={c} variant="outline" className="text-[9px] border-white/15 text-white/70 bg-black/20 cursor-default">{etiqueta}</Badge>
          ))}
        </div>
      )}
      {mac && !activo && (
        <div className="rounded-lg border border-white/10 bg-black/20 p-2.5 text-[11px] leading-relaxed text-white/60">
          <p>
            Para una Mac compatible: instala{" "}
            <a href={RUTA_FICHA_INSOMNIA} className="text-sky-300 hover:underline cursor-pointer">la ficha «Insomnia» de la Biblioteca</a>{" "}
            y empieza la sesión tú desde su barra de menús; el OS solo lee cuánto le queda.
          </p>
          <p className="text-[10px] text-amber-300/85">
            Aviso de Apple: úsala sobre una superficie estable y ventilada, nunca dentro de una bolsa. Aviso del
            instalador: deja una regla de sudoers (/etc/sudoers.d/insomnia) que permite a cualquier programa de tu
            usuario ejecutar <code>pmset disablesleep</code> sin contraseña — revísala; el OS nunca la usa: la sesión la empiezas tú y la paras tú.
          </p>
        </div>
      )}
    </div>
  );
}
