// Adaptador de widgets y Dashboard de «Variaciones públicas» (contrato §5 de
// architecture/variaciones-publicas.md). Familia `widget:<WidgetType>`: capturar
// toma la configuración VISUAL y de opciones del widget (nunca sus datos
// personales ni su posición personal en la rejilla), aplicar la fusiona con la
// instancia elegida y devuelve deshacer; las huellas respetan `getSizeConstraints`
// de widget-manifest.ts. Módulo PURO: la instancia y su escritura se inyectan.
import type { WidgetType } from "@/components/dashboard/dashboard-types";
import { WIDGET_MANIFEST, getSizeConstraints } from "@/components/dashboard/widget-manifest";
import { registrarFamilia, type AdaptadorFamilia } from "../familias";
import { validarVariacion } from "../validar";

/** Tamaño declarado S/M/L/XL de una instancia (preset del panel de config). */
export type TamanoWidget = "S" | "M" | "L" | "XL";
/** Hueco de rejilla w×h de una variación de widget (celdas RGL). */
export type HuellaWidget = { w: number; h: number };
/** Payload publicable: tipo del widget + ajustes visuales, huella y tamaño opcionales. */
export interface PayloadWidget {
  tipo: WidgetType;
  ajustes: Record<string, unknown>;
  huella?: HuellaWidget;
  tamano?: TamanoWidget;
}
/** Cambios que el adaptador puede pedir escribir sobre una instancia. */
export interface CambiosConfig {
  ajustes?: Record<string, unknown>;
  huella?: HuellaWidget;
  tamano?: TamanoWidget;
}
/** Instancia real del Dashboard que presta el puerto (sin datos privados). */
export interface InstanciaWidget {
  id: string;
  widget_type: WidgetType;
  settings?: Record<string, unknown>;
  layout?: { w?: number; h?: number; x?: number; y?: number; i?: string };
  size?: TamanoWidget;
}
/** Puerto del Dashboard: la instancia elegida del tipo y la escritura de su config. */
export interface PuertoWidgets {
  instanciaDe: (tipo: WidgetType) => InstanciaWidget | null;
  escribir: (id: string, cambios: CambiosConfig) => void;
}
const TAMAÑOS: TamanoWidget[] = ["S", "M", "L", "XL"];
// Claves de `settings` que llevan datos personales: al capturar se quitan, y un
// payload que las traiga se rechaza. El resto (modo del reloj, zonas, aspecto del
// widget de IA, etc.) es configuración visual y sí viaja.
const PERSONALES = new Set([
  "tareas", "tasks", "notas", "notes", "items", "mensajes", "messages",
  "texto", "text", "contenido", "content", "datos", "data",
]);
const CAMPOS_PAYLOAD = ["tipo", "ajustes", "huella", "tamano"] as const;
const esObjetoPlano = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const clonar = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** «clock-date» → CLOCK_DATE; deja pasar los ids que ya llegan en mayúsculas. */
export function normalizarTipo(id: string): WidgetType | null {
  const tipo = id.replace(/-/g, "_").toUpperCase() as WidgetType;
  return tipo in WIDGET_MANIFEST ? tipo : null;
}

/** adaptador */

/** Valida un payload: catálogo de widgets, sin datos personales ni secretos y
 *  con la huella dentro de los mínimos y máximos de `getSizeConstraints`. */
export function validarPayloadWidget(
  payload: unknown,
): { ok: true; payload: PayloadWidget } | { ok: false; motivos: string[] } {
  const base = validarVariacion(payload);
  const motivos: string[] = base.ok ? [] : [...base.motivos];
  if (!esObjetoPlano(payload)) return { ok: false, motivos: [...motivos, "Widgets: el payload debe ser un objeto JSON plano"] };
  const p = payload as Record<string, unknown>;
  const sobran = Object.keys(p).filter((k) => !(CAMPOS_PAYLOAD as readonly string[]).includes(k));
  if (sobran.length) motivos.push(`Widgets: «${sobran.join("», «")}» no es un campo de esta variación`);
  const tipo = typeof p.tipo === "string" ? normalizarTipo(p.tipo) : null;
  if (tipo === null) motivos.push("Widgets: el tipo no está en el catálogo de widgets del OS");
  if (!esObjetoPlano(p.ajustes)) motivos.push("Widgets: «ajustes» debe ser un objeto");
  else {
    for (const clave of Object.keys(p.ajustes)) {
      if (PERSONALES.has(clave.toLowerCase())) {
        motivos.push(`Privacidad: «ajustes.${clave}» son datos del usuario, no configuración`);
      }
    }
  }
  if (typeof p.huella !== "undefined") motivosDeHuella(p.huella, tipo, motivos);
  if (typeof p.tamano !== "undefined" && !(TAMAÑOS as readonly unknown[]).includes(p.tamano)) {
    motivos.push("Widgets: el tamaño debe ser S, M, L o XL");
  }
  if (traeAlgunCambio(p)) return motivos.length === 0 ? { ok: true, payload: payload as unknown as PayloadWidget } : { ok: false, motivos };
  motivos.push("Widgets: la variación no trae ningún cambio");
  return { ok: false, motivos };
}

