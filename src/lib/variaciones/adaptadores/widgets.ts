// Familia «widget» de las variaciones públicas (architecture/variaciones-publicas.md §5).
// Clave `widget:<WidgetType>` (src/components/dashboard/dashboard-types.ts): la clave nombra el TIPO,
// nunca la instancia ni datos personales. capturar toma la configuración visual y de opciones de la
// instancia elegida; validar comprueba la huella contra `getSizeConstraints`; aplicar la fusiona
// con la instancia elegida y devuelve deshacer. Módulo PURO: puerto inyectado, sin disco ni red.
import { validarVariacion } from "../validar";
import { registrarFamilia, type AdaptadorFamilia } from "../familias";
import { getSizeConstraints } from "@/components/dashboard/widget-manifest";
import type { WidgetType } from "@/components/dashboard/dashboard-types";

export type TamanoWidget = "S" | "M" | "L" | "XL";
export type HuellaWidget = { w: number; h: number };
/** Opciones compartibles: primitivos o arreglos cortos de primitivos, nada de objetos oscuros. */
export type OpcionesWidget = Record<string, string | number | boolean | (string | number | boolean)[]>;
export type ParcheWidget = { tipo: WidgetType; size?: TamanoWidget; huella?: HuellaWidget; opciones?: OpcionesWidget };
/** Instancia real del Dashboard de la persona: se lee para capturar y se fusiona al aplicar. */
export type InstanciaWidget = { id: string; tipo: WidgetType; settings?: Record<string, unknown>; size?: TamanoWidget; huella?: HuellaWidget };
export type CambioWidget = { settings?: Record<string, unknown>; size?: TamanoWidget; huella?: HuellaWidget };
export type PuertoWidgets = { elegida: (tipo: WidgetType) => InstanciaWidget | null; guardar: (id: string, cambio: CambioWidget) => void };

const TAMAÑOS = new Set<string>(["S", "M", "L", "XL"]);
const esTipoWidget = (v: unknown): v is string => typeof v === "string" && /^[A-Z][A-Z0-9_]{2,39}$/.test(v);
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const sobran = (o: Record<string, unknown>, ok: readonly string[]) => Object.keys(o).filter((k) => !ok.includes(k));
const fallo = (motivos: string[]) => ({ ok: false as const, motivos });

// Opciones visuales y de comportamiento permitidas: clave explícita, así una variación de widget
// nunca lleva datos personales (memorias, rutas, ids de cuenta…) ni código (customHtml queda fuera).
const CLAVES_OPCION = new Set<string>([
  "clockMode", "clockFormat", "clockZones", "showSeconds", "units", "precision", "variant",
  "view", "mode", "layout", "selectedLayout", "compact", "showLabels", "showDate", "themeColor",
  "accent", "color", "theme", "opacity", "blur", "borderRadius", "glowIntensity", "scale",
  "smooth", "rotateX", "rotateY", "animationStiffness", "animationDamping", "refreshInterval",
  "sound",
]);
export const esClaveOpcionWidget = (k: string): boolean => CLAVES_OPCION.has(k);
const esPrimitivo = (v: unknown): boolean => ["string", "number", "boolean"].includes(typeof v);
const esOpcionesValidas = (v: unknown): v is OpcionesWidget => esObjeto(v)
  && Object.values(v).every((p) => esPrimitivo(p) || (Array.isArray(p) && p.length <= 12 && p.every(esPrimitivo)));
