/**
 * map-view-extension — el punto de extensión de `MapView` (MAP1114C).
 * ═══════════════════════════════════════════════════════════════════════════════
 * El mapa del Hub Social es UNO. Otras pantallas (la pestaña «Mapa» de Señales) lo reutilizan tal cual y le
 * añaden, por esta prop opcional, sus secciones en el panel de capas, sus marcas y sus superposiciones.
 * Sin la prop, `MapView` se comporta exactamente como antes (lo prueba `__tests__/map-view-sin-extension`).
 * Solo tipos: sin React en tiempo de ejecución.
 */

import type { ReactNode } from "react";
import type { LeafletNS } from "@/lib/map/leaflet-loader";

/** Lo que `MapView` entrega a la extensión cuando Leaflet y el mapa ya existen. */
export interface MapExtensionCtx {
  L: LeafletNS;
  map: any;
  /** Pide la ubicación al navegador (llamar desde un gesto de la persona) y centra el mapa. */
  ubicarme: () => void;
  /** Abre el panel de capas. */
  abrirCapas: () => void;
  /** Deja de seguir mi posición (para que el mapa no se recentre solo mientras se mira otra cosa). */
  dejarDeSeguir: () => void;
}

export interface MiPosicion {
  lat: number;
  lng: number;
  /** Precisión en metros que informa el aparato, si la informa. */
  accuracy: number | null;
  /** Hora de la medida (epoch ms). */
  t: number;
}

/**
 * (AUD1117) Cómo va la base geográfica de teselas: `cargando` al empezar, `ok` cuando se pudo pintar
 * y `fallo` cuando alguna tesela no cargó (sin red o servidor caído). La extensión decide su respaldo.
 */
export type EstadoBaseGeografica = "cargando" | "ok" | "fallo";

export interface MapViewExtension {
  /** Clave propia de la vista guardada (centro, zoom, capas). Así no se mueve la vista del Hub. */
  viewKey?: string;
  /** Al abrir, centra en la ubicación del aparato si el permiso YA estaba concedido (nunca lo pide solo). */
  centrarEnMiUbicacion?: boolean;
  /** Zoom al centrar en mi ubicación (por defecto 18: los puntos son exactos). */
  zoomAlCentrar?: number;
  /** Mantiene la vigilancia de la posición (watchPosition) mientras sea true. */
  vigilarPosicion?: boolean;
  /** No dibuja el punto azul «Mi ubicación» del Hub (la extensión pinta el aparato con su marca). */
  ocultarPuntoPropio?: boolean;
  /** Cada medida de la posición de este aparato. */
  onMiPosicion?: (p: MiPosicion) => void;
  /** El navegador negó o no pudo dar la ubicación. */
  onErrorUbicacion?: (motivo: string) => void;
  /** Clases extra del panel de capas (p. ej. su alto máximo en una pantalla pequeña). */
  clasePanelCapas?: string;
  /** (AUD1117) Avisa de cada cambio de la base geográfica (teselas). Sin esto, nada cambia. */
  onBaseEstado?: (estado: EstadoBaseGeografica) => void;
  /** Secciones que se añaden AL PRINCIPIO del panel de capas. */
  seccionCapas?: (ctx: MapExtensionCtx) => ReactNode;
  /** Superposiciones sobre el mapa (leyendas, ficha). Aquí se pintan también las marcas (efectos con `ctx.L`). */
  superposicion?: (ctx: MapExtensionCtx) => ReactNode;
}
