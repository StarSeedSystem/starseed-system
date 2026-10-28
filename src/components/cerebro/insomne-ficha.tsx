"use client";

/** Ficha «Siempre disponible (pantalla cerrada)» (INS1027D · architecture/neurona-insomne.md).
 *  El OS LEE el estado de Insomnia; nunca ejecuta `pmset` ni usa su regla de sudoers: la
 *  sesión la empieza la persona en su barra de menús. Enseña proveedor por plataforma, hasta
 *  cuándo (anuncio `insomne` de la presencia), qué sigue funcionando y, en una Mac compatible,
 *  cómo instalar Insomnia (ficha «lib-insomnia» de la Biblioteca) con sus avisos de seguridad. */
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChevronDown, ExternalLink, MoonStar } from "lucide-react";
import type { Neuron } from "@/lib/neurons/neurons";
import { presentesPorNeurona, usePresenciaNeuronas } from "@/lib/neurons/presencia";
import type { SenalesMedio } from "@/lib/neurons/senales-medio";
import { capacidadInsomne, politicaInsomne, type CapacidadInsomne, type PoliticaInsomne } from "@/lib/neurons/insomne";

/** Qué sigue funcionando mientras la sesión insomne dura (contrato §2: todo por defecto). */
export const ETIQUETAS_SIGUE: Record<keyof PoliticaInsomne, string> = {
  agentes: "Agentes del enjambre",
  malla: "Su parte de la red mesh P2P compartida (relé, faros, réplicas)",
  biblioteca: "Archivos que comparte con la red",
  programados: "Procesos programados en segundo plano",
  servidorCerebro: "Servidor de su cerebro y de la Biblioteca",
};

export interface EntradaInsomneFicha { plataforma: string; gpu?: string; insomne?: SenalesMedio["insomne"]; } // plataforma: «macOS»…
export interface DatosInsomneFicha {
  capacidad: CapacidadInsomne; compatible: boolean; activo: boolean; hastaTexto: string | null; sigue: string[];
}

/** Puro (entrada → datos de la ficha, sin reloj ni presencia) para poder probarlo entero. */
export function datosInsomneFicha(e: EntradaInsomneFicha, ahora: number): DatosInsomneFicha {
  // Sin versión de SO probada por UA: solo sabemos la GPU, y un renderer Apple ⇒ Apple Silicon (arm64);
  // el requisito de macOS 26 se lo deja el texto de la ficha.
  const arm = /apple/i.test(String(e.gpu ?? "")) ? "arm64" : "";
  const capacidad = capacidadInsomne(e.plataforma, [arm, e.gpu].filter(Boolean).join(" · "));
  const compatible = capacidad.disponible && !capacidad.soloVisible && capacidad.proveedor !== "siempre";
  const activo = !!e.insomne && Number.isFinite(e.insomne.hasta) && e.insomne.hasta > ahora;
  const hastaTexto = activo ? new Date(e.insomne!.hasta).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : null;
  const politica = politicaInsomne();
  const sigue = (Object.keys(ETIQUETAS_SIGUE) as (keyof PoliticaInsomne)[]).filter((k) => politica[k]).map((k) => ETIQUETAS_SIGUE[k]);
  return { capacidad, compatible, activo, hastaTexto, sigue };
}

const PROVEEDOR_NOMBRE: Record<string, string> = {
  insomnia: "Insomnia (barra de menús de macOS)",
  caffeinate: "caffeinate -s (servicio «despierto» de Genesis)",
  "systemd-inhibit": "systemd-inhibit (Linux)",
  powercfg: "powercfg (Windows)",
  "wake-lock": "Screen Wake Lock (navegador)",
  no: "ninguno disponible",
};

