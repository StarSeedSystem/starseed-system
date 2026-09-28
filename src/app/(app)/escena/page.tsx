"use client";

/**
 * /escena — Escenas 3D compartidas (L5 · 2026-09-28): crear una y abrir las mías o las que me
 * compartieron. Cada escena se abre en `/escena/<id>`.
 */

import { LanzadorEscenas } from "@/components/vivo/espacial/lanzador-escenas";

export const dynamic = "force-dynamic";

export default function PaginaEscenas() {
    return <LanzadorEscenas destino="escena" />;
}
