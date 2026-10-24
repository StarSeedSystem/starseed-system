// Familia «widget» de las variaciones públicas (architecture/variaciones-publicas.md §5).
// Clave `widget:<WidgetType>`: viaja SOLO la configuración visual (talla, huella y opciones
// seguras), nunca datos personales. Módulo PURO: la instancia llega por un puerto inyectado.
import type { WidgetType } from "@/components/dashboard/dashboard-types";
import type { WidgetSize } from "@/components/dashboard/dashboard-size";
import { getManifest, getSizeConstraints } from "@/components/dashboard/widget-manifest";
import { validarVariacion } from "../validar";
import { registrarFamilia, type AdaptadorFamilia } from "../familias";

/** Opciones visuales seguras de un widget (booleanos, números y textos cortos). */
export type OpcionesWidget = Record<string, unknown>;
/** Configuración visual de la instancia elegida que el anfitrión presta al adaptador. */
export interface ConfiguracionWidget {
  w: number; // huella de rejilla en columnas
  h: number; // huella de rejilla en filas
  size?: WidgetSize; // talla amigable; puede faltar (widgets del legado)
  opciones: OpcionesWidget; // ya curadas de datos personales por el anfitrión
}
/** Variación publicable: el tipo de widget y lo que cambia de su aspecto. */
export type VariacionWidget =
  & { id: WidgetType }
  & Partial<Pick<ConfiguracionWidget, "w" | "h" | "size" | "opciones">>;
/** Puerto de la instancia elegida del Dashboard, inyectado por el anfitrión. */
export interface PuertoWidgets {
  leer(tipo: WidgetType): ConfiguracionWidget | null;
  escribir(tipo: WidgetType, cambios: Partial<ConfiguracionWidget>): void;
}
/** Resultado de validar una variación de widget. */
export type ResultadoWidget = { ok: true; payload: VariacionWidget } | { ok: false; motivos: string[] };
const CAMPOS = ["id", "w", "h", "size", "opciones"];
const TALLAS: readonly string[] = ["S", "M", "L", "XL"];
const fallo = (motivos: string[]) => ({ ok: false as const, motivos });
const entero = (valor: unknown): valor is number => typeof valor === "number" && Number.isInteger(valor);
/** Límite de anchura: la rejilla del Dashboard tiene doce columnas. */
const COLUMNA_MAXIMA = 12; // la rejilla del Dashboard tiene doce columnas
/** Id de tipo de widget de una clave `widget:<WidgetType>`; null si no está en el manifiesto. */
export function idDeWidget(clave: string): WidgetType | null {
  const [familia, id] = clave.split(":");
  if (familia !== "widget" || !id) return null;
  return getManifest(id as WidgetType) ? (id as WidgetType) : null;
}
/** ¿Es una opción visual publicable? Los objetos, arreglos y textos largos son datos. */
export function esOpcionVisual(clave: string, valor: unknown): boolean {
  if (typeof valor === "boolean") return true;
  if (typeof valor === "number") return Number.isFinite(valor);
  if (typeof valor !== "string") return false; // arreglos u objetos: riesgo de datos privados
  return valor.length > 0 && valor.length <= 60 && validarVariacion({ [clave]: valor }).ok;
}
/** Valida la variación contra el manifiesto del widget y las reglas de privacidad. */
export function validarVariacionWidget(payload: unknown): ResultadoWidget {
  const revision = validarVariacion(payload);
  if (!revision.ok) return fallo(revision.motivos);
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return fallo(["Widget: el payload debe ser un objeto de configuración"]);
  }
  const v = payload as Record<string, unknown>;
  if (Object.keys(v).some((k) => !CAMPOS.includes(k))) return fallo(["Widget: lleva campos ajenos a una variación de widget"]);
  const tipo = typeof v.id === "string" ? idDeWidget(`widget:${v.id}`) : null;
  if (!tipo) return fallo(["Widget: el id no es un tipo de widget del Dashboard"]);
  const c = getSizeConstraints(tipo); const motivos: string[] = [];
  if (v.size !== undefined && !TALLAS.includes(v.size as string)) motivos.push("Widget: la talla no es S, M, L ni XL");
  const anchoMax = Math.min(c.maxW ?? COLUMNA_MAXIMA, COLUMNA_MAXIMA);
  if (v.w !== undefined && !(entero(v.w) && v.w >= c.minW && v.w <= anchoMax)) motivos.push(`Widget: el ancho debe ir de ${c.minW} a ${anchoMax} columnas`);
  if (v.h !== undefined && !(entero(v.h) && v.h >= c.minH && (c.maxH === undefined || v.h <= c.maxH))) {
    motivos.push(`Widget: el alto debe ir de ${c.minH} a ${c.maxH === undefined ? "más" : c.maxH} filas`);
  }
  if (v.opciones !== undefined) {
    const r = typeof v.opciones === "object" && v.opciones !== null && !Array.isArray(v.opciones)
      ? validarVariacion(v.opciones)
      : { ok: false as const, requiereAislamiento: false, motivos: ["«opciones» debe ser un objeto de opciones visuales"] };
    if (!r.ok) motivos.push(`Widget: «opciones» — ${r.motivos.join(" · ")}`);
    else if (r.requiereAislamiento) motivos.push("Widget: un widget no publica código");
  }
  if (v.w === undefined && v.h === undefined && v.size === undefined && v.opciones === undefined) motivos.push("Widget: la variación no cambia nada del aspecto");
  return motivos.length === 0 ? { ok: true, payload: v as unknown as VariacionWidget } : fallo(motivos);
}
/** Captura la configuración visual de la instancia, ajustada a los límites de su manifiesto. */
export function capturarConfiguracionWidget(tipo: WidgetType, config: ConfiguracionWidget): VariacionWidget {
  const c = getSizeConstraints(tipo);
  const limitar = (valor: number, min: number, max?: number) => Math.min(Math.max(Math.round(valor), min), max ?? Math.round(valor));
  const opciones: OpcionesWidget = {};
  for (const [clave, valor] of Object.entries(config.opciones)) if (esOpcionVisual(clave, valor)) opciones[clave] = valor;
  return { id: tipo, w: limitar(config.w, c.minW, c.maxW), h: limitar(config.h, c.minH, c.maxH), ...(config.size ? { size: config.size } : {}), opciones };
}

