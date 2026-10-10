"use client";

/*
 * /estaciones/vivo/[sesion] (2026-10-10) — una estación EN VIVO sincronizada de Omnifrecuencias o
 * Audiomorphic. El enlace lleva la ficha (`?f=` en las públicas; en las privadas todo va en el
 * fragmento `#f=…&k=…`, que nunca sale del navegador), así que la página se arma en el cliente.
 * SOP: architecture/estaciones-en-vivo-parametricas.md §6.
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const PanelEnVivo = dynamic(
  () => import("@/components/estaciones/en-vivo/panel-en-vivo").then((m) => m.PanelEnVivo),
  { ssr: false },
);

export default function EstacionEnVivoPage() {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    const leer = () => setHref(`${window.location.pathname}${window.location.search}${window.location.hash}`);
    leer();
    window.addEventListener("hashchange", leer);
    return () => window.removeEventListener("hashchange", leer);
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6">
      <Link href="/estaciones" className="inline-flex h-11 w-fit cursor-pointer items-center gap-2 text-sm text-white/60 hover:text-white">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Estaciones
      </Link>
      {href ? <PanelEnVivo href={href} /> : <p className="text-sm text-white/60">Cargando estación…</p>}
    </main>
  );
}
