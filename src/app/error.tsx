"use client";

/**
 * Error boundary RAÍZ de segmento (Adenda 129).
 * ============================================================================
 * Al activar el layout del grupo (app) —que ahora monta globales vía AppGlobals—
 * un throw en render de un layout de grupo o de una página burbujeaba, a falta de
 * este archivo, hasta `global-error.tsx`, que REEMPLAZA el documento ENTERO. Este
 * `app/error.tsx` (hijo del layout raíz) captura los errores del subárbol de rutas
 * SIN tumbar el shell del raíz (fondos, dock, orbe): intercambia solo el subárbol
 * fallido y ofrece reintentar. Red de seguridad; los globales ya degradan solos.
 */

import { useEffect } from "react";
import { esErrorDeVersionNueva, recargarPorVersionNueva } from "@/lib/pwa/recarga-por-version";
import { limpiarDatosPersonales, normalizarError } from "@/lib/mando/errores-neurona";

/** Log limpio y anotación en Genesis: el error llega a la autocuración sin datos personales. */
function anotarErrorEnGenesis(error: Error, ambito: "pagina" | "proceso", proceso: string): void {
  const evento = limpiarDatosPersonales(normalizarError(error, { ambito, proceso }));
  const excepcion = evento.exception.values[0];
  const detalle = `${excepcion?.type ?? "Error"}: ${excepcion?.value ?? "sin mensaje"} (huella ${evento.fingerprint.join(" · ")})`;
  console.error(`[${proceso}]`, detalle, evento);
  void fetch("/api/mando/orquestar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      modo: "anotar",
      mensaje: `[error de ${ambito} · ${proceso}] ${detalle}`.slice(0, 1800),
    }),
  }).catch(() => undefined);
}

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    try {
      anotarErrorEnGenesis(error, "proceso", "app/error");
    } catch {
      /* */
    }
    // Una pestaña abierta antes de publicar/reconstruir pide trozos que ya no existen: se recarga sola.
    if (esErrorDeVersionNueva(error)) recargarPorVersionNueva();
  }, [error]);

  return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: "center", color: "#e5e7eb" }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Algo se interrumpió</h2>
        <p style={{ fontSize: 14, opacity: 0.7, marginBottom: 16, lineHeight: 1.5 }}>
          Ocurrió un error al mostrar esta sección. Puedes reintentar; el resto del sistema sigue activo.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          style={{ cursor: "pointer", borderRadius: 12, border: "1px solid rgba(255,255,255,.15)", background: "linear-gradient(135deg,#7c5cff,#23d5ab)", color: "#fff", fontWeight: 600, fontSize: 14, padding: "10px 20px" }}
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}
