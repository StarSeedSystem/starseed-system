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
 * · (NEU1108A) «En línea» sale de la MISMA verdad que el radar (`usePresenciaViva`): enlace directo sin
 *   internet, malla P2P, faro de la red local y presencia de la cuenta, con la vía («vía red local»). Si
 *   la presencia no trae versión ni aparato (sin internet, web anterior), los de su fila
 *   (`capabilities.aparato`), dichos como «según su registro».
 * · (LLA1112B) La fila que llega en `capacidades` puede venir de la caché del registro (5–30 min,
 *   `listNeurons`): si la neurona se actualizó, su versión quedaba vieja aunque su fila ya dijera la
 *   nueva. Ahora este panel RELEE su fila (una fila, no la lista) al montar, cuando vuelve a estar en
 *   línea y cuando la pestaña vuelve a la vista, y usa lo fresco solo si su aparato cambió.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BellRing, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePresenciaViva } from "@/lib/neurons/use-presencia-viva";
import { textoEstadoVivo } from "@/lib/neurons/presencia-viva";
import { formatearInfoNeurona } from "@/lib/neurons/info-publica";
import { EVENTO_BUSCAR_ACTUALIZACION, pedirActualizacion } from "@/lib/neurons/pedir-actualizacion";
import { EVENTO_COMPROBACION, type UltimaComprobacion } from "@/lib/actualizaciones/ultima-comprobacion";
import { useUltimaPublicada } from "@/lib/actualizaciones/ultima-publicada";
import { neuronaVigente } from "@/lib/neurons/fusion-alias";
import { createClient } from "@/utils/supabase/client";

export interface VersionNeuronaProps {
  neuronaId: string;
  nombre?: string;
  esEsta?: boolean;
  /** Nombre de esta neurona, para decir quién lo pide. */
  miNombre?: string;
  /** (NEU1108A) Capacidades guardadas de su fila: versión y aparato cuando la presencia no los trae. */
  capacidades?: Record<string, unknown> | null;
  className?: string;
}

/** Primera lectura del panel, tardada un poco: si el componente se desmonta enseguida (pruebas, navegación), no llega a leer nada. */
const ESPERA_PRIMERA_LECTURA_MS = 1_500;

/** Lee `capabilities` de SU fila en el registro (una fila, no la lista). Nunca lanza. */
async function leerCapsDeFila(neuronaId: string): Promise<Record<string, unknown> | null> {
  try {
    let id = neuronaId;
    try {
      id = neuronaVigente(neuronaId) || neuronaId; // absorbida por una fusión → la fila es la que se quedó
    } catch {
      /* sin alias: se lee por el id de siempre */
    }
    const supabase = createClient();
    const { data } = await supabase.from("neuron_devices").select("capabilities").eq("id", id).maybeSingle();
    const caps = (data as { capabilities?: unknown } | null)?.capabilities;
    return caps && typeof caps === "object" && !Array.isArray(caps) ? (caps as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function VersionNeurona({ neuronaId, nombre, esEsta = false, miNombre, capacidades, className }: VersionNeuronaProps) {
  const [capsFrescas, setCapsFrescas] = useState<Record<string, unknown> | null>(null);
  // (LLA1112B) La fila recién leída manda sobre la que llegó en la prop (puede venir de la caché del registro).
  const caps = capsFrescas ?? capacidades ?? null;
  const viva = usePresenciaViva(neuronaId, caps);
  const ultima = useUltimaPublicada();
  const [ocupado, setOcupado] = useState(false);
  const [texto, setTexto] = useState("");

  const mejor = viva.medio;
  const vista = formatearInfoNeurona({ version: viva.version, info: viva.info, plataforma: viva.plataforma }, ultima?.version ?? null);
  // «Pedir actualización» va por el canal de la cuenta: hace falta su medio en la presencia.
  const presente = !!mejor;
  const esNativa = !!viva.version || viva.info?.medio === "escritorio" || viva.info?.medio === "android";

  // (LLA1112B) Releer SU fila cuando puede haber cambiado: al montar, al volver a estar en línea
  // (la neurona actualizada rearranca y reescribe su fila) y cuando la pestaña vuelve a la vista.
  const leerAhora = useRef<(() => void) | null>(null);
  const enLineaAntes = useRef<boolean | null>(null);
  useEffect(() => {
    setCapsFrescas(null); // otra neurona: lo que se leyó antes no vale
  }, [neuronaId]);
  useEffect(() => {
    if (esEsta || viva.fuenteInfo !== "registro") return; // la presencia ya dice su versión: no hay que releer nada
    let vivo = true;
    let enVuelo = false;
    let firmaAparato: string | null = null;
    const leer = async (): Promise<void> => {
      if (!vivo || enVuelo) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      enVuelo = true;
      try {
        const leidas = await leerCapsDeFila(neuronaId);
        if (!vivo || !leidas) return;
        const firma = JSON.stringify(leidas.aparato ?? null); // solo el aparato importa aquí: nada de parpadeos
        if (firma !== firmaAparato) {
          firmaAparato = firma;
          setCapsFrescas(leidas);
        }
      } catch {
        /* sin lectura: se queda lo que había */
      } finally {
        enVuelo = false;
      }
    };
    leerAhora.current = () => void leer();
    const tope = setTimeout(() => void leer(), ESPERA_PRIMERA_LECTURA_MS);
    const alVer = () => {
      if (document.visibilityState === "visible") void leer();
    };
    document.addEventListener("visibilitychange", alVer);
    return () => {
      vivo = false;
      leerAhora.current = null;
      clearTimeout(tope);
      document.removeEventListener("visibilitychange", alVer);
    };
  }, [esEsta, neuronaId, viva.fuenteInfo]);
  useEffect(() => {
    const antes = enLineaAntes.current;
    enLineaAntes.current = viva.enLinea;
    if (viva.enLinea && antes === false) leerAhora.current?.();
  }, [viva.enLinea]);

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

  const etiqueta = viva.fuenteInfo === "registro" && vista.version ? `${vista.etiquetaVersion} (según su registro)` : vista.etiquetaVersion;
  const partes = [etiqueta, vista.medio, vista.aparato].filter((x): x is string => !!x);

  return (
    <div className={cn("space-y-1.5 text-[11px] leading-snug", className)} data-testid={`version-neurona-${neuronaId}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        {!esEsta && viva.enLinea && (
          <span
            data-testid="estado-vivo"
            className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-1.5 py-px text-[10px] font-medium text-emerald-100"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" aria-hidden />
            {textoEstadoVivo(viva)}
          </span>
        )}
        <span className={cn("min-w-0", vista.estado === "desconocida" ? "text-white/45" : "text-white/70")}>
          {partes.join(" · ")}
          {!viva.enLinea && !esEsta ? ` · ${textoEstadoVivo(viva)}` : ""}
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
