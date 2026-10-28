"use client";

/** InsomneFicha — «Siempre disponible (pantalla cerrada)» de una neurona (INS1027):
 * proveedor, sesión, qué sigue sirviendo y cómo instalar Insomnia en una Mac
 * compatible. Solo LEE su estado: nunca ejecuta `pmset` ni usa su regla de sudoers. */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  BATERIA_MINIMA, MINUTOS_AVISO_FIN, capacidadInsomne, debeSoltarTrabajo, politicaInsomne,
  type CapacidadInsomne, type EstadoInsomne, type ProveedorInsomne,
} from "@/lib/neurons/insomne";
import type { Neuron, NeuronCapabilities } from "@/lib/neurons/neurons";
import { Library, MoonStar, PlugZap, ShieldAlert, Wind } from "lucide-react";

const PROVEEDORES: readonly ProveedorInsomne[] = ["insomnia", "caffeinate", "systemd-inhibit", "powercfg", "siempre", "wake-lock", "no"];
const NOMBRES: Record<ProveedorInsomne, string> = { insomnia: "Insomnia", caffeinate: "caffeinate", "systemd-inhibit": "systemd-inhibit", powercfg: "powercfg", siempre: "siempre encendido", "wake-lock": "Screen Wake Lock", no: "ninguno" };

export function horaCorta(iso: string | null): string {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? new Date(t).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "—";
}

export function pareceMacAppleSilicon(caps: Pick<NeuronCapabilities, "platform" | "gpuRenderer" | "gpuVendor">): boolean {
  const p = String(caps.platform ?? "").toLowerCase();
  return (p.includes("mac") || p.includes("darwin")) && /apple|arm64|aarch64|\bm[1-4]\b/.test(`${caps.gpuRenderer ?? ""} ${caps.gpuVendor ?? ""}`.toLowerCase());
}

export function capacidadDeNeurona(caps: NeuronCapabilities): CapacidadInsomne {
  // La versión exacta del SO no viaja en las capacidades; la ficha pide macOS 26+ aparte.
  return capacidadInsomne(caps.platform, pareceMacAppleSilicon(caps) ? "26 arm64" : "");
}

export function estadoDesdeJson(json: unknown): EstadoInsomne | null {
  if (!json || typeof json !== "object") return null;
  const d = json as Record<string, unknown>;
  if (typeof d.activo !== "boolean") return null;
  const calor = d.calor === "serio" || d.calor === "critico" || d.calor === "normal" ? d.calor : undefined;
  const proveedor = typeof d.proveedor === "string" && (PROVEEDORES as readonly string[]).includes(d.proveedor) ? (d.proveedor as ProveedorInsomne) : "no";
  return { activo: d.activo, hasta: typeof d.hasta === "string" ? d.hasta : null, proveedor, motivo: typeof d.motivo === "string" ? d.motivo : "",
    ...(typeof d.bateria === "number" ? { bateria: d.bateria } : {}), ...(typeof d.cargando === "boolean" ? { cargando: d.cargando } : {}),
    ...(calor ? { calor } : {}), ...(typeof d.tapaCerrada === "boolean" ? { tapaCerrada: d.tapaCerrada } : {}) };
}

export function textoEstadoInsomne(estado: EstadoInsomne | null, capacidad: CapacidadInsomne, ahora = Date.now()) {
  if (estado?.activo && (!estado.hasta || Date.parse(estado.hasta) > ahora)) return { titulo: `Siempre disponible hasta las ${horaCorta(estado.hasta)}`, detalle: "La pantalla puede cerrarse: esta neurona sigue sirviendo.", activo: true };
  if (capacidad.disponible) return { titulo: "Compatible · sin sesión activa", detalle: `Con ${NOMBRES[capacidad.proveedor]} puede seguir con la pantalla cerrada.`, activo: false };
  return { titulo: "No puede seguir con la pantalla cerrada", detalle: capacidad.motivo, activo: false };
}

