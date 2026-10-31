// Adaptador de widgets del Dashboard para variaciones públicas (contrato §5).
// Familia `widget:<WidgetType>`: viaja la configuración visual y de opciones,
// nunca los datos personales. Módulo PURO: leer/escribir la instancia se inyectan.
import type { WidgetType } from "@/components/dashboard/dashboard-types";
import { WIDGET_MANIFEST, getSizeConstraints } from "@/components/dashboard/widget-manifest";
import { registrarFamilia, type AdaptadorFamilia } from "../familias";
import { validarVariacion } from "../validar";
export type TamanoWidget = "S" | "M" | "L" | "XL";
export type PayloadWidget = {
  tipo: WidgetType; ajustes: Record<string, unknown>;
  anclaje?: { w: number; h: number }; tamano?: TamanoWidget;
};
export interface DepsWidget {
  leer: (clave: string) => PayloadWidget | null;
  escribir: (clave: string, payload: PayloadWidget) => void;
}
// Datos personales que nunca salen en una variación (tareas, notas, mensajes…).
const CLAVES_PRIVADAS = new Set([
  "contenido", "contenidoPrivado", "datosPrivados", "blob", "archivo",
  "archivos", "bytes", "buffer", "notas", "tareas", "mensajes", "historial",
]);
const esObjetoPlano = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const esTipoWidget = (tipo: string): tipo is WidgetType => Object.prototype.hasOwnProperty.call(WIDGET_MANIFEST, tipo);
const limpiarValor = (valor: unknown): unknown =>
  Array.isArray(valor) ? valor.map(limpiarValor) : esObjetoPlano(valor) ? limpiarAjustes(valor) : valor;
export function limpiarAjustes(ajustes: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(ajustes)
    .filter(([clave]) => !CLAVES_PRIVADAS.has(clave))
    .map(([clave, valor]): [string, unknown] => [clave, limpiarValor(valor)]));
}
export function tipoDeClave(clave: string): WidgetType | null {
  const [familia, resto] = clave.split(":", 2);
  if (familia !== "widget" || !resto) return null;
  const tipo = resto.split("#", 1)[0];
  return esTipoWidget(tipo) ? tipo : null;
}
export function construirPayload(
  tipo: WidgetType, ajustes: Record<string, unknown>,
  anclaje?: { w: number; h: number }, tamano?: TamanoWidget,
): PayloadWidget {
  const payload: PayloadWidget = { tipo, ajustes: limpiarAjustes(ajustes) };
  if (anclaje) payload.anclaje = { w: anclaje.w, h: anclaje.h };
  if (tamano) payload.tamano = tamano;
  return payload;
}
function validarAnclaje(tipo: WidgetType, valor: unknown, motivos: string[]): { w: number; h: number } | null {
  if (valor === undefined) return null;
  if (!esObjetoPlano(valor)) { motivos.push("El anclaje debe ser un objeto con w y h"); return null; }
  const w = Number(valor.w), h = Number(valor.h);
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) {
    motivos.push("El anclaje w/h debe ser entero y positivo");
    return null;
  }
  const { minW, minH, maxW, maxH } = getSizeConstraints(tipo);
  if (w < minW || h < minH) motivos.push(`El tamaño ${w}×${h} está por debajo del mínimo ${minW}×${minH}`);
  if (maxW !== undefined && w > maxW) motivos.push(`El ancho ${w} supera el máximo ${maxW}`);
  if (maxH !== undefined && h > maxH) motivos.push(`El alto ${h} supera el máximo ${maxH}`);
  return { w, h };
}
export function validarPayloadWidget(payload: unknown): { ok: true; payload: PayloadWidget } | { ok: false; motivos: string[] } {
  if (!esObjetoPlano(payload)) return { ok: false, motivos: ["El payload debe ser un objeto JSON plano"] };
  const { tipo, ajustes, anclaje, tamano } = payload;
  if (typeof tipo !== "string" || !esTipoWidget(tipo)) {
    return { ok: false, motivos: ["El tipo del widget no está en el manifiesto del Dashboard"] };
  }
  if (!esObjetoPlano(ajustes)) return { ok: false, motivos: ["Los ajustes deben ser un objeto JSON plano"] };
  const motivos: string[] = [];
  if (JSON.stringify(limpiarAjustes(ajustes)) !== JSON.stringify(ajustes)) {
    motivos.push("Privacidad: los ajustes llevan datos personales del widget");
  }
  const revision = validarVariacion(ajustes);
  if (!revision.ok) motivos.push(...revision.motivos);
  if (revision.requiereAislamiento) motivos.push("Los ajustes de un widget no pueden contener código");
  if (tamano !== undefined && !["S", "M", "L", "XL"].includes(tamano as string)) {
    motivos.push("El tamaño debe ser S, M, L o XL");
  }
  const huella = validarAnclaje(tipo, anclaje, motivos);
  if (motivos.length > 0) return { ok: false, motivos };
  const limpio: PayloadWidget = { tipo, ajustes };
  if (huella) limpio.anclaje = huella;
  if (tamano !== undefined) limpio.tamano = tamano as TamanoWidget;
  return { ok: true, payload: limpio };
}
export function crearAdaptadorWidgets(deps: DepsWidget): AdaptadorFamilia<PayloadWidget> {
  const sinEfecto = { deshacer: () => undefined };
  return {
    familia: "widget",
    nombre: "Widgets del Dashboard",
    capturar: (clave) => {
      const tipo = tipoDeClave(clave);
      const actual = tipo ? deps.leer(clave) : null;
      if (!tipo || !actual || actual.tipo !== tipo) return null;
      const revision = validarPayloadWidget({ ...actual, ajustes: limpiarAjustes(actual.ajustes) });
      return revision.ok ? revision.payload : null;
    },
    validar: validarPayloadWidget,
    aplicar: (clave, payload) => {
      const revision = validarPayloadWidget(payload);
      if (!revision.ok || tipoDeClave(clave) !== revision.payload.tipo) return sinEfecto;
      const anterior = deps.leer(clave);
      // Se fusiona con la instancia: conserva sus ajustes y tamaño propios.
      const fusionado: PayloadWidget = {
        tipo: revision.payload.tipo,
        ajustes: { ...(anterior?.ajustes ?? {}), ...revision.payload.ajustes },
        anclaje: revision.payload.anclaje ?? anterior?.anclaje,
        tamano: revision.payload.tamano ?? anterior?.tamano,
      };
      deps.escribir(clave, fusionado);
      return { deshacer: () => { if (anterior) deps.escribir(clave, anterior); } };
    },
  };
}
export function registrarAdaptadorWidgets(deps: DepsWidget): void {
  registrarFamilia(crearAdaptadorWidgets(deps));
}
