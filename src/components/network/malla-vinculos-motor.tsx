"use client";

/**
 * Motor de vínculos ENTRE cuentas (Ola 370) como componente propio para que el
 * montaje global lo cargue PEREZOSO (`next/dynamic`, sin SSR): así su pila
 * (ECDH, señalización de par, malla dedicada) no entra en el layout raíz que
 * comparten todas las rutas. Ver `malla-neuronas-mount.tsx`.
 */

import { useVinculosEntreCuentas } from "@/lib/network/vinculos-entre-cuentas";

export default function MallaVinculosMotor(): null {
  useVinculosEntreCuentas();
  return null;
}
