// Adaptador de widgets y Dashboard para «Variaciones públicas» (contrato §5).
// Familia widget:<WidgetType>: viaja SOLO la configuración visual y de opciones
// (settings, tamaño declarado, huella), nunca los datos personales del widget.
// Módulo PURO: leer y escribir la instancia se inyectan; nada de Supabase, disco
// reloj ni DOM.
import type { WidgetType } from "@/components/dashboard/dashboard-types";
import { WIDGET_MANIFEST, getSizeConstraints } from "@/components/dashboard/widget-manifest";
import { registrarFamilia, type AdaptadorFamilia } from "../familias";
import { validarVariacion } from "../validar";
/** Tamaños declarados del Dashboard (dashboard-size.ts). */
export type TamanoWidget = "S" | "M" | "L" | "XL";
/** Configuración capturable de una instancia: opción visual, no datos. */
export interface ConfigWidget {
  settings: Record<string, unknown>;
  size?: TamanoWidget;
  /** Huella propuesta en celdas de rejilla; debe respetar el manifiesto. */
  w?: number;
  h?: number;
}
/** Lo que se publica y aplica: tipo de widget más su configuración capturable. */
export interface PayloadWidget extends ConfigWidget { widgetType: string }
export type ResultadoPayload = { ok: true; payload: PayloadWidget } | { ok: false; motivos: string[] };
/** El anfitrión presta la instancia elegida: leer su configuración y escribirla. */
export interface DepsWidgets {
  leer: (tipo: WidgetType) => ConfigWidget | null;
  escribir: (tipo: WidgetType, config: ConfigWidget) => void;
}
/** Propiedades que llevan datos personales del widget (su contenido), no opciones. */
const CLAVES_DE_DATOS = new Set([
  "contenido", "datos", "datosPrivados", "tareas", "notas", "notasActivas",
  "texto", "memorias", "memoriasActivas", "historial", "blob", "archivo",
]);
const TAMAÑOS: TamanoWidget[] = ["S", "M", "L", "XL"];
/** Divide un settings: opciones publicables y motivos por las claves de datos. */
export function separarDatosPersonales(settings: Record<string, unknown>): { opciones: Record<string, unknown>; motivos: string[] } {
  const opciones: Record<string, unknown> = {};
  const motivos: string[] = [];
  for (const [clave, valor] of Object.entries(settings)) {
    if (CLAVES_DE_DATOS.has(clave)) {
      motivos.push(`Privacidad: «${clave}» es contenido del widget, no configuración; no se publica`);
      continue;
    }
    opciones[clave] = valor;
  }
  return { opciones, motivos };
}
/** Motivos si la huella propuesta se sale de los límites de `getSizeConstraints`. */
export function motivosDeHuella(tipo: WidgetType, w?: number, h?: number): string[] {
  if (w === undefined && h === undefined) return [];
  const { minW, minH, maxW, maxH } = getSizeConstraints(tipo);
  const motivos: string[] = [];
  if (w !== undefined && w < minW) motivos.push(`Manifest: w=${w} es menor que el mínimo ${minW} del widget`);
  if (h !== undefined && h < minH) motivos.push(`Manifest: h=${h} es menor que el mínimo ${minH} del widget`);
  if (maxW !== undefined && w !== undefined && w > maxW) motivos.push(`Manifest: w=${w} supera el máximo ${maxW}`);
  if (maxH !== undefined && h !== undefined && h > maxH) motivos.push(`Manifest: h=${h} supera el máximo ${maxH}`);
  return motivos;
}
/** Extrae el tipo de la clave `widget:<Tipo>`; `null` si no. */
export function tipoDeClave(clave: string): WidgetType | null {
  const legible = /^widget:([A-Z0-9_]+)$/.exec(clave);
  const tipo = legible?.[1];
  return tipo && tipo in WIDGET_MANIFEST ? (tipo as WidgetType) : null;
}
/** Valida un payload: tipo del manifiesto, opciones sin datos ni secretos, tamaño y huella. */
export function validarPayloadWidget(payload: unknown): ResultadoPayload {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { ok: false, motivos: ["El payload debe ser un objeto JSON plano"] };
  }
  const p = payload as Record<string, unknown>;
  const motivos: string[] = [];
  const tipo = typeof p.widgetType === "string" && p.widgetType in WIDGET_MANIFEST ? (p.widgetType as WidgetType) : null;
  if (!tipo) motivos.push("Manifest: el tipo de widget no está en el manifiesto del Dashboard");
  if (typeof p.settings !== "object" || p.settings === null || Array.isArray(p.settings)) {
    return { ok: false, motivos: [...motivos, "Manifest: «settings» debe ser un objeto de opciones"] };
  }
  const { opciones, motivos: deDatos } = separarDatosPersonales(p.settings as Record<string, unknown>);
  const revision = validarVariacion({ widgetType: p.widgetType, settings: opciones });
  if (!revision.ok) motivos.push(...revision.motivos);
  motivos.push(...deDatos);
  if (p.size !== undefined && !TAMAÑOS.includes(p.size as TamanoWidget)) {
    motivos.push(`Manifest: «size» debe ser S, M, L o XL (llegó ${JSON.stringify(p.size)})`);
  }
  if (tipo) motivos.push(...motivosDeHuella(tipo, typeof p.w === "number" ? p.w : undefined, typeof p.h === "number" ? p.h : undefined));
  if (motivos.length > 0) return { ok: false, motivos };
  return {
    ok: true,
    payload: {
      widgetType: tipo as string, settings: opciones,
      size: p.size as TamanoWidget | undefined,
      w: typeof p.w === "number" ? p.w : undefined,
      h: typeof p.h === "number" ? p.h : undefined,
    },
  };
}
/** Captura la configuración publicable de la instancia activa de ese tipo. */
export function capturarWidget(deps: DepsWidgets, tipo: WidgetType): PayloadWidget | null {
  const config = deps.leer(tipo);
  if (!config) return null;
  const { opciones } = separarDatosPersonales(config.settings);
  return { widgetType: tipo, settings: opciones, size: config.size, w: config.w, h: config.h };
}
/** Aplica una variación a la instancia activa: fusiona opciones y devuelve deshacer. */
export function aplicarWidget(deps: DepsWidgets, tipo: WidgetType, payload: PayloadWidget): { deshacer: () => void } {
  const sinEfecto = { deshacer: () => undefined };
  if (!validarPayloadWidget(payload).ok || tipoDeClave(`widget:${tipo}`) !== tipo) return sinEfecto;
  const anterior = deps.leer(tipo);
  deps.escribir(tipo, {
    settings: { ...anterior?.settings, ...payload.settings },
    size: payload.size ?? anterior?.size,
    w: payload.w ?? anterior?.w,
    h: payload.h ?? anterior?.h,
  });
  return { deshacer: () => { if (anterior) deps.escribir(tipo, anterior); } };
}
/** Crea el adaptador de la familia `widget:` con la instancia inyectada. */
export function crearAdaptadorWidget(deps: DepsWidgets): AdaptadorFamilia<PayloadWidget> {
  return {
    familia: "widget",
    nombre: "Widgets del Dashboard",
    capturar: (clave) => {
      const tipo = tipoDeClave(clave);
      return tipo ? capturarWidget(deps, tipo) : null;
    },
    validar: (raw) => validarPayloadWidget(raw),
    aplicar: (clave, payload) => {
      const tipo = tipoDeClave(clave);
      return tipo ? aplicarWidget(deps, tipo, payload) : { deshacer: () => undefined };
    },
  };
}
/** Registra la familia `widget:` en el registro compartido de variaciones. */
export function registrarAdaptadorWidgets(deps: DepsWidgets): void {
  registrarFamilia(crearAdaptadorWidget(deps));
}
