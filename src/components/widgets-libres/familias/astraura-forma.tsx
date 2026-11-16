"use client";

import { useEffect, useRef, useState } from "react";
import { ProtomoleculaLigera } from "@/components/protomolecula/protomolecula-ligera";
import { frasePantallaLectora, type EstadoAsistente } from "@/lib/widgets/astraura/estado-forma";
import { useNivelRender } from "@/lib/widgets/forma/nivel-dispositivo";
import { cn } from "@/lib/utils";

export interface AstrauraFormaProps {
  estado: EstadoAsistente;
  tam: number;
  onClick: () => void;
}

export interface AnuncioEstadoProps {
  estado: EstadoAsistente;
}

export function AstrauraForma({ estado, tam, onClick }: AstrauraFormaProps) {
  const nivelRender = useNivelRender();
  const animada = nivelRender !== "ligero";

  const frase = frasePantallaLectora(estado);
  const ariaLabel = `Abrir el chat de Astraura. ${frase}`;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full outline-none",
        "focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-4",
        "focus-visible:ring-offset-transparent cursor-pointer",
        animada ? "transition-transform duration-200 hover:scale-105" : "",
      )}
      style={{
        width: tam,
        height: tam,
        minWidth: "44px",
        minHeight: "44px",
      }}
    >
      <ProtomoleculaLigera
        estado={estado}
        tam={Math.min(tam, 44)}
        animada={animada}
        className={cn(
          "relative z-10",
          tam < 44 && "pointer-events-none",
        )}
      />
    </button>
  );
}

let ultimoEstadoAnunciado: EstadoAsistente | null = null;
let ultimoTiempoCambio: number = 0;

export function reiniciarAnuncioEstado() {
  ultimoEstadoAnunciado = null;
  ultimoTiempoCambio = 0;
}

export function AnuncioEstado({ estado }: AnuncioEstadoProps) {
  const [mostrar, setMostrar] = useState(false);
  const [texto, setTexto] = useState("");

  useEffect(() => {
    const ahora = Date.now();
    const tiempoDesdeCambio = ahora - ultimoTiempoCambio;

    if (estado !== ultimoEstadoAnunciado && estado !== "calma") {
      if (tiempoDesdeCambio >= 1000 || ultimoEstadoAnunciado === null) {
        const frase = frasePantallaLectora(estado);
        setTexto(frase);
        setMostrar(true);
        ultimoEstadoAnunciado = estado;
        ultimoTiempoCambio = ahora;

        const timeout = setTimeout(() => {
          setMostrar(false);
        }, 1200);

        return () => clearTimeout(timeout);
      }
    } else if (estado === "calma" && mostrar) {
      setMostrar(false);
    }
  }, [estado, mostrar]);

  if (!mostrar) return null;

  const ariaLive = estado === "error" ? "assertive" : "polite";

  return (
    <div
      role="status"
      aria-live={ariaLive}
      className="sr-only"
    >
      {texto}
    </div>
  );
}