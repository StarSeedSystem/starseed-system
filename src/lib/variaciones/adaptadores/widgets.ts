// Familia «widget» de las variaciones públicas (contrato §5 de architecture/variaciones-publicas.md).
// La clave nombra el TIPO de widget (`widget:CLOCK_DATE`), que todas las personas comparten; nunca
// la instancia. Módulo PURO: el acceso al Dashboard se inyecta por puertos; sin disco, red ni DOM.
// Una variación lleva configuración visual y de opciones, jamás datos personales.

import type { WidgetType } from "@/components/dashboard/dashboard-types";
import { dimsForSize, SIZE_ORDER, type SizeDims, type WidgetSize } from "@/components/dashboard/dashboard-size";
import { WIDGET_MANIFEST, getSizeConstraints } from "@/components/dashboard/widget-manifest";
import { normalizeDesignFile, type DesignFile } from "@/lib/design/design-files";
import { validarVariacion } from "../validar";
import { registrarFamilia, type AdaptadorFamilia } from "../familias";

// Claves cuyos valores son datos del usuario: nunca van en una variación publicable.
const CLAVES_DE_DATOS = new Set(["items", "nota", "notas", "tarea", "tareas", "texto", "contenido", "mensaje", "mensajes", "correo", "telefono", "direccion", "ubicacion", "ciudad"]);
// Estética del OS: nada de hexadecimales sueltos en la configuración capturada.
const PATRON_HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const fallo = (motivos: string[]) => ({ ok: false as const, motivos });
const llevaHex = (valor: unknown, hondo = 2): boolean =>
  typeof valor === "string" ? PATRON_HEX.test(valor.trim()) : hondo > 0 && esObjeto(valor) && Object.values(valor).some((v) => llevaHex(v, hondo - 1));

/** Configuración de opciones de un widget (JSON plano, sin datos personales). */
export type AjustesWidget = Record<string, unknown>;
/** Lo que publica una variación de widget: ajustes y, si procede, la talla. */
export type ParcheWidget = { ajustes: AjustesWidget; size?: WidgetSize };
/** Una instancia concreta del tablero (el adaptador nunca la guarda). */
export type InstanciaWidget = { id: string; ajustes: AjustesWidget; size?: WidgetSize };
/** Puertos del Dashboard: instancia elegida por tipo, y escribir la fusión (size null = sin etiqueta). */
export type PuertoWidgets = {
  elegida: (tipo: WidgetType) => InstanciaWidget | null;
  escribir: (id: string, fusion: { ajustes: AjustesWidget; size: WidgetSize | null }) => void;
};

