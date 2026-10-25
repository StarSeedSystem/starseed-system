"use client";

/**
 * StarSeed XR · ENTRADA GLOBAL (XR1010F, contrato §3 c).
 *
 * Pinta el acceso «Entrar en VR/AR» en la esquina inferior izquierda, por encima del dock y
 * lejos del orbe de Aurora (que vive a la derecha). Es SOLO el acceso: al pulsar navega a
 * `/xr/os?modo=vr|ar`, donde XR1010G abre la sesión. Aquí no se importa ningún motor 3D: este
 * componente se monta en todas las rutas y tiene que pesar lo mínimo. Si ningún modo inmersivo
 * es posible, no pinta nada.
 */
import { useState } from "react";
import type { MouseEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { esInmersivo } from "@/lib/xr/tipos";
import { BotonEntradaXR } from "./boton-entrada-xr";
import { useCapacidadesXR } from "./use-capacidades-xr";

/** Preferencia local del botón (contrato XR1010F). */
const CLAVE_OCULTO = "starseed.xr.boton.oculto.v1";
/** Rutas donde el acceso global no aporta: la consola y la propia sesión XR. */
const RUTAS_SIN_ENTRADA = ["/genesis", "/xr/os"];

function esRutaSinEntrada(ruta: string | null): boolean {
  if (!ruta) return false;
  return RUTAS_SIN_ENTRADA.some((base) => ruta === base || ruta.startsWith(`${base}/`));
}

/** `try/catch` a propósito: en modo privado `localStorage` puede lanzar y la entrada debe seguir viva. */
function leerOculto(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(CLAVE_OCULTO) === "1";
  } catch {
    return false;
  }
}

function guardarOculto(oculto: boolean): void {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(CLAVE_OCULTO, oculto ? "1" : "0");
  } catch {
    /* Sin almacenamiento: se oculta en esta visita y no se recuerda. */
  }
}

/** Del botón pulsado («Entrar en VR» / «Entrar en AR») al parámetro de `/xr/os`. */
function modoDeBoton(boton: Element): "vr" | "ar" | null {
  const texto = `${boton.getAttribute("aria-label") ?? ""} ${boton.textContent ?? ""}`.toUpperCase();
  if (texto.includes("VR")) return "vr";
  if (texto.includes("AR")) return "ar";
  return null;
}

export function EntradaGlobalXR() {
  const ruta = usePathname();
  const router = useRouter();
  const { estado, capacidades } = useCapacidadesXR();
  const [oculto, setOculto] = useState(leerOculto);

  // Mientras se sondea el aparato no se afirma nada: sin botón muerto ni aviso adelantado.
  const hayInmersivo = estado === "listo" && capacidades.modos.some(esInmersivo);
  if (esRutaSinEntrada(ruta) || oculto || !hayInmersivo) return null;

  const ocultar = () => {
    setOculto(true);
    guardarOculto(true);
  };

  // Se captura el clic ANTES del botón universal: aquí no se abre la sesión (eso cargaría el
  // motor 3D en todas las rutas), solo se navega a `/xr/os`, que es quien la abre (XR1010G).
  const alPulsar = (evento: MouseEvent<HTMLDivElement>) => {
    const objetivo = evento.target;
    if (!(objetivo instanceof Element)) return;
    const boton = objetivo.closest("button");
    if (!boton) return;
    const modo = modoDeBoton(boton);
    if (!modo) return;
    evento.preventDefault();
    evento.stopPropagation();
    router.push(`/xr/os?modo=${modo}`);
  };

  return (
    <div className="fixed bottom-24 left-6 z-50 flex flex-col items-start gap-1" data-testid="entrada-global-xr">
      <button
        type="button"
        onClick={ocultar}
        aria-label="Ocultar el botón de entrada a VR y AR"
        title="Ocultar el acceso a VR y AR (sigue disponible en Logic)"
        className="cursor-pointer rounded-full border border-white/15 bg-[#0E101E]/90 px-2 py-0.5 text-xs text-[#B9C0D8] transition duration-150 hover:text-[#F5F7FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14]/70"
      >
        ×
      </button>
      {/* El botón universal se pinta «flotante»; se devuelve al flujo para situarlo arriba a la
          izquierda (su `fixed` por defecto es la esquina derecha, donde está el orbe de Aurora). */}
      <div
        onClickCapture={alPulsar}
        className="[&_[data-testid='boton-entrada-xr']]:!static [&_[data-testid='boton-entrada-xr']]:!items-start"
      >
        <BotonEntradaXR variante="flotante" />
      </div>
    </div>
  );
}
