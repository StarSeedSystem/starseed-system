"use client";

/**
 * global-error.tsx — Maneja excepciones no capturadas en el ROOT LAYOUT
 * (incluido el árbol global de providers y el arranque del OS). Reemplaza el
 * genérico "Application error" de Next por un reporte ACCIONABLE: componente,
 * mensaje y stack completo, con botón para copiar. Esto permite diagnosticar
 * la causa raíz real de un client-side exception sin abrir la consola.
 *
 * NOTA: este archivo SÓLO se renderiza cuando el root layout falla. Debe ser
 * autónomo (no depende de providers del layout que pueden haber crasheado).
 */

import { useEffect, useState } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Loguea siempre al console para no perder el stack.
    console.error("[StarSeed GlobalError]", error);
  }, [error]);

  const report = [
    `StarSeed OS · client-side exception`,
    `digest: ${error?.digest ?? "—"}`,
    `message: ${error?.message ?? "—"}`,
    `stack:\n${error?.stack ?? "—"}`,
  ].join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard puede fallar en contexto inseguro */
    }
  };

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: "#0A0712",
          color: "#E9E2F5",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          padding: "24px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            maxWidth: 820,
            margin: "40px auto",
            border: "1px solid #5b3fa3",
            borderRadius: 12,
            padding: 24,
            background: "rgba(30,18,54,0.6)",
          }}
        >
          <h1 style={{ fontSize: 18, margin: "0 0 8px", color: "#C9B6FF" }}>
            ⚠ StarSeed OS · error al cargar
          </h1>
          <p style={{ opacity: 0.8, fontSize: 13, margin: "0 0 16px" }}>
            Ocurrió una excepción no capturada al iniciar. Pega el reporte de
            abajo a Hermes para diagnosticar la causa raíz.
          </p>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontSize: 12,
              lineHeight: 1.5,
              background: "#140E22",
              border: "1px solid #2c2350",
              borderRadius: 8,
              padding: 14,
              maxHeight: 320,
              overflow: "auto",
            }}
          >
            {report}
          </pre>
          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            <button
              onClick={copy}
              style={{
                background: "#5b3fa3",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "8px 16px",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              {copied ? "Copiado ✓" : "Copiar reporte"}
            </button>
            <button
              onClick={reset}
              style={{
                background: "transparent",
                color: "#C9B6FF",
                border: "1px solid #5b3fa3",
                borderRadius: 8,
                padding: "8px 16px",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              Reintentar
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
