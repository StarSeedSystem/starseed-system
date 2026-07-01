// ══════════════════════════════════════════════════════════════════
// /store — RUTA RETIRADA. La Tienda ahora vive DENTRO de la Librería.
// ------------------------------------------------------------------
// El concepto de "Tienda" se trasladó a la Librería (#130): publicar
// creaciones, instalar → Biblioteca, valoraciones y store_items son ahora
// una pestaña de la Librería. Nada se pierde. Esta ruta redirige a la
// Librería en su pestaña "Tienda" para conservar cualquier enlace antiguo.
// ══════════════════════════════════════════════════════════════════

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function StoreRedirectPage() {
  redirect("/library?tab=store");
}
