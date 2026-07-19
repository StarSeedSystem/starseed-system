"use client";

// src/components/creation/global-editor-host.tsx
// ─────────────────────────────────────────────────────────────────────────────
// EDITOR UNIVERSAL GLOBAL (Adenda 71-ter · I3) — host universal del Editor.
//
// El botón "Editor" salió de la cabecera del Exocórtex (ZenithCurtain) y ahora
// vive en el menú de creación IZQUIERDO de Trinity (Centro de Creación, entre
// «Lienzo Universal» y «Fragua de Widgets»). Para que abra desde CUALQUIER ruta
// —y aunque la ventana Exocórtex esté cerrada— cualquier superficie dispara el
// evento global 'starseed:open-editor' y este host, montado en el layout RAÍZ,
// abre la MISMA UniversalEditor. Mismo patrón que GlobalForgeHost/'open-forge'.
//
// Sin UI hasta que llega el evento. SSR-safe y defensivo.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { UniversalEditor } from "@/components/layout/universal-editor";

/** Evento global que abre el Editor Universal desde cualquier parte del OS. */
export const OPEN_EDITOR_EVENT = "starseed:open-editor";

/**
 * Host global del Editor Universal. Montar UNA vez en src/app/layout.tsx (junto
 * a los demás globales). Escucha 'starseed:open-editor'.
 */
export function GlobalEditorHost() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => setOpen(true);
    window.addEventListener(OPEN_EDITOR_EVENT, handler);
    return () => window.removeEventListener(OPEN_EDITOR_EVENT, handler);
  }, []);

  return <UniversalEditor open={open} onClose={() => setOpen(false)} />;
}

export default GlobalEditorHost;
