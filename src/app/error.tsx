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
import {
  CLAVE_RASTRO_ERRORES,
  huella,
  limpiarDatosPersonales,
  limpiarTexto,
  normalizarError,
  type EventoError,
} from "@/lib/mando/errores-neurona";

/**
 * Edita en el rastro de errores (sessionStorage, acotado a 20, los viejos fuera) el evento
 * estilo Sentry ya limpio y con huella, para que la autocuración de la página
 * (`autocuracion-pagina.ts`) lo agrupe y el diagnóstico lo vea tras una recarga.
 */
function anotarRastro(evento: EventoError): void {
  try {
    const crudo = window.sessionStorage.getItem(CLAVE_RASTRO_ERRORES);
    const lista: unknown = crudo ? JSON.parse(crudo) : null;
    const eventos = Array.isArray(lista) ? (lista as EventoError[]) : [];
    eventos.push(evento);
    window.sessionStorage.setItem(CLAVE_RASTRO_ERRORES, JSON.stringify(eventos.slice(-20)));
  } catch {
    /* Sin sessionStorage el evento se queda en la consola; el remedio no depende de él. */
  }
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
      // Evento estilo Sentry limpio y con huella (Ola 1020S): sin datos personales en consola ni rastro.
      const evento = limpiarDatosPersonales(
        normalizarError(error ?? new Error("sin mensaje"), { ambito: "pagina", proceso: "error-raiz-de-segmento" }),
      );
      huella(evento);
      anotarRastro(evento);
      // eslint-disable-next-line no-console
      console.error(
        "[app/error]",
        `huella ${evento.fingerprint.join(" · ")}`,
        evento.exception.values[0]?.value || "(sin mensaje)",
      );
    } catch {
      /* El rastro de errores nunca debe impedir la recuperación de la página. */
    }
    if (error?.digest) {
      // eslint-disable-next-line no-console
      console.error("[app/error] digest:", error.digest);
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
