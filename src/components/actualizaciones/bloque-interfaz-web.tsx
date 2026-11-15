"use client";

/**
 * AND1114L · Ajustes › Versión y actualizaciones › «Interfaz web»: la web que corre en esta app (build y commit), la
 * publicada, cuándo se miró por última vez y en qué punto está el relevo. En escritorio y en Android (la APK con servidor
 * local) lo dice la propia app (`servidor_local_estado`); en la web y la PWA, la página es la publicada y se actualiza sola.
 * Nada se inventa: lo que no se sabe dice «sin dato».
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { consultarEstadoServidor, pedirBuscarServidor } from "@/lib/nativa/estado-servidor-local";
import { hace, vistaInterfazWeb, type VistaInterfazWeb } from "@/lib/nativa/interfaz-web";
import { esAppNativa } from "@/lib/nativa/puente";
import { buildCorriendo, etiquetaBuild } from "@/lib/pwa/build-corriendo";

/** Cada cuánto se pregunta a la app mientras el panel está a la vista. */
const CADA_MS = 10_000;
/** Pedido a la app: «Buscar ahora» (lo manda el botón de arriba, junto al de la app). */
export const EVENTO_BUSCAR_WEB = "starseed:buscar-web-nativa";

export function BloqueInterfazWeb() {
  const [vista, setVista] = useState<VistaInterfazWeb | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [, setReloj] = useState(0);
  const nativa = typeof window !== "undefined" && esAppNativa();

  const leer = useCallback(async () => {
    try {
      const e = await consultarEstadoServidor();
      let enLlamada = false;
      try {
        enLlamada = (await (await import("@/lib/actualizaciones/momento-navegador")).medirMomento()).enLlamada;
      } catch {
        /* sin módulo: no se sabe; se deja como «no en llamada» (solo cambia el texto) */
      }
      setVista(vistaInterfazWeb(e, { enLlamada, escribiendo: false }));
    } catch {
      setVista(null);
    }
  }, []);

  useEffect(() => {
    if (!nativa) return;
    void leer();
    const iv = setInterval(() => void leer(), CADA_MS);
    const reloj = setInterval(() => setReloj((n) => n + 1), 30_000);
    const buscar = async () => {
      setBuscando(true);
      await pedirBuscarServidor();
      setTimeout(() => void leer(), 2500);
      setTimeout(() => setBuscando(false), 4000);
    };
    window.addEventListener(EVENTO_BUSCAR_WEB, buscar);
    return () => {
      clearInterval(iv);
      clearInterval(reloj);
      window.removeEventListener(EVENTO_BUSCAR_WEB, buscar);
    };
  }, [nativa, leer]);

  if (!nativa) {
    const b = buildCorriendo();
    return (
      <div className="space-y-1 border-t border-white/10 pt-3" aria-label="Interfaz web">
        <h3 className="text-sm font-medium">Interfaz web</h3>
        <p className="text-xs text-muted-foreground">
          Esta página es la web publicada ({etiquetaBuild(b)}): cuando sale una nueva, llega sola en el primer momento sin llamada ni texto sin enviar.
        </p>
      </div>
    );
  }
  if (!vista) {
    return (
      <div className="space-y-1 border-t border-white/10 pt-3" aria-label="Interfaz web">
        <h3 className="text-sm font-medium">Interfaz web</h3>
        <p className="text-xs text-muted-foreground">Leyendo lo que dice la app…</p>
      </div>
    );
  }
  const ahora = Date.now();
  const icono =
    vista.estado === "bajando" || buscando ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> :
    vista.estado === "error" ? <AlertTriangle className="h-3 w-3" aria-hidden /> :
    vista.estado === "sin-dato" || vista.estado === "sin-sirve-local" ? <WifiOff className="h-3 w-3" aria-hidden /> :
    <CheckCircle2 className="h-3 w-3" aria-hidden />;
  const filas: Array<[string, string]> = [
    ["Corre ahora", vista.corre ?? "sin dato"],
    ["Publicada", vista.publicada ?? "sin dato"],
    ...(vista.nueva ? ([["Lista para usar", vista.nueva]] as Array<[string, string]>) : []),
    ["Última mirada", hace(vista.mirada, ahora) ?? "aún no se ha mirado"],
  ];
  return (
    <div className="space-y-2 border-t border-white/10 pt-3" aria-label="Interfaz web">
      <div className="flex flex-wrap items-center gap-2" aria-live="polite">
        <h3 className="text-sm font-medium">Interfaz web</h3>
        <Badge variant="outline" className="gap-1">
          {icono}
          {vista.titulo}
        </Badge>
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        {filas.map(([k, v]) => (
          <div key={k} className="flex min-w-0 gap-2">
            <dt className="shrink-0 text-muted-foreground">{k}</dt>
            <dd className="min-w-0 truncate font-mono text-foreground/90" title={v}>{v}</dd>
          </div>
        ))}
      </dl>
      <p role="status" className="text-xs text-muted-foreground">{vista.detalle}</p>
      {vista.motivo && <p role="alert" className="text-xs text-red-400">Motivo: {vista.motivo}</p>}
    </div>
  );
}

export default BloqueInterfazWeb;