/** Motivos por los que la huella se sale de los límites del widget en el manifiesto. */
function motivosDeHuella(huella: unknown, tipo: WidgetType | null, motivos: string[]): void {
  if (!esObjetoPlano(huella) || typeof huella.w !== "number" || typeof huella.h !== "number") {
    motivos.push("Widgets: «huella» debe traer w y h numéricos");
    return;
  }
  if (tipo === null) return;
  const limites = getSizeConstraints(tipo);
  if (!Number.isInteger(huella.w) || !Number.isInteger(huella.h)) motivos.push("Widgets: «huella» debe traer celdas enteras (w y h)");
  if (huella.w < limites.minW || huella.h < limites.minH) {
    motivos.push(`Widgets: la huella mínimo es ${limites.minW}×${limites.minH} (${tipo})`);
  }
  if (limites.maxW !== undefined && huella.w > limites.maxW) motivos.push(`Widgets: la huella supera el máximo de ${limites.maxW} celdas de ancho`);
  if (limites.maxH !== undefined && huella.h > limites.maxH) motivos.push(`Widgets: la huella supera el máximo de ${limites.maxH} celdas de alto`);
}

/** Un payload se considera publicable si trae ajustes, una huella o un tamaño. */
function traeAlgunCambio(p: Record<string, unknown>): boolean {
  return (esObjetoPlano(p.ajustes) && Object.keys(p.ajustes).length > 0)
    || (esObjetoPlano(p.huella) && typeof p.huella.w === "number" && typeof p.huella.h === "number")
    || typeof p.tamano !== "undefined";
}

/** Tipo del widget en una clave `widget:<tipo>[#<parte>]`; `null` si no es válida. */
function tipoDeClave(clave: string): WidgetType | null {
  const [familia, resto] = clave.split(":", 2);
  if (familia !== "widget" || !resto) return null;
  return normalizarTipo(resto.split("#", 1)[0] ?? "");
}

/** Ajustes visuales de la instancia sin las claves de datos personales. */
function ajustesPublicables(instancia: InstanciaWidget): Record<string, unknown> {
  const ajustes: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(instancia.settings ?? {})) {
    if (!PERSONALES.has(clave.toLowerCase())) ajustes[clave] = valor;
  }
  return clonar(ajustes);
}

/** Huella publicable de la instancia: solo w y h, nunca la posición personal. */
function huellaDe(instancia: InstanciaWidget): HuellaWidget | undefined {
  const { w, h } = instancia.layout ?? {};
  return typeof w === "number" && typeof h === "number" ? { w, h } : undefined;
}

/** Captura la configuración visual y de opciones del widget del tipo dado. */
function capturarWidget(puerto: PuertoWidgets, clave: string): PayloadWidget | null {
  const tipo = tipoDeClave(clave);
  if (tipo === null) return null;
  const instancia = puerto.instanciaDe(tipo);
  if (instancia === null) return null;
  const ajustes = ajustesPublicables(instancia);
  const tamano = instancia.size;
  if (Object.keys(ajustes).length === 0 && tamano === undefined) return null;
  return {
    tipo,
    ajustes,
    ...(huellaDe(instancia) !== undefined ? { huella: huellaDe(instancia) } : {}),
    ...(tamano !== undefined ? { tamano } : {}),
  };
}

/** Fusiona los ajustes publicados con los actuales de la instancia elegida y
 *  escribe el resultado; `deshacer` restaura la configuración previa. */
function aplicarWidget(puerto: PuertoWidgets, clave: string, payload: PayloadWidget): () => void {
  const revision = validarPayloadWidget(payload);
  if (!revision.ok) throw new Error(`Variación de widget rechazada: ${revision.motivos.join(" · ")}`);
  const tipo = tipoDeClave(clave);
  if (tipo === null || tipo !== revision.payload.tipo) {
    throw new Error("Widget: la clave no coincide con el tipo de la variación");
  }
  const instancia = puerto.instanciaDe(tipo);
  if (instancia === null) throw new Error("Widget: no hay ninguna instancia de este widget en el Dashboard");
  const previos: CambiosConfig = {
    ajustes: clonar(instancia.settings ?? {}),
    ...(huellaDe(instancia) !== undefined ? { huella: huellaDe(instancia) } : {}),
    ...(instancia.size !== undefined ? { tamano: instancia.size } : {}),
  };
  puerto.escribir(instancia.id, {
    ajustes: clonar({ ...(instancia.settings ?? {}), ...revision.payload.ajustes }),
    ...(revision.payload.huella !== undefined ? { huella: { ...revision.payload.huella } } : {}),
    ...(revision.payload.tamano !== undefined ? { tamano: revision.payload.tamano } : {}),
  });
  return () => puerto.escribir(instancia.id, previos);
}

export function crearAdaptadorWidgets(puerto: PuertoWidgets): AdaptadorFamilia<PayloadWidget> {
  return {
    familia: "widget",
    nombre: "Widgets del Dashboard",
    capturar: (clave) => capturarWidget(puerto, clave),
    validar: (raw) => {
      const r = validarPayloadWidget(raw);
      return r.ok ? { ok: true, payload: r.payload } : { ok: false, motivos: r.motivos };
    },
    aplicar: (clave, payload) => ({ deshacer: aplicarWidget(puerto, clave, payload) }),
  };
}

export function registrarAdaptadorWidgets(puerto: PuertoWidgets): void {
  registrarFamilia(crearAdaptadorWidgets(puerto));
}