export function InsomneFicha({ neurona }: { neurona: Neuron }) {
  // Estado insomne de CUALQUIER medio de esta neurona, el anuncio con mayor hora de fin.
  const presencia = usePresenciaNeuronas();
  const insomne = useMemo<SenalesMedio["insomne"]>(() => {
    let mejor: SenalesMedio["insomne"];
    for (const m of presentesPorNeurona(presencia.medios).get(neurona.id) ?? []) {
      if (m.s?.insomne && (!mejor || m.s.insomne.hasta > mejor.hasta)) mejor = m.s.insomne;
    }
    return mejor;
  }, [presencia.medios, neurona.id]);
  const datos = datosInsomneFicha({ plataforma: neurona.capabilities?.platform ?? "", gpu: neurona.capabilities?.gpuRenderer, insomne }, Date.now());
  const [abierto, setOpen] = useState(datos.activo);
  const tono = datos.activo ? "border-emerald-400/30 text-emerald-200 bg-emerald-500/10"
    : datos.compatible ? "border-white/15 text-white/55 bg-black/20" : "border-zinc-500/30 text-zinc-400 bg-zinc-500/10";
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-2 px-3 py-2.5 text-left cursor-pointer hover:bg-white/[0.03] transition-colors">
        <MoonStar className={cn("w-4 h-4", datos.activo ? "text-emerald-300" : "text-sky-300")} />
        <span className="text-xs font-semibold text-white/85">Siempre disponible (pantalla cerrada)</span>
        <Badge variant="outline" className={cn("text-[9px]", tono)}>
          {datos.activo ? `activa hasta las ${datos.hastaTexto}` : datos.compatible ? "sin sesión ahora" : "no compatible"}
        </Badge>
        <ChevronDown className={cn("w-4 h-4 ml-auto text-white/40 transition-transform", abierto && "rotate-180")} />
      </button>
      {abierto && <ContenidoInsomne datos={datos} />}
    </div>
  );
}

function ContenidoInsomne({ datos }: { datos: DatosInsomneFicha }) {
  if (datos.capacidad.proveedor === "siempre") {
    return (
      <div className="px-3 pb-3 pt-3 border-t border-white/5">
        <p className="text-[11px] text-white/50 leading-relaxed">
          Es un servidor: ya está siempre encendido. No necesita ayuda para no dormirse; la red le da trabajo sin más.
        </p>
      </div>
    );
  }
  return (
    <div className="px-3 pb-3 pt-3 space-y-3 border-t border-white/5">
      <p className="text-[11px] text-white/55 leading-relaxed">
        Proveedor: <strong className="text-white/80">{PROVEEDOR_NOMBRE[datos.capacidad.proveedor] ?? datos.capacidad.proveedor}</strong>
        {" — "}{datos.capacidad.motivo}.
        {datos.activo && (
          <> Sesión activa hasta las <strong className="text-emerald-300">{datos.hastaTexto}</strong>: al terminar la neurona vuelve a dormir y suelta su trabajo con relevo de la colmena.</>
        )}
      </p>
      {!datos.compatible && (
        <p className="text-[11px] text-white/55 leading-relaxed">
          {datos.capacidad.proveedor === "wake-lock"
            ? "Con la pestaña a la vista el Wake Lock ya evita que duerma tu navegador; con la pantalla cerrada, un navegador no puede seguir sirviendo."
            : "Ni el OS ni el enjambre pueden mantener despierto este aparato con la pantalla apagada: no le daremos trabajo en esos momentos."}
        </p>
      )}
      {datos.compatible && (
        <div className="space-y-1">
          <p className="text-[11px] text-white/50 font-semibold">Mientras la sesión dure, sigue funcionando:</p>
          <ul className="space-y-0.5">
            {datos.sigue.map((s) => <li key={s} className="text-[11px] text-white/60 leading-snug">· {s}</li>)}
          </ul>
        </div>
      )}
      {datos.capacidad.proveedor === "insomnia" && (
        <>
          <a href="/library" className="inline-flex items-center gap-1.5 text-[11px] text-sky-300 hover:underline cursor-pointer">
            <ExternalLink className="w-3.5 h-3.5" />
            Cómo instalarla: ficha «Insomnia» de la Biblioteca (lib-insomnia)
          </a>
          <p className="text-[11px] text-white/50 leading-relaxed">
            Requiere macOS 26 o posterior en Apple Silicon y la sesión la empieza la persona en la barra de menús. Aviso de ventilación (Apple): con la tapa cerrada disipa peor calor — superficie estable y ventilada, nunca dentro de una bolsa.
          </p>
          <p className="text-[11px] text-white/50 leading-relaxed">
            Su instalador pide la contraseña y deja una regla de sudoers en <code className="text-[10px] select-all">/etc/sudoers.d/insomnia</code> que permite a cualquier programa de tu usuario ejecutar <code className="text-[10px] select-all">pmset disablesleep</code> sin contraseña: revísala. El OS solo lee el estado de Insomnia; jamás la controla.
          </p>
        </>
      )}
    </div>
  );
}