/** Crea el adaptador de la familia widget con la instancia elegida inyectada. */
export function crearAdaptadorWidgets(puerto: PuertoWidgets): AdaptadorFamilia<VariacionWidget> {
  return {
    familia: "widget",
    nombre: "Widgets del Dashboard",
    capturar: (clave) => {
      const tipo = idDeWidget(clave);
      const config = tipo ? puerto.leer(tipo) : null;
      if (!tipo || !config) return null;
      return capturarConfiguracionWidget(tipo, config);
    },
    validar: (payload) => {
      const r = validarVariacionWidget(payload);
      return r.ok ? { ok: true, payload: r.payload } : { ok: false, motivos: r.motivos };
    },
    aplicar: (clave, payload) => {
      const r = validarVariacionWidget(payload);
      if (!r.ok) throw new Error(`Variación de widget rechazada: ${r.motivos.join(" · ")}`);
      const tipo = idDeWidget(clave);
      if (!tipo || tipo !== r.payload.id) throw new Error("Widget: la clave no coincide con la variación");
      const actual = puerto.leer(tipo);
      if (!actual) throw new Error("Widget: no hay instancia de ese tipo en este Dashboard");
      const previo: ConfiguracionWidget = { w: actual.w, h: actual.h, ...(actual.size ? { size: actual.size } : {}), opciones: { ...actual.opciones } };
      puerto.escribir(tipo, {
        w: r.payload.w ?? actual.w, h: r.payload.h ?? actual.h, size: r.payload.size ?? actual.size,
        opciones: { ...actual.opciones, ...(r.payload.opciones ?? {}) },
      });
      return { deshacer: () => puerto.escribir(tipo, previo) };
    },
  };
}

/** Registra la familia widget en el registro compartido del clic derecho. */
export function registrarAdaptadorWidgets(puerto: PuertoWidgets): void {
  registrarFamilia(crearAdaptadorWidgets(puerto));
}
