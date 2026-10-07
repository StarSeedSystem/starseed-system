"use client";

/*
 * /estaciones/[id] (Ola 1010H · ES1010Hb) — detalle de una estación: aplica
 * DetalleEstacion, que usa ReproductorEstacion.
 */

import { useParams } from "next/navigation";
import { DetalleEstacion } from "@/components/estaciones/detalle-estacion";

export default function EstacionDetallePage() {
  const { id } = useParams<{ id: string }>();
  return <DetalleEstacion id={id} />;
}
