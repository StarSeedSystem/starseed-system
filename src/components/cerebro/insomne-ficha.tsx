"use client";

/**
 * InsomneFicha — «Siempre disponible (pantalla cerrada)» de una neurona (INS1027D).
 * Contrato: architecture/neurona-insomne.md. El OS LEE el estado de Insomnia
 * (ruta local /api/neuronas/insomne; anuncio de la presencia en las demás) y JAMÁS
 * lo controla: la sesión la empieza la persona; nunca `pmset` ni su sudoers.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { MoonStar, ShieldAlert, ThermometerSun } from "lucide-react";
import { cn } from "@/lib/utils";
import { capacidadInsomne, politicaInsomne, type CapacidadInsomne, type EstadoInsomne, type PoliticaInsomne, type ProveedorInsomne } from "@/lib/neurons/insomne";
import { usePresenciaNeuronas } from "@/lib/neurons/presencia";
import type { Neuron } from "@/lib/neurons/neurons";

const ETIQUETA_PROVEEDOR: Record<ProveedorInsomne, string> = {
  insomnia: "Insomnia", caffeinate: "caffeinate -s", "systemd-inhibit": "systemd-inhibit", powercfg: "powercfg",
  siempre: "siempre encendido", "wake-lock": "Screen Wake Lock", no: "sin proveedor",
};
const QUE_SIGUE: readonly (readonly [keyof PoliticaInsomne, string])[] = [
  ["agentes", "Agentes"], ["programados", "Procesos programados"], ["malla", "Red mesh P2P"],
  ["servidorCerebro", "Servidor del cerebro"], ["biblioteca", "Biblioteca y archivos"],
];

/** El anuncio insomne más vigente entre los medios presentes de UNA neurona. Puro. */
export function anuncioInsomneDe(medios: readonly { n: string; s?: { insomne?: { hasta: number; proveedor: string } } }[], idNeurona: string, ahora: number): EstadoInsomne | null {
  let mejor: { hasta: number; proveedor: string } | null = null;
  for (const medio of medios) {
    const a = medio.n === idNeurona ? medio.s?.insomne : undefined;
    if (!a || !Number.isFinite(a.hasta) || a.hasta <= ahora || !(a.proveedor in ETIQUETA_PROVEEDOR)) continue;
    if (!mejor || a.hasta > mejor.hasta) mejor = { hasta: a.hasta, proveedor: a.proveedor };
  }
  return mejor ? { activo: true, hasta: new Date(mejor.hasta).toISOString(), proveedor: mejor.proveedor as ProveedorInsomne, motivo: "anunciado en la presencia de la cuenta" } : null;
}

/** Qué enseña la ficha, decidido UNA vez (puro): sesión activa, instalar, sin confirmar o capacidad. */
export function vistaInsomne(x: { esEsta: boolean; plataforma: string; versionSO?: string; estado: EstadoInsomne | null; capacidad: CapacidadInsomne }):
  { caso: "activa"; estado: EstadoInsomne } | { caso: "instalar"; motivo: string }
  | { caso: "sin-saber"; motivo: string } | { caso: "capacidad"; capacidad: CapacidadInsomne } {
  if (x.estado?.activo) return { caso: "activa", estado: x.estado };
  const esMac = /^(macos|mac|darwin)/.test(x.plataforma.trim().toLowerCase());
  if (esMac && !x.versionSO) {
    const motivo = x.esEsta ? "no se pudo confirmar la versión de macOS en este navegador"
      : "su versión de macOS no se puede confirmar desde aquí; una sesión insomne activa llega anunciada por la presencia";
    return { caso: "sin-saber", motivo };
  }  if (x.esEsta && x.capacidad.proveedor === "insomnia" && x.capacidad.disponible) return { caso: "instalar", motivo: x.capacidad.motivo };
  return { caso: "capacidad", capacidad: x.capacidad };
}

