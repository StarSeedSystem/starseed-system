"use client";

/*
 * /estaciones (Ola 1010E · ES1010J) — página «Estaciones»: enlaces públicos a
 * transmisiones en directo de cualquier formato. Solo aplica el
 * DirectorioEstaciones ya probado y enchufa «Publicar estación» a /publicar.
 */

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { DirectorioEstaciones } from "@/components/estaciones/directorio-estaciones";

export default function EstacionesPage() {
  const router = useRouter();
  const onPublicar = useCallback(() => router.push("/publicar"), [router]);
  return <DirectorioEstaciones onPublicar={onPublicar} />;
}
