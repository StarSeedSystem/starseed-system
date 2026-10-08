"use client";

/*
 * /estaciones (Ola 1010E · ES1010J/ES1010K) — página «Estaciones»: enlaces
 * públicos a transmisiones en directo de cualquier formato. Aplica el
 * DirectorioEstaciones ya probado y conecta «Publicar estación» al diálogo
 * NuevaEstacion (ES1010K), que publica en os_estaciones.
 */

import { useCallback, useState } from "react";
import { DirectorioEstaciones } from "@/components/estaciones/directorio-estaciones";
import { NuevaEstacion } from "@/components/estaciones/nueva-estacion";

export default function EstacionesPage() {
  const [publicando, setPublicando] = useState(false);
  const onPublicar = useCallback(() => setPublicando(true), []);
  const cerrar = useCallback(() => setPublicando(false), []);
  return (
    <>
      <DirectorioEstaciones onPublicar={onPublicar} />
      <NuevaEstacion abierto={publicando} onCerrar={cerrar} />
    </>
  );
}