function useEstadoInsomne(neurona: Neuron): EstadoInsomne | null {
  const [estado, setEstado] = useState<EstadoInsomne | null>(null);
  useEffect(() => {
    if (!neurona.isThisDevice) return;
    let vivo = true;
    fetch("/api/neuronas/insomne", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null)).then((j) => { if (vivo) setEstado(estadoDesdeJson(j)); })
      .catch(() => { if (vivo) setEstado(null); });
    return () => { vivo = false; };
  }, [neurona.isThisDevice]);
  return estado;
}

export function InsomneFicha({ neurona }: { neurona: Neuron }) {
  const capacidad = capacidadDeNeurona(neurona.capabilities);
  const estado = useEstadoInsomne(neurona);
  const ahora = Date.now();
  const texto = textoEstadoInsomne(estado, capacidad, ahora);
  const politica = politicaInsomne();
  const sigue = [politica.agentes && "agentes", politica.programados && "procesos programados", politica.malla && "malla P2P", politica.servidorCerebro && "servidor del cerebro", politica.biblioteca && "Biblioteca"].filter(Boolean);
  const soltar = !!estado?.activo && debeSoltarTrabajo(estado, ahora);
  const instalar = capacidad.proveedor === "insomnia" && !texto.activo;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <MoonStar className="w-4 h-4 text-indigo-300" aria-hidden />
        <span className="text-xs font-semibold text-white/85">Siempre disponible (pantalla cerrada)</span>
        <Badge variant="outline" className={cn("text-[9px]", texto.activo ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : capacidad.disponible ? "border-indigo-400/30 bg-indigo-500/10 text-indigo-200" : "border-zinc-500/30 bg-zinc-500/10 text-zinc-300")}>
          {texto.activo ? "Activa" : capacidad.disponible ? "Compatible" : "No compatible"}
        </Badge>
      </div>
      <div className="space-y-2 border-t border-white/5 px-3 pb-3 pt-2.5">
        <p className="text-[11px] font-semibold text-white/85">{texto.titulo}</p>
        <p className="text-[11px] leading-relaxed text-white/55">
          Proveedor: <span className="text-white/75">{NOMBRES[capacidad.proveedor]}</span> · {texto.detalle}
        </p>
        <p className="text-[11px] leading-relaxed text-white/50">
          {texto.activo ? "Sigue sirviendo" : "Al activarla seguirá sirviendo"}: {sigue.length ? sigue.join(", ") : "nada (política apagada)"}.
        </p>
        {soltar && (
          <p className="text-[10px] leading-relaxed text-amber-300/90">
            Va a soltar el trabajo: quedan menos de {MINUTOS_AVISO_FIN} min, la batería baja del {BATERIA_MINIMA} % sin cargar o el calor es crítico.
          </p>
        )}
        {instalar && (
          <div className="space-y-1.5 rounded-lg border border-indigo-400/25 bg-indigo-500/[0.06] p-2.5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-100">
              <PlugZap className="w-3.5 h-3.5" aria-hidden /> Cómo activarla en esta Mac
            </p>
            <p className="text-[11px] leading-relaxed text-white/60">
              Abre Insomnia en la barra de menús y empieza una sesión con hora de fin. Si aún no la tienes,{" "}
              <Link href="/library?tab=destacado" className="cursor-pointer text-indigo-200 underline underline-offset-2 hover:text-indigo-100">
                <Library className="mr-1 inline w-3 h-3" aria-hidden /> abre su ficha «Insomnia» en la Biblioteca
              </Link>
              . El OS solo lee su estado: no la instala, no ejecuta <code>pmset</code> ni usa su regla de sudoers.
            </p>
            <p className="flex items-start gap-1.5 text-[10px] leading-snug text-amber-200/85">
              <Wind className="mt-0.5 w-3 h-3 shrink-0" aria-hidden /> Ventilación: superficie estable y ventilada, nunca dentro de una bolsa; es experimental y la recuperación puede fallar.
            </p>
            <p className="flex items-start gap-1.5 text-[10px] leading-snug text-amber-200/85">
              <ShieldAlert className="mt-0.5 w-3 h-3 shrink-0" aria-hidden /> Su instalador deja <code>/etc/sudoers.d/insomnia</code>: cualquier programa de tu usuario podría usar <code>pmset disablesleep</code>. Revísala antes.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