export function InsomneFicha({ neurona }: { neurona: Neuron }) {
  const esEsta = !!neurona.isThisDevice;
  const caps = neurona.capabilities;
  const [versionSO, setVersionSO] = useState<string | undefined>(undefined);
  const [local, setLocal] = useState<EstadoInsomne | null>(null);
  const presencia = usePresenciaNeuronas();
  // En esta neurona: versión real de macOS (Chrome, alta entropía) y estado REAL del
  // servidor local (session.json de Insomnia). Solo lectura, nunca control.
  useEffect(() => {
    if (!esEsta) return;
    const uad = (navigator as { userAgentData?: { getHighEntropyValues?: (v: string[]) => Promise<{ platformVersion?: string }> } }).userAgentData;
    uad?.getHighEntropyValues?.(["platformVersion"]).then((r) => { if (r?.platformVersion) setVersionSO(r.platformVersion); }).catch(() => undefined);
    let vivo = true;
    const leer = async () => {
      try {
        const ctrl = new AbortController();
        const tope = setTimeout(() => ctrl.abort(), 2000);
        const res = await fetch("/api/neuronas/insomne", { signal: ctrl.signal, cache: "no-store" });
        clearTimeout(tope);
        if (vivo && res.ok) setLocal((await res.json()) as EstadoInsomne);
      } catch { /* sin despliegue local: se sigue con lo que se sabe */ }
    };
    void leer();
    const cada = setInterval(() => { if (document.visibilityState !== "hidden") void leer(); }, 60_000);
    return () => { vivo = false; clearInterval(cada); };
  }, [esEsta]);

  const ahora = Date.now();
  const estado = esEsta ? local : anuncioInsomneDe(presencia.medios, neurona.id, ahora);
  // GPU «Apple M1» confirma Apple Silicon; la versión sola no basta («arm64» daría 64).
  const version = versionSO && /apple\s*m\d/i.test(caps?.gpuRenderer ?? "") ? `${versionSO} arm64` : versionSO;
  const capacidad = capacidadInsomne((caps?.platform ?? "").trim().toLowerCase() || "desconocido", version);
  const vista = vistaInsomne({ esEsta, plataforma: caps?.platform ?? "", versionSO: version, estado, capacidad });
  const politica = politicaInsomne();
  const chips = QUE_SIGUE.filter(([clave]) => politica[clave]).map(([, etiqueta]) => etiqueta);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <MoonStar className="w-4 h-4 text-indigo-300 shrink-0" />
        <span className="text-xs font-semibold text-white/85">Siempre disponible (pantalla cerrada)</span>
        {vista.caso === "activa" ? (
          <Badge variant="outline" className="text-[9px] border-emerald-400/30 text-emerald-300 bg-emerald-500/10">            activa hasta {vista.estado.hasta ? new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(Date.parse(vista.estado.hasta)) : "…"} · {ETIQUETA_PROVEEDOR[vista.estado.proveedor]}</Badge>
        ) : vista.caso === "instalar" ? (
          <Badge variant="outline" className="text-[9px] border-indigo-400/30 text-indigo-200 bg-indigo-500/10">compatible · sin sesión</Badge>
        ) : vista.caso === "sin-saber" ? (
          <Badge variant="outline" className="text-[9px] border-white/15 text-white/55 bg-black/20">sin confirmar</Badge>
        ) : (
          <Badge variant="outline" className={cn("text-[9px]", vista.capacidad.disponible ? "border-cyan-400/30 text-cyan-200 bg-cyan-500/10" : "border-zinc-500/30 text-zinc-400 bg-zinc-500/10")}>{ETIQUETA_PROVEEDOR[vista.capacidad.proveedor]}</Badge>
        )}
      </div>
      {vista.caso === "activa" && <p className="text-[11px] text-emerald-100/80">Con la pantalla cerrada siguen funcionando: {chips.join(", ")}.</p>}
      {vista.caso === "sin-saber" && <p className="text-[11px] text-white/45 leading-relaxed">{vista.motivo}</p>}
      {vista.caso === "capacidad" && <p className="text-[11px] text-white/45 leading-relaxed">{vista.capacidad.motivo}</p>}
      {vista.caso === "instalar" && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-white/55 leading-relaxed">
            Esta Mac aguanta sesiones con la tapa cerrada:{" "}
            <Link href="/library?tab=destacado" className="text-indigo-300 hover:underline cursor-pointer">instala Insomnia desde la Biblioteca</Link>{" "}
            y empieza la sesión desde su icono en la barra de menús — la empieza la persona, no el OS. Mientras dura
            siguen funcionando los agentes, los procesos programados, la red mesh P2P, el servidor del cerebro y la Biblioteca.
          </p>
          <p className="text-[11px] text-amber-300/80 flex items-start gap-1.5">
            <ThermometerSun className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            Aviso de Apple: úsala sobre una superficie estable y ventilada, nunca dentro de una bolsa; la recuperación
            puede fallar y un temporizador no es una garantía de seguridad.
          </p>
          <p className="text-[11px] text-amber-300/80 flex items-start gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            Su instalador deja una regla de sudoers (/etc/sudoers.d/insomnia) que cualquier programa de tu usuario
            podría usar: revísala antes. El OS jamás la usa ni ejecuta «pmset».
          </p>
        </div>
      )}
    </div>
  );
}
