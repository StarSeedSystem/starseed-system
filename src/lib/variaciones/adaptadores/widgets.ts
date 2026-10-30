// Adaptador de widgets del Dashboard para variaciones públicas (contrato §5).
// Familia `widget:<WidgetType>`; captura configuración visual y opciones, sin datos personales.
// Módulo PURO: la lectura/escritura del estado del widget se inyecta.
import type { WidgetType } from "@/components/dashboard/dashboard-types";
import { getSizeConstraints } from "@/components/dashboard/widget-manifest";
import { registrarFamilia, type AdaptadorFamilia } from "../familias";
import { validarVariacion } from "../validar";

// Configuración publicable de un widget: tipo, ajustes visuales/operativos,
// tamaño de rejilla y restricciones. No incluye datos de instancia.
export type PayloadWidget = {
  tipo: WidgetType;
  ajustes: Record<string, unknown>;
  anclaje?: { w: number; h: number };
  tamano?: "S" | "M" | "L" | "XL";
};
/** Estado inyectable del anfitrión: leer y escribir la instancia del widget. */
export interface DepsWidget {
  leer: (clave: string) => PayloadWidget | null;
  escribir: (clave: string, payload: PayloadWidget) => void;
}
/** Extrae el tipo de un widget a partir de su clave `widget:<tipo>` */
export function tipoDeClave(clave: string): WidgetType | null {
  const [familia, tipo] = clave.split(":", 2);
  if (familia !== "widget" || !tipo) return null;
  // Validación ligera: el tipo debe estar en el manifiesto o ser un string no vacío.
  // La validación estricta se hace en `validarPayload`.
  return tipo as WidgetType;
}
/** Construye un `PayloadWidget` a partir de un estado interno y el tipo. */
export function construirPayload(tipo: WidgetType, ajustes: Record<string, unknown>, w?: number, h?: number, tamano?: PayloadWidget["tamano"]): PayloadWidget {
  const payload: PayloadWidget = { tipo, ajustes: { ...ajustes } };
  if (w !== undefined || h !== undefined) payload.anclaje = { w: w ?? 0, h: h ?? 0 };
  if (tamano) payload.tamano = tamano;
  return payload;
}
/** Valida el payload de un widget: tipo reconocible, ajustes JSON planos y tamaño dentro de límites. */
export function validarPayloadWidget(payload: unknown): { ok: true; payload: PayloadWidget } | { ok: false; motivos: string[] } {
  if (typeof payload !== "object" || payload === null) return { ok: false, motivos: ["El payload debe ser un objeto"] };
  const p = payload as Record<string, unknown>;
  const tipo = p.tipo as string;
  if (!tipo || typeof tipo !== "string") return { ok: false, motivos: ["Falta el tipo del widget"] };
  // Validación mínima del tipo: debe ser string no vacío.
  const ajustes = p.ajustes;
  if (!esObjetoPlano(ajustes)) return { ok: false, motivos: ["Los ajustes deben ser un objeto JSON plano"] };
  const revision = validarVariacion(ajustes);
  if (!revision.ok) return { ok: false, motivos: [`Ajustes: ${revision.motivos.join(" · ")}`] };
  if (revision.requiereAislamiento) return { ok: false, motivos: ["Los ajustes de un widget no pueden contener código"] };
  if (p.anclaje !== undefined) {
    const anclaje = p.anclaje as Record<string, unknown>;
    if (!esObjetoPlano(anclaje)) return { ok: false, motivos: ["El anclaje debe ser un objeto"] };
    const w = Number(anclaje.w); const h = Number(anclaje.h);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return { ok: false, motivos: ["El anclaje w/h debe ser positivo"] };
    const restricciones = getSizeConstraints(tipo as WidgetType);
    if (w < restricciones.minW || h < restricciones.minH) return { ok: false, motivos: [`El tamaño ${w}×${h} está por debajo del mínimo ${restricciones.minW}×${restricciones.minH}`] };
  }
  return { ok: true, payload: payload as PayloadWidget };
}
const esObjetoPlano = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
/** Crea el adaptador de widgets con dependencias inyectadas. */
export function crearAdaptadorWidgets(deps: DepsWidget): AdaptadorFamilia<PayloadWidget> {
  return {
    familia: "widget",
    nombre: "Widgets del Dashboard",
    capturar: (clave) => {
      const tipo = tipoDeClave(clave);
      if (!tipo) return null;
      return deps.leer(clave);
    },
    validar: validarPayloadWidget,
    aplicar: (clave, payload) => {
      const revision = validarPayloadWidget(payload);
      if (!revision.ok) return { deshacer: () => {} };
      const anterior = deps.leer(clave);
      deps.escribir(clave, revision.payload);
      return { deshacer: () => { if (anterior) deps.escribir(clave, anterior); } };
    },
  };
}
/** Registra el adaptador de widgets. */
export function registrarAdaptadorWidgets(deps: DepsWidget): void {
  registrarFamilia(crearAdaptadorWidgets(deps));
}
