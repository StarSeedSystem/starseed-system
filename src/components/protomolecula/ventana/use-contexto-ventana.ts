"use client";
/**
 * Ventana de la Protomolécula · gancho del contexto. Parte de `leerContexto(ruta)` (lo que deduce el motor de
 * peticiones de la ruta) y le superpone lo último que la pantalla anunció con `EVENTO_CONTEXTO_PROTO`, siempre
 * que ese anuncio sea de la pantalla en la que estás (si cambias de ruta, el anuncio viejo se descarta).
 */
import { useEffect, useMemo, useState } from "react";
import { leerContexto } from "@/lib/protomolecula/peticion";
import type { ContextoProto } from "@/lib/protomolecula/peticion/contrato";
import { fusionarContexto, type AnuncioContexto } from "./contexto";
import { iniciarEscuchaContexto, suscribirAnuncio, ultimoAnuncio } from "./contexto-anunciado";

export function useContextoVentana(ruta?: string): ContextoProto {
  const rutaActual = ruta ?? (typeof window !== "undefined" ? window.location.pathname : "/");
  const [anuncio, setAnuncio] = useState<AnuncioContexto | null>(() => ultimoAnuncio());

  useEffect(() => {
    const dejar = iniciarEscuchaContexto();
    setAnuncio(ultimoAnuncio());
    const baja = suscribirAnuncio(() => setAnuncio(ultimoAnuncio()));
    return () => { baja(); dejar(); };
  }, []);

  const base = useMemo(() => leerContexto(rutaActual), [rutaActual]);
  const vigente = anuncio && (anuncio.ruta ?? rutaActual) === rutaActual ? anuncio : null;
  return useMemo(() => fusionarContexto(base, vigente), [base, vigente]);
}
