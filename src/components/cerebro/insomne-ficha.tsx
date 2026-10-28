"use client";

/**
 * InsomneFicha — «Siempre disponible (pantalla cerrada)» por neurona.
 * Contrato: architecture/neurona-insomne.md §2 y §5. El OS LEE el estado de
 * Insomnia; nunca ejecuta `pmset` ni usa su regla de sudoers.
 */

import { AlertTriangle, Check, ExternalLink, MoonStar } from "lucide-react";
import { BATERIA_MINIMA, MINUTOS_AVISO_FIN, capacidadInsomne, debeSoltarTrabajo, politicaInsomne, type CapacidadInsomne, type EstadoInsomne, type PoliticaInsomne, type ProveedorInsomne } from "@/lib/neurons/insomne";

/** Lo que la presencia en vivo anuncia de la sesión insomne de una neurona. */
export interface SenalInsomneNeurona { hasta: number; proveedor: string }
/** La neurona mínima que esta ficha necesita (compatible con `Neuron`). */
export interface NeuronaInsomne {
  kind?: string;
  capabilities: { platform: string; gpuRenderer?: string; gpuVendor?: string };
  insomne?: SenalInsomneNeurona;
  politica?: Partial<PoliticaInsomne>;
}
export interface LecturaInsomne {
  capacidad: CapacidadInsomne;
  estado: EstadoInsomne;
  politica: PoliticaInsomne;
  soltarTrabajo: boolean;
}

const NOMBRES: Record<ProveedorInsomne, string> = {
  insomnia: "Insomnia", caffeinate: "caffeinate -s", "systemd-inhibit": "systemd-inhibit",
  powercfg: "powercfg", siempre: "Servidor siempre encendido", "wake-lock": "Screen Wake Lock", no: "Ninguno",
};
const ETIQUETAS: Record<keyof PoliticaInsomne, string> = {
  agentes: "Agentes del enjambre", programados: "Procesos programados", malla: "Malla P2P y réplicas",
  servidorCerebro: "Servidor del cerebro", biblioteca: "Biblioteca y archivos",
};

export function plataformaInsomne(platform: string, kind?: string): string {
  if (kind === "server") return "servidor";
  const p = String(platform ?? "").trim().toLowerCase();
  if (p.startsWith("mac") || p === "darwin") return "macos";
  if (p === "ipados" || p === "iphoneos" || p === "ios") return "ios";
  if (p.startsWith("android")) return "android";
  if (p.startsWith("windows") || p === "win32") return "windows";
  if (p.startsWith("linux")) return "linux";
  if (p === "web" || p === "pwa" || p === "navegador") return "web";
  return p || "otro";
}

export function esMacAppleSilicon(caps: NeuronaInsomne["capabilities"]): boolean {
  if (plataformaInsomne(caps.platform) !== "macos") return false;
  return /apple\s*(m\d|gpu|silicon)|arm64|aarch64/i.test(`${caps.gpuRenderer ?? ""} ${caps.gpuVendor ?? ""}`);
}

export function leerNeuronaInsomne(neurona: NeuronaInsomne, ahora: Date | number = Date.now()): LecturaInsomne {
  const t = ahora instanceof Date ? ahora.getTime() : ahora;
  const esSilicio = esMacAppleSilicon(neurona.capabilities);
  const capacidad = capacidadInsomne(plataformaInsomne(neurona.capabilities.platform, neurona.kind), esSilicio ? "26 arm64" : undefined);
  const hastaMs = neurona.insomne ? Number(neurona.insomne.hasta) : NaN;
  const activa = Number.isFinite(hastaMs) && Number.isFinite(t) && hastaMs > t;
  const crudo = neurona.insomne?.proveedor ?? "";
  const proveedor = activa && crudo in NOMBRES ? (crudo as ProveedorInsomne) : capacidad.proveedor;
  const estado: EstadoInsomne = activa
    ? { activo: true, hasta: new Date(hastaMs).toISOString(), proveedor, motivo: "sesión de Insomnia activa" }
    : { activo: false, hasta: null, proveedor: capacidad.proveedor, motivo: capacidad.disponible ? "sin sesión activa" : capacidad.motivo };
  return {
    capacidad, estado, politica: politicaInsomne(neurona.politica),
    soltarTrabajo: activa && debeSoltarTrabajo(estado, t),
  };
}

