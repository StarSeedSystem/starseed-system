"use client";

/**
 * VersionNeurona — versión, medio y aparato de una neurona, como los anuncia por la presencia de la
 * cuenta (VER1107B · 2026-11-07). Contrato: architecture/sincronizacion-neuronas.md §9.
 *
 * · Una neurona con una web anterior no anuncia nada de esto: «versión desconocida», sin inventar.
 * · «Nueva versión disponible» si su versión nativa es más vieja que la última publicada.
 * · Esta neurona: «Buscar actualizaciones» (el mismo camino que la ventana «Hay una versión nueva»).
 * · Otra neurona tuya: «Pedir actualización» (mensaje firmado; allí se abre SU ventana y nunca se instala
 *   sola). Si su versión no entiende el pedido, se dice cómo actualizarla a mano, con la Librería.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellRing, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePresenciaNeuronas } from "@/lib/neurons/presencia";
import { formatearInfoNeurona, mejorMedio, sanearInfoPublica } from "@/lib/neurons/info-publica";
import { EVENTO_BUSCAR_ACTUALIZACION, pedirActualizacion } from "@/lib/neurons/pedir-actualizacion";
import { EVENTO_COMPROBACION, type UltimaComprobacion } from "@/lib/actualizaciones/ultima-comprobacion";
import { useUltimaPublicada } from "@/lib/actualizaciones/ultima-publicada";

export interface VersionNeuronaProps {
  neuronaId: string;
  nombre?: string;
  esEsta?: boolean;
  /** Nombre de esta neurona, para decir quién lo pide. */
  miNombre?: string;
  className?: string;
}

export function VersionNeurona({ neuronaId, nombre, esEsta = false, miNombre, className }: VersionNeuronaProps) {
  const presencia = usePresenciaNeuronas();
  const ultima = useUltimaPublicada();
  const [ocupado, setOcupado] = useState(false);
  const [texto, setTexto] = useState("");

  const medios = presencia.medios.filter((m) => m.n === neuronaId);
  const mejor = mejorMedio(medios);
  const vista = formatearInfoNeurona(
    { version: mejor?.v?.nativa ?? null, info: sanearInfoPublica(mejor?.d), plataforma: mejor?.plataforma ?? null },
    ultima?.version ?? null,
  );
  const presente = !!mejor;
  const esNativa = !!mejor?.v?.nativa || mejor?.d?.medio === "escritorio" || mejor?.d?.medio === "android";

  // Esta neurona: el resultado de «Buscar actualizaciones» lo dice la última comprobación.
  useEffect(() => {
    if (!esEsta || !ocupado) return;
    const alComprobar = (e: Event) => {
      const c = (e as CustomEvent<UltimaComprobacion>).detail;
      if (c?.texto) setTexto(c.texto);
      setOcupado(false);
    };
    window.addEventListener(EVENTO_COMPROBACION, alComprobar);
    const tope = setTimeout(() => setOcupado(false), 20_000);
    return () => {
      window.removeEventListener(EVENTO_COMPROBACION, alComprobar);
      clearTimeout(tope);
    };
  }, [esEsta, ocupado]);

  const buscarAqui = () => {
    setOcupado(true);
    setTexto("Buscando en el canal de esta app…");
    window.dispatchEvent(new CustomEvent(EVENTO_BUSCAR_ACTUALIZACION, { detail: {} }));
  };

  const pedir = async () => {
    setOcupado(true);
    const r = await pedirActualizacion({ neurona: neuronaId, nombre, syncDeviceId: mejor?.sid, version: ultima?.version, miNombre });
    setTexto(r.texto);
    setOcupado(false);
  };

  const partes = [vista.etiquetaVersion, vista.medio, vista.aparato].filter((x): x is string => !!x);

  return (
    <div className={cn("space-y-1.5 text-[11px] leading-snug", className)} data-testid={`version-neurona-${neuronaId}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn("min-w-0", vista.estado === "desconocida" ? "text-white/45" : "text-white/70")}>
          {partes.join(" · ")}
          {!presente && !esEsta ? " · no está abierta ahora" : ""}
        </span>
        {vista.estado === "nueva" && (
          <span className="rounded-full border border-amber-400/30 bg-amber-500/15 px-1.5 py-px text-[10px] font-semibold text-amber-200">
            Nueva versión disponible{ultima?.version ? `: ${ultima.version.replace(/^v/i, "")}` : ""}
          </span>
        )}
      </div>

      {esEsta && esNativa && (
        <button
          type="button"
          onClick={buscarAqui}
          disabled={ocupado}
          aria-label="Buscar actualizaciones en esta neurona"
          className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/10 px-2 py-0.5 text-[10px] font-medium text-white/70 transition-colors hover:border-white/25 hover:text-white disabled:cursor-wait"
        >
          {ocupado ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Search className="h-3 w-3" aria-hidden />} Buscar actualizaciones
        </button>
      )}

      {!esEsta && vista.estado === "nueva" && presente && vista.entiendePedido && (
        <button
          type="button"
          onClick={() => void pedir()}
          disabled={ocupado}
          aria-label={`Pedir actualización a ${nombre ?? "esta neurona"}`}
          className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-amber-300/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-100 transition-colors hover:bg-amber-400/20 disabled:cursor-wait"
        >
          {ocupado ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <BellRing className="h-3 w-3" aria-hidden />} Pedir actualización
        </button>
      )}

      {!esEsta && presente && esNativa && !vista.entiendePedido && (vista.estado === "nueva" || vista.estado === "desconocida") && (
        <p className="text-[10px] text-white/50">
          Su versión es anterior y no entiende «Pedir actualización». Ábrela en ese aparato y actualízala desde la{" "}
          <Link href="/library" className="underline underline-offset-2 hover:text-white/80">
            Librería
          </Link>{" "}
          (o instala la nueva encima: tus datos se quedan).
        </p>
      )}

      {texto && (
        <p role="status" aria-live="polite" className="text-[10px] text-white/65">
          {texto}
        </p>
      )}
    </div>
  );
}

export default VersionNeurona;