/** Valida la huella contra `getSizeConstraints` del manifiesto (mínimos y máximos declarados). */
export function huellaFueraDeRango(tipo: string, huella: HuellaWidget): string | null {
  if (!(Number.isInteger(huella.w) && huella.w >= 1) || !(Number.isInteger(huella.h) && huella.h >= 1)) return "la huella debe ser de enteros positivos";
  const c = getSizeConstraints(tipo as WidgetType);
  if (huella.w < c.minW || huella.h < c.minH) return `la huella debe ser al menos ${c.minW}×${c.minH}`;
  if ((c.maxW !== undefined && huella.w > c.maxW) || (c.maxH !== undefined && huella.h > c.maxH)) return `la huella supera el máximo del manifiesto`;
  return null;
}
export function validarParcheWidget(p: unknown): { ok: true; parche: ParcheWidget } | { ok: false; motivos: string[] } {
  const v = validarVariacion(p);
  if (!v.ok) return fallo(v.motivos);
  if (!esObjeto(p)) return fallo(["Widget: el payload debe ser un objeto"]);
  const m = sobran(p, ["tipo", "size", "huella", "opciones"]).map((k) => `Widget: «${k}» no es un campo de esta variación`);
  if (!esTipoWidget(p.tipo)) { m.push("Widget: el tipo del widget no es válido"); return fallo(m); }
  if ("size" in p && !(typeof p.size === "string" && TAMAÑOS.has(p.size))) m.push("Widget: el tamaño debe ser S, M, L o XL");
  if ("huella" in p) {
    if (!esObjeto(p.huella) || sobran(p.huella, ["w", "h"]).length > 0 || typeof p.huella.w !== "number" || typeof p.huella.h !== "number") m.push("Widget: la huella debe ser {w, h}");
    else { const fuera = huellaFueraDeRango(p.tipo, p.huella as HuellaWidget); if (fuera) m.push(`Widget: ${fuera}`); }
  }
  if ("opciones" in p) {
    if (!esOpcionesValidas(p.opciones)) m.push("Widget: las opciones deben ser primitivos o arreglos cortos");
    else {
      const ajenas = Object.keys(p.opciones).filter((k) => !CLAVES_OPCION.has(k));
      if (ajenas.length) m.push(`Widget: «${ajenas[0]}» no es una opción compartible de la variación`);
    }
  }
  if (m.length) return fallo(m);
  return { ok: true as const, parche: p as unknown as ParcheWidget };
}
/** capturar: `widget:<WidgetType>` → configuración visual y de opciones de la instancia elegida. */
export function capturarWidget(puerto: PuertoWidgets, clave: string): ParcheWidget | null {
  const [familia, tipo] = clave.split(":");
  if (familia !== "widget" || !esTipoWidget(tipo)) return null;
  const instancia = puerto.elegida(tipo);
  if (!instancia) return null;
  const opciones: OpcionesWidget = {};
  if (esObjeto(instancia.settings)) {
    for (const [k, v] of Object.entries(instancia.settings)) {
      if (!CLAVES_OPCION.has(k)) continue; // clave ajena al catálogo visual (p. ej. datos personales): no viaja
      if (esPrimitivo(v) || (Array.isArray(v) && v.length <= 12 && v.every(esPrimitivo))) opciones[k] = v as OpcionesWidget[string];
    }
  }
  const parche: ParcheWidget = { tipo };
  if (instancia.size && TAMAÑOS.has(instancia.size)) parche.size = instancia.size;
  if (instancia.huella && huellaFueraDeRango(tipo, instancia.huella) === null) parche.huella = instancia.huella;
  if (Object.keys(opciones).length > 0) parche.opciones = opciones;
  const comparte = parche.size !== undefined || parche.huella !== undefined || Object.keys(opciones).length > 0;
  return comparte ? parche : null;
}
/** aplicar: fusiona el parche con la instancia elegida y devuelve deshacer. */
export function aplicarWidget(puerto: PuertoWidgets, clave: string, payload: ParcheWidget): () => void {
  const r = validarParcheWidget(payload);
  if (!r.ok) throw new Error(`Variación del widget rechazada: ${r.motivos.join(" · ")}`);
  const tipo = clave.split(":")[1];
  if (tipo !== payload.tipo) throw new Error("Widget: la clave no coincide con el parche");
  const instancia = puerto.elegida(payload.tipo);
  if (!instancia) throw new Error("Widget: no hay instancia elegida de ese tipo");
  const previa: CambioWidget = {
    settings: instancia.settings,
    ...(instancia.size !== undefined ? { size: instancia.size } : {}),
    ...(instancia.huella !== undefined ? { huella: instancia.huella } : {}),
  };
  puerto.guardar(instancia.id, {
    settings: instancia.settings ? { ...instancia.settings, ...payload.opciones } : { ...(payload.opciones ?? {}) },
    ...(payload.size !== undefined ? { size: payload.size } : {}),
    ...(payload.huella !== undefined ? { huella: payload.huella } : {}),
  });
  return () => puerto.guardar(instancia.id, previa);
}
export const crearAdaptadorWidget = (puerto: PuertoWidgets): AdaptadorFamilia<ParcheWidget> => ({
  familia: "widget", nombre: "Widgets del Dashboard",
  capturar: (clave) => capturarWidget(puerto, clave),
  validar: (payload) => {
    const r = validarParcheWidget(payload);
    return r.ok ? { ok: true, payload: r.parche } : { ok: false, motivos: r.motivos };
  },
  aplicar: (clave, payload) => ({ deshacer: aplicarWidget(puerto, clave, payload) }),
});
/** Registra la familia widget en el clic derecho. */
export function registrarAdaptadorWidget(puerto: PuertoWidgets): void {
  registrarFamilia(crearAdaptadorWidget(puerto));
}
