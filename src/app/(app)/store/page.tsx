// ══════════════════════════════════════════════════════════════════
// /store — RUTA RETIRADA. La Tienda desapareció como concepto: sus
// funciones (publicar/instalar/valorar) viven fundidas en la pestaña
// «Explorar» de la Librería. Esta ruta redirige a /library para
// conservar cualquier enlace antiguo. Nada se pierde.
// ══════════════════════════════════════════════════════════════════

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function StoreRedirectPage() {
  redirect("/library");
}
