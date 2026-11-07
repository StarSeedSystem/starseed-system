"use client";

/*
 * AvisoSinConexion — «Sin conexión: trabajando en local» (APP1107A, 2026-11-07).
 * Contrato: architecture/apps-autonomas-sin-internet.md · lógica: src/lib/nativa/sin-conexion.ts.
 *
 * Global (layout raíz), diminuto y sin dependencias pesadas. En la app nativa (página servida por su
 * servidor local en 127.0.0.1) pregunta al servidor por la red cada minuto y con cada evento
 * online/offline; en la web y la PWA solo escucha esos eventos. Sin red, una pastilla discreta arriba
 * que se puede cerrar (vuelve a salir si la red cambia).
 */

import { useEffect, useState } from "react";
import { WifiOff, X } from "lucide-react";
import { decidirAviso, esServidorLocal, interpretarRed, RUTA_RED, type RedServidorLocal } from "@/lib/nativa/sin-conexion";

const CADA_MS = 60_000;

export function AvisoSinConexion() {
  const [enLinea, setEnLinea] = useState(true);
  const [local, setLocal] = useState(false);
  const [red, setRed] = useState<RedServidorLocal | null>(null);
  const [descartado, setDescartado] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const enLocal = esServidorLocal(window.location);
    setLocal(enLocal);
    let vivo = true;
    const leer = async () => {
      if (vivo) setEnLinea(navigator.onLine !== false);
      if (!enLocal) return;
      try {
        const r = await fetch(RUTA_RED, { cache: "no-store" });
        const v = interpretarRed(await r.json());
        if (vivo) setRed(v);
      } catch {
        // El servidor local se está reiniciando: no hay nada nuevo que decir.
      }
    };
    const alCambiar = () => {
      setDescartado(false);
      void leer();
    };
    void leer();
    window.addEventListener("online", alCambiar);
    window.addEventListener("offline", alCambiar);
    const t = enLocal
      ? setInterval(() => {
          if (document.visibilityState === "visible") void leer();
        }, CADA_MS)
      : null;
    return () => {
      vivo = false;
      window.removeEventListener("online", alCambiar);
      window.removeEventListener("offline", alCambiar);
      if (t) clearInterval(t);
    };
  }, []);

  const aviso = decidirAviso({ navegadorEnLinea: enLinea, enServidorLocal: local, redServidor: red, descartado });
  if (!aviso.mostrar) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      title={aviso.detalle}
      data-testid="aviso-sin-conexion"
      className="pointer-events-auto fixed left-1/2 top-2 z-[9990] flex max-w-[92vw] -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black/65 px-3 py-1.5 text-xs text-white/90 shadow-lg backdrop-blur-md"
    >
      <WifiOff aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-amber-300" />
      <span className="truncate">{aviso.titulo}</span>
      <span className="sr-only">{aviso.detalle}</span>
      <button
        type="button"
        onClick={() => setDescartado(true)}
        aria-label="Cerrar el aviso de sin conexión"
        className="ml-1 cursor-pointer rounded-full p-0.5 text-white/60 transition-colors duration-200 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
      >
        <X aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
