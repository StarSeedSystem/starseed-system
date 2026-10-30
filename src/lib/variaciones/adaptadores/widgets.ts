// Adaptador de widgets del Dashboard para variaciones públicas (contrato §5).
// Familia `widget:<WidgetType>`; captura solo configuración visual y de opciones,
// nunca datos personales. Módulo PURO: leer y escribir la instancia se inyectan.
import type { WidgetType } from "@/components/dashboard/dashboard-types";
import { getSizeConstraints, WIDGET_MANIFEST } from "@/components/dashboard/widget-manifest";
import { registrarFamilia, type AdaptadorFamilia } from "../familias";
import { validarVariacion } from "../validar";
/** Claves de `settings` que son configuración visual u opción publicable. */
export const CLAVES_PUBLICABLES: ReadonlySet<string> = new Set([
  "styleVariant", "trinityNode", "clockMode", "selectedLayout", "widgetConfig",
  "opacity", "blur", "borderRadius", "glowIntensity", "scale",
  "rotateX", "rotateY", "animationStiffness", "animationDamping",
]);
const NUMERICAS = ["opacity", "blur", "borderRadius", "glowIntensity", "scale", "rotateX", "rotateY", "animationStiffness", "animationDamping"];
const VARIANTES = new Set(["cristal", "solido", "transparente", "trinity"]);
const NODOS = new Set(["zenith", "horizon", "logic", "anchor"]);
const MODOS = new Set(["digital", "analog"]);
const TAMANOS = new Set(["S", "M", "L", "XL"]);
export type PayloadWidget = { tipo: WidgetType; ajustes: Record<string, unknown>; anclaje?: { w: number; h: number }; tamano?: "S" | "M" | "L" | "XL" };
export interface DepsWidget { leer: (clave: string) => PayloadWidget | null; escribir: (clave: string, payload: PayloadWidget) => void; }
const esObjetoPlano = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const esTipo = (t: string): t is WidgetType => Object.prototype.hasOwnProperty.call(WIDGET_MANIFEST, t);
const esNumero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
/** Extrae el tipo real de un widget a partir de su clave `widget:<tipo>`. */
export function tipoDeClave(clave: string): WidgetType | null {
  const [familia, tipo] = clave.split(":", 2);
  return familia === "widget" && tipo && esTipo(tipo) ? tipo : null;
}
/** Copia solo los ajustes publicables; descarta zonas horarias, contenido y datos personales. */
export function ajustesPublicables(ajustes: unknown): Record<string, unknown> {
  if (!esObjetoPlano(ajustes)) return {};
  const limpio: Record<string, unknown> = {};
  for (const clave of Object.keys(ajustes)) {
    if (!CLAVES_PUBLICABLES.has(clave)) continue;
    const valor = ajustes[clave];
    if (clave !== "widgetConfig") { limpio[clave] = valor; continue; }
    if (esObjetoPlano(valor) && Object.values(valor).every(esNumero)) limpio[clave] = { ...valor };
  }
  return limpio;
}
function revisarAjustes(a: Record<string, unknown>): string[] {
  const motivos: string[] = [];
  for (const clave of Object.keys(a)) if (!CLAVES_PUBLICABLES.has(clave)) motivos.push(`Ajustes: «${clave}» no es configuración publicable`);
  if ("styleVariant" in a && !VARIANTES.has(String(a.styleVariant))) motivos.push("Ajustes: «styleVariant» no es una variante del OS");
  if ("trinityNode" in a && !NODOS.has(String(a.trinityNode))) motivos.push("Ajustes: «trinityNode» no es un nodo Trinity");
  if ("clockMode" in a && !MODOS.has(String(a.clockMode))) motivos.push("Ajustes: «clockMode» debe ser digital o analog");
  if ("selectedLayout" in a && !(typeof a.selectedLayout === "string" && a.selectedLayout.length > 0 && a.selectedLayout.length <= 60)) motivos.push("Ajustes: «selectedLayout» debe ser texto breve");
  for (const clave of NUMERICAS) if (clave in a && !esNumero(a[clave])) motivos.push(`Ajustes: «${clave}» debe ser un número`);
  if ("widgetConfig" in a && !(esObjetoPlano(a.widgetConfig) && Object.values(a.widgetConfig).every(esNumero))) motivos.push("Ajustes: «widgetConfig» solo admite números visuales");
  return motivos;
}
/** Valida un payload de widget y devuelve una copia limpia, sin datos ajenos. */
export function validarPayloadWidget(payload: unknown): { ok: true; payload: PayloadWidget } | { ok: false; motivos: string[] } {
  if (!esObjetoPlano(payload)) return { ok: false, motivos: ["El payload debe ser un objeto"] };
  const sobran = Object.keys(payload).filter((k) => !["tipo", "ajustes", "anclaje", "tamano"].includes(k));
  if (sobran.length) return { ok: false, motivos: [`El payload lleva datos ajenos: ${sobran.join(", ")}`] };
  const tipo = payload.tipo;
  if (typeof tipo !== "string" || !esTipo(tipo)) return { ok: false, motivos: ["El tipo del widget no existe"] };
  if (!esObjetoPlano(payload.ajustes)) return { ok: false, motivos: ["Los ajustes deben ser un objeto JSON plano"] };
  const revision = validarVariacion(payload.ajustes);
  if (!revision.ok) return { ok: false, motivos: [`Ajustes: ${revision.motivos.join(" · ")}`] };
  if (revision.requiereAislamiento) return { ok: false, motivos: ["Los ajustes de un widget no pueden contener código"] };
  const motivos = revisarAjustes(payload.ajustes);
  const limpio: PayloadWidget = { tipo, ajustes: ajustesPublicables(payload.ajustes) };
  if ("anclaje" in payload) {
    const a = payload.anclaje;
    if (!esObjetoPlano(a) || !esNumero(a.w) || !esNumero(a.h) || a.w <= 0 || a.h <= 0) motivos.push("El anclaje w/h debe ser positivo");
    else {
      const c = getSizeConstraints(tipo);
      const bajo = a.w < c.minW || a.h < c.minH;
      const alto = (c.maxW !== undefined && a.w > c.maxW) || (c.maxH !== undefined && a.h > c.maxH);
      if (bajo) motivos.push(`El tamaño ${a.w}×${a.h} está por debajo del mínimo ${c.minW}×${c.minH}`);
      if (alto) motivos.push(`El tamaño ${a.w}×${a.h} supera el máximo ${c.maxW ?? "∞"}×${c.maxH ?? "∞"}`);
      if (!bajo && !alto) limpio.anclaje = { w: a.w, h: a.h };
    }
  }
  if ("tamano" in payload) {
    const t = payload.tamano;
    if (typeof t !== "string" || !TAMANOS.has(t)) motivos.push("El tamaño debe ser S, M, L o XL");
    else limpio.tamano = t as PayloadWidget["tamano"];
  }
  return motivos.length ? { ok: false, motivos } : { ok: true, payload: limpio };
}
/** Crea el adaptador de widgets con las dependencias del anfitrión inyectadas. */
export function crearAdaptadorWidgets(deps: DepsWidget): AdaptadorFamilia<PayloadWidget> {
  return {
    familia: "widget",
    nombre: "Widgets del Dashboard",
    capturar: (clave) => {
      const tipo = tipoDeClave(clave);
      const actual = tipo ? deps.leer(clave) : null;
      if (!tipo || !actual) return null;
      const bruto: PayloadWidget = { tipo, ajustes: ajustesPublicables(actual.ajustes) };
      if (actual.tamano && TAMANOS.has(actual.tamano)) bruto.tamano = actual.tamano;
      const conAnclaje = actual.anclaje ? validarPayloadWidget({ ...bruto, anclaje: actual.anclaje }) : null;
      const revision = conAnclaje?.ok ? conAnclaje : validarPayloadWidget(bruto);
      return revision.ok ? revision.payload : null;
    },
    validar: validarPayloadWidget,
    aplicar: (clave, payload) => {
      const revision = validarPayloadWidget(payload);
      if (!revision.ok) throw new Error(`Variación de widget rechazada: ${revision.motivos.join(" · ")}`);
      const tipo = tipoDeClave(clave);
      if (!tipo || tipo !== revision.payload.tipo) throw new Error("Widget: la clave no coincide con la variación");
      const anterior = deps.leer(clave);
      if (!anterior) throw new Error("Widget: la instancia no existe en este tablero");
      const fusionado: PayloadWidget = { tipo, ajustes: { ...anterior.ajustes, ...revision.payload.ajustes } };
      const anclaje = revision.payload.anclaje ?? anterior.anclaje;
      const tamano = revision.payload.tamano ?? anterior.tamano;
      if (anclaje) fusionado.anclaje = anclaje;
      if (tamano) fusionado.tamano = tamano;
      deps.escribir(clave, fusionado);
      return { deshacer: () => deps.escribir(clave, anterior) };
    },
  };
}
/** Registra el adaptador de widgets en el registro de familias. */
export function registrarAdaptadorWidgets(deps: DepsWidget): void {
  registrarFamilia(crearAdaptadorWidgets(deps));
}