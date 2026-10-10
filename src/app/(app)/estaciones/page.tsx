"use client";

/*
 * /estaciones (Ola 1010E · ES1010J/ES1010K) — página «Estaciones»: enlaces
 * públicos a transmisiones en directo de cualquier formato. Aplica el
 * DirectorioEstaciones ya probado y conecta «Publicar estación» al diálogo
 * NuevaEstacion (ES1010K), que publica en os_estaciones.
 */

import { useCallback, useEffect, useState } from "react";
import { DirectorioEstaciones } from "@/components/estaciones/directorio-estaciones";
import { NuevaEstacion, type ModoNuevaEstacion } from "@/components/estaciones/nueva-estacion";

const MODOS_URL: readonly ModoNuevaEstacion[] = ["enlace", "omnifrecuencias", "audiomorphic"];

export default function EstacionesPage() {
  const [publicando, setPublicando] = useState(false);
  const [modo, setModo] = useState<ModoNuevaEstacion>("enlace");
  const onPublicar = useCallback(() => { setModo("enlace"); setPublicando(true); }, []);
  const cerrar = useCallback(() => setPublicando(false), []);
  // `/estaciones?nueva=omnifrecuencias` abre «Nueva estación» con la fuente en vivo elegida
  // (lo usa la app oficial de Omnifrecuencias cuando no está dentro del OS).
  useEffect(() => {
    const pedido = new URLSearchParams(window.location.search).get("nueva") as ModoNuevaEstacion | null;
    if (pedido && MODOS_URL.includes(pedido)) {
      setModo(pedido);
      setPublicando(true);
    }
  }, []);
  return (
    <>
      <DirectorioEstaciones onPublicar={onPublicar} />
      <NuevaEstacion abierto={publicando} onCerrar={cerrar} modoInicial={modo} />
    </>
  );
}
