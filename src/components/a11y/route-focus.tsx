"use client";

/**
 * StarSeed OS — RouteFocus (accesibilidad de navegación SPA).
 * ============================================================================
 * En una app cliente (App Router) el navegador NO reinicia el foco ni anuncia
 * nada al cambiar de ruta, así que los usuarios de lector de pantalla / teclado
 * "quedan colgados" donde estaba el foco anterior. Este componente, sin UI:
 *
 *   (a) al cambiar de ruta mueve el foco al landmark principal `#main-content`
 *       (si existe), gestionando `tabindex="-1"` de forma segura para que sea
 *       enfocable programáticamente sin convertirse en trampa de tabulación;
 *   (b) anuncia el cambio mediante una región `aria-live="polite"` oculta
 *       visualmente (sr-only) con el nombre de la página.
 *
 * Diseño defensivo (mismo patrón que `lib/a11y/apply.ts` / `a11y-boot.tsx`):
 *  - SSR-safe: guarda `typeof document`.
 *  - No roba el foco en el montaje inicial (solo en cambios de ruta reales),
 *    para no interferir con el primer render ni con enlaces ancla.
 *  - Respeta a Aurora y a los formularios: si el foco está en un input /
 *    textarea / contenteditable / role=textbox, NO lo mueve (no interrumpe la
 *    dictado ni la escritura del usuario).
 *  - Nunca lanza: todo va envuelto en try/catch best-effort.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/** ¿El elemento activo es un campo editable que NO debemos interrumpir? */
function isEditableTarget(el: Element | null): boolean {
  if (!el) return false;
  const node = el as HTMLElement;
  const tag = node.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (node.isContentEditable) return true;
  const role = node.getAttribute?.("role");
  if (role === "textbox" || role === "searchbox" || role === "combobox") return true;
  return false;
}

/** Deriva una etiqueta legible de la ruta para el anuncio aria-live. */
function routeLabel(pathname: string | null): string {
  try {
    if (!pathname || pathname === "/") return "Página cargada";
    const segment = pathname.split("/").filter(Boolean).pop() ?? "";
    const readable = decodeURIComponent(segment).replace(/[-_]+/g, " ").trim();
    return readable ? `Página cargada: ${readable}` : "Página cargada";
  } catch {
    return "Página cargada";
  }
}

export function RouteFocus() {
  const pathname = usePathname();
  const isFirstRun = useRef(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    // SSR-safe: en el servidor no hay `document`.
    if (typeof document === "undefined") return;

    // No tocar el foco en el montaje inicial: solo en cambios subsecuentes.
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }

    try {
      // No robar el foco si el usuario está escribiendo o Aurora está dictando.
      const active = document.activeElement;
      const typing = isEditableTarget(active);

      const main = document.getElementById("main-content");
      if (main && !typing) {
        // Hacerlo enfocable programáticamente sin ser un tab stop permanente.
        if (!main.hasAttribute("tabindex")) {
          main.setAttribute("tabindex", "-1");
        }
        // Foco programático → no dispara :focus-visible, así que no aparece el
        // anillo de foco de teclado (evita "flash" de outline en el landmark).
        (main as HTMLElement).focus({ preventScroll: false });
      }

      // Anunciar el cambio de forma educada (polite) para lectores de pantalla.
      setMessage(routeLabel(pathname));
    } catch {
      /* best-effort: jamás romper la navegación por accesibilidad */
    }
  }, [pathname]);

  return (
    <div
      data-component="route-focus-announcer"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
}

export default RouteFocus;