/** Valida un parche: JSON plano, campos propios, sin datos personales ni hex suelto. */
export function validarParcheWidget(raw: unknown): { ok: true; parche: ParcheWidget } | { ok: false; motivos: string[] } {
  const base = validarVariacion(raw);
  if (!base.ok) return fallo(base.motivos);
  if (!esObjeto(raw)) return fallo(["Widget: el payload debe ser un objeto con «ajustes»"]);
  const extra = Object.keys(raw).filter((k) => k !== "ajustes" && k !== "size");
  if (extra.length) return fallo([`Widget: «${extra.join(", ")}» no es un campo de esta variación`]);
  const motivos: string[] = [];
  let size: WidgetSize | undefined;
  if ("size" in raw && typeof raw.size === "string" && (SIZE_ORDER as readonly string[]).includes(raw.size)) size = raw.size as WidgetSize;
  else if ("size" in raw) motivos.push("Widget: la talla debe ser S, M, L o XL");
  if (!esObjeto(raw.ajustes)) return fallo([...motivos, "Widget: los ajustes deben ser un objeto de configuración"]);
  const ajustes = raw.ajustes;
  if (Object.keys(ajustes).length === 0) motivos.push("Widget: la variación no cambia nada");
  for (const [clave, valor] of Object.entries(ajustes)) {
    if (CLAVES_DE_DATOS.has(clave.toLowerCase())) motivos.push(`Widget: «${clave}» son datos personales, no configuración`);
    else if (llevaHex(valor)) motivos.push(`Widget: «${clave}» lleva un hexadecimal suelto; usa un token del OS`);
  }
  return motivos.length ? fallo(motivos) : { ok: true, parche: size ? { ajustes, size } : { ajustes } };
}
/** El tipo de widget de una clave `widget:<Tipo>`; `null` si la familia o el tipo no existen. */
export function tipoDeClave(clave: string): WidgetType | null {
  const [familia, id] = clave.split(":");
  return familia === "widget" && id && id in WIDGET_MANIFEST ? (id as WidgetType) : null;
}
/** Footprint real de una talla, recortado a los límites que el manifiesto declara. */
export function huellaDe(tipo: WidgetType, size: WidgetSize): SizeDims { return dimsForSize(tipo, size); }
/** ¿Cabe un footprint w×h dentro de los mínimos y máximos que declara su tipo? */
export function estaEnLimites(tipo: WidgetType, w: number, h: number): boolean {
  const c = getSizeConstraints(tipo);
  return w >= c.minW && h >= c.minH && (c.maxW === undefined || w <= c.maxW) && (c.maxH === undefined || h <= c.maxH);
}
/** Quita de unos ajustes toda clave de datos personales; solo queda configuración. */
export function ajustesPublicos(ajustes: AjustesWidget): AjustesWidget {
  return Object.fromEntries(Object.entries(ajustes).filter(([c]) => !CLAVES_DE_DATOS.has(c.toLowerCase())));
}
/** Captura la configuración de una instancia del tipo; `null` sin clave, tipo o instancia. */
function capturarWidget(puerto: PuertoWidgets, clave: string): ParcheWidget | null {
  const tipo = tipoDeClave(clave);
  const instancia = tipo && puerto.elegida(tipo);
  if (!instancia) return null;
  const ajustes = ajustesPublicos(instancia.ajustes);
  return Object.keys(ajustes).length === 0 ? null : instancia.size ? { ajustes, size: instancia.size } : { ajustes };
}
/** Aplica un parche ya validado: lo fusiona con la instancia y devuelve deshacer. */
function aplicarWidget(puerto: PuertoWidgets, clave: string, payload: unknown): () => void {
  const tipo = tipoDeClave(clave);
  if (!tipo) throw new Error("Widget: la clave no nombra un tipo de widget");
  const revision = validarParcheWidget(payload);
  if (!revision.ok) throw new Error(`Variación de widget rechazada: ${revision.motivos.join(" · ")}`);
  const instancia = puerto.elegida(tipo);
  if (!instancia) throw new Error("Widget: no hay instancia de este tipo en este tablero");
  // Instantánea del estado ANTERIOR: el puerto puede mutar el objeto vivo, y
  // deshacer debe restaurar lo que había, no lo que quedará.
  const anterior = { id: instancia.id, ajustes: { ...instancia.ajustes }, size: instancia.size };
  const fusion = { ajustes: { ...anterior.ajustes, ...revision.parche.ajustes }, size: revision.parche.size ?? anterior.size ?? null };
  puerto.escribir(anterior.id, fusion);
  return () => puerto.escribir(anterior.id, { ajustes: anterior.ajustes, size: anterior.size ?? null });
}
/** Crea el adaptador de la familia «widget» con los puertos inyectados. */
export function crearAdaptadorWidget(puerto: PuertoWidgets): AdaptadorFamilia<ParcheWidget> {
  return {
    familia: "widget", nombre: "Widgets del Dashboard",
    capturar: (clave) => capturarWidget(puerto, clave),
    validar: (payload) => {
      const revision = validarParcheWidget(payload);
      return revision.ok ? { ok: true, payload: revision.parche } : { ok: false, motivos: revision.motivos };
    },
    aplicar: (clave, payload) => ({ deshacer: aplicarWidget(puerto, clave, payload) }),
  };
}
/** Registra la familia «widget» en el registro compartido (sustituye al de relleno). */
export function registrarAdaptadoresWidget(puerto: PuertoWidgets): void {
  registrarFamilia(crearAdaptadorWidget(puerto));
}

/** Convierte la variación en el DesignFile publicable (skin de widget), §4 del contrato. */
export function disenoDeWidget(tipo: WidgetType, parche: ParcheWidget): DesignFile {
  const etiqueta = WIDGET_MANIFEST[tipo]?.label ?? "Widget";
  return normalizeDesignFile({
    id: `widget-${tipo.toLowerCase()}-${parche.size?.toLowerCase() ?? "flex"}`,
    nombre: `Skin de ${etiqueta}`, tipo: "skin-widget", categoria: "skins", carpeta: null,
    payload: { tokens: { vars: {} }, override: { tipo, ajustes: parche.ajustes, ...(parche.size ? { size: parche.size } : {}) } },
    scope: ["perfil", "sistema"], preview: { colors: [] }, version: 1, autor: "StarSeed Core",
    descripcion: `Configuración visual y de opciones para el widget ${etiqueta}.`, estilo: "cristal",
  }) as DesignFile;
}