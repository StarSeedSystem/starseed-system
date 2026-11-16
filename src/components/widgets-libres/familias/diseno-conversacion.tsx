"use client";

import { useState, type ReactNode } from "react";
import { AstrauraForma } from "./astraura-forma";
import { PropsDiseno } from "@/lib/widgets/astraura/disenos";
import { PALETAS } from "@/lib/protomolecula/orbe4d/coreografia";
import { haceCuanto } from "@/components/widgets-libres/familias/inicio-piezas";

export function DisenoConversacion({ estado, tam, ultima, hilo, ahora, tactil, voz, preguntar, botonVoz, sugerencias, onAbrirChat, onSugerencia }: PropsDiseno) {
  const hiloReciente = hilo.slice(-6);
  const turnosAMostrar = Math.min(3, hiloReciente.length);
  const isMinimo = tam < 180;

  // En modo mínimo, no mostramos el hilo ni las sugerencias
  if (isMinimo) {
    return (
      <div style={{ width: tam, display: "flex", flexDirection: "column", gap: 2 }}>
        <AstrauraForma
          estado={estado}
          tam={Math.min(tam * 0.6, 44)}
          onClick={onAbrirChat}
        />
        <p
          style={{
            fontSize: "0.75rem",
            color: "var(--foreground)",
            ...PALETAS.astraura,
          }}
        >
          {TEXTO_VOZ[estado as keyof Record<string, string>]}
        </p>
        <p
          style={{
            fontSize: "0.75rem",
            color: "var(--foreground-muted)",
            textAlign: "center",
          }}
        >
          Aún no habéis hablado. Pregúntale lo que quieras.
        </p>
        <button onClick={onAbrirChat} style={{ marginTop: 4 }}>
          {typeof preguntar === "string" ? preguntar : "Preguntar"}
        </button>
      </div>
    );
  }

  return (
    <div style={{ width: tam, display: "flex", flexDirection: "column", gap: 2 }}>
      <AstrauraForma
        estado={estado}
        tam={Math.min(tam * 0.6, 44)}
        onClick={onAbrirChat}
      />
      <p
        style={{
          fontSize: "0.75rem",
          color: "var(--foreground)",
          ...PALETAS.astraura,
        }}
      >
        {TEXTO_VOZ[estado as keyof Record<string, string>]}
      </p>
      {turnosAMostrar > 0 ? (
        <ol style={{ display: "flex", flexDirection: "column", gap: 1, maxHeight: "150px", overflowY: "auto" }}>
          {hiloReciente.map((turno, i) => {
            const esUltimo = i === turnosAMostrar - 1;
            const rolTexto = turno.rol === "user" ? "Tú" : "Astraura";
            const tiempo = haceCuanto(turno.ts, ahora);
            const textoLargo = turno.texto.length > 0 ? `${rolTexto}: ${turno.texto}` : rolTexto;

            return (
              <li key={`${turno.ts}-${i}`} style={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                <span style={{ fontSize: "0.65rem", color: "var(--foreground-muted)" }}>
                  {rolTexto}
                </span>
                <span
                  style={{
                    fontSize: "0.75rem",
                    lineHeight: 1.4,
                    wordBreak: "break-word",
                    title: turno.texto,
                  }}
                >
                  {textoLargo}
                </span>
                {esUltimo && (
                  <span style={{ fontSize: "0.55rem", marginTop: 1 }}>
                    {tiempo}
                  </span>
                )}
              </li>
            );
          })}
          {hiloReciente.length < turnosAMostrar && (
            <li style={{ flexDirection: "column", alignItems: "center", paddingTop: 4 }}>
              <span style={{ fontSize: "0.75rem", color: "var(--foreground-muted)" }}>
                Aún no habéis hablado. Pregúntale lo que quieras.
              </span>
            </li>
          )}
        </ol>
      ) : (
        <p
          style={{
            fontSize: "0.75rem",
            color: "var(--foreground-muted)",
            textAlign: "center",
          }}
        >
          Aún no habéis hablado. Pregúntale lo que quieras.
        </p>
      )}

      <button onClick={onAbrirChat} style={{ marginTop: 4 }}>
        {typeof preguntar === "string" ? preguntar : "Preguntar"}
      </button>
    </div>
  );
}

const TEXTO_VOZ: Record<string, string> = {
  calma: "En calma",
  escuchando: "Escuchando…",
  hablando: "Hablando",
  pensando: "Pensando…",
};