export function InsomneFicha({ neurona, ahora }: { neurona: NeuronaInsomne; ahora?: number }) {
  const { capacidad, estado, politica, soltarTrabajo } = leerNeuronaInsomne(neurona, ahora);
  const activo = estado.activo;
  const hora = estado.hasta ? new Date(estado.hasta).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "—";
  const sigue = (Object.keys(ETIQUETAS) as (keyof PoliticaInsomne)[]).filter((k) => politica[k]);
  const titulo = capacidad.proveedor === "siempre" ? "Siempre encendida: un servidor no se duerme"
    : activo ? `Siempre disponible hasta las ${hora}`
    : capacidad.proveedor === "insomnia" ? "Compatible con Insomnia, sin sesión activa"
    : capacidad.disponible ? "Puede seguir con la pantalla cerrada" : "No puede seguir con la pantalla cerrada";
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/20 p-3">
      <svg aria-hidden className="pointer-events-none absolute -right-6 -top-8 h-28 w-28 text-cyan-300/10" viewBox="0 0 120 120" fill="none"><circle cx="45" cy="60" r="36" stroke="currentColor" strokeWidth="1.5" /><circle cx="75" cy="60" r="36" stroke="currentColor" strokeWidth="1.5" /></svg>
      <div className="relative flex items-start gap-2">
        <MoonStar className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-white/90">Siempre disponible (pantalla cerrada)</p>
          <p className="text-[11px] leading-snug text-white/55">{titulo}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] ${activo ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-200" : capacidad.disponible ? "border-cyan-400/25 bg-cyan-500/10 text-cyan-200" : "border-white/10 bg-white/5 text-white/45"}`}>
          {activo ? "Sesión activa" : capacidad.disponible ? "Compatible" : "No compatible"}
        </span>
      </div>
      <p className="relative mt-2 text-[11px] text-white/60">Proveedor: <span className="text-white/85">{NOMBRES[estado.proveedor]}</span> · {estado.motivo}</p>
      {(activo || capacidad.disponible) && (
        <div className="relative mt-2">
          <p className="text-[11px] text-white/50">{activo ? "Sigue sirviendo" : "Con una sesión seguirán"}:</p>
          <ul className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {sigue.length === 0 ? <li className="text-[11px] text-white/40">Nada: la política está apagada.</li>
              : sigue.map((k) => <li key={k} className="flex items-center gap-1 text-[11px] text-emerald-200/85"><Check className="h-3 w-3 shrink-0" aria-hidden />{ETIQUETAS[k]}</li>)}
          </ul>
        </div>
      )}
      {soltarTrabajo && (
        <p className="relative mt-2 flex items-start gap-1.5 rounded-lg border border-amber-400/25 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-200"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /><span>Va a soltar el trabajo: quedan menos de {MINUTOS_AVISO_FIN} min, la batería baja del {BATERIA_MINIMA} % sin cargar o el calor es crítico.</span></p>
      )}
      {capacidad.proveedor === "insomnia" && !activo && (
        <div className="relative mt-2 space-y-1.5 rounded-lg border border-cyan-400/20 bg-cyan-500/[0.05] p-2">
          <p className="text-[11px] font-semibold text-cyan-100">Instalar Insomnia en esta Mac</p>
          <p className="text-[11px] leading-snug text-white/60">Requiere macOS 26 o posterior en Apple Silicon. Si ya la tienes, abre Insomnia en la barra de menús y empieza una sesión; StarSeed OS solo lee su estado.</p>
          <p className="flex items-start gap-1.5 text-[11px] leading-snug text-amber-200/90"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />Superficie estable y ventilada, nunca dentro de una bolsa: con la tapa cerrada el calor no sale.</p>
          <p className="flex items-start gap-1.5 text-[11px] leading-snug text-amber-200/90"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />Su instalador deja /etc/sudoers.d/insomnia: cualquier programa de tu usuario podrá ejecutar pmset disablesleep y lowpowermode sin contraseña. Revísala.</p>
          <a href="/library?tab=destacado&pkg=lib-insomnia" className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-cyan-200 hover:text-cyan-100"><ExternalLink className="h-3.5 w-3.5" aria-hidden />Abrir la ficha lib-insomnia en la Biblioteca</a>
        </div>
      )}
    </div>
  );
}

export default InsomneFicha;
