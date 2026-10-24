/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Ayudante común del clic derecho «Variaciones públicas» (Ola 1019V · §3 del
 * contrato architecture/variaciones-publicas.md)
 * ---------------------------------------------------------------------------
 * Los menús contextuales que ya existen añaden la MISMA entrada con
 * `accionVariaciones(clave)`, sin cambiar su forma: devuelve la acción
 * { label, icon, onClick } que abre la ventana de variaciones por el bus
 * (`variaciones-bus.ts`). Módulo puro: sin estado, sin red y sin DOM propio —
 * el destino de eventos se inyecta para que las pruebas (y servers) no toquen
 * `window`.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { Layers } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { abrirVariaciones, type DestinoEventos, type OpcionesVariaciones } from "./variaciones-bus";
import { leerClave } from "@/lib/variaciones/clave-elemento";

/** Etiqueta única de la entrada (una clave, para que ningún menú la escriba distinta). */
export const ETIQUETA_VARIACIONES = "Variaciones públicas";

/** Forma mínima de la acción de menú; encaja con `FinderExtraAction` y por el estilo de todos los menús del OS. */
export interface AccionVariaciones {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}

/** La entrada estándar: «Variaciones públicas» de la clave de elemento dada. `destino` solo lo inyectan las pruebas. */
export function accionVariaciones(
  clave: string,
  opciones: OpcionesVariaciones = {},
  destino?: DestinoEventos,
): AccionVariaciones {
  return {
    label: ETIQUETA_VARIACIONES,
    icon: Layers,
    onClick: () => {
      abrirVariaciones(clave, opciones, destino);
    },
  };
}

/** Forma mínima de un ítem guardado de la Biblioteca (espeja `SavedItem`, sin importar su módulo pesado). */
export interface ItemBibliotecaParaClave {
  type: string;
  /** Id del recurso original en su propio sistema (paquete, rama…). */
  refId?: string | null;
  refKind?: string;
  refId2?: string | null;
  /** Ruta interna del OS que abre la app del recurso. */
  route?: string | null;
  url?: string | null;
  /** Solo alias: sin contenido propio, la clave se resuelve en el llamador con el registro. */
  targetItemId?: string | null;
}

/** Devuelve la clave si es canónica, o null si el registro la tendría que rechazar. */
function claveValida(clave: string): string | null {
  return leerClave(clave) ? clave : null;
}

/** Clave de una ruta interna limpia: `/red-mesh` → `app:red-mesh`; con query, anclaje o tramos, no hay clave. */
function claveDesdeRuta(route: string): string | null {
  const sinExtras = route.split("?")[0].split("#")[0].replace(/^\/+|\/+$/g, "");
  if (!sinExtras || sinExtras.includes("/")) return null;
  return claveValida(`app:${sinExtras}`);
}

/**
 * Clave canónica de un ítem de la Biblioteca (contrato §2: la clave nombra el TIPO, nunca la
 * instancia ni datos privados). Solo cuando hay identificador estable y público:
 *   · paquete  → `paquete:<refId>` · la ficha del catálogo, compartida por quien la tenga instalada
 *   · ruta     → `app:<tramo>`     · la app/página real del OS que la ruta abre
 *   · rama     → la clave del recurso que refleja (`refKind` con su `refId`)
 * Alias e ítems privados (contactos, mensajes, archivos propios) quedan sin clave a propósito.
 */
export function claveDeItemBiblioteca(item: ItemBibliotecaParaClave | null | undefined): string | null {
  if (!item || typeof item.type !== "string") return null;
  if (item.type === "package" && item.refId) return claveValida(`paquete:${item.refId}`);
  if (item.type === "route" && item.route) return claveDesdeRuta(item.route);
  if (item.type === "branch" && item.refKind) {
    const original: ItemBibliotecaParaClave = {
      type: item.refKind,
      refId: item.refId ?? item.refId2 ?? null,
      route: item.route ?? null,
    };
    return claveDeItemBiblioteca(original);
  }
  return null;
}
