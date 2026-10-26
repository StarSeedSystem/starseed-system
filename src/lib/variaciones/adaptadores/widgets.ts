// Adaptador de widgets: variaciones de configuración visual y opciones (contrato §5).
// Módulo PURO: lector/escritor inyectados; sin Supabase, disco, reloj ni DOM.
import type { WidgetType, DashboardWidget } from "@/components/dashboard/dashboard-types";
import { getSizeConstraints, getManifest, WIDGET_MANIFEST } from "@/components/dashboard/widget-manifest";
import { leerClave } from "../clave-elemento";
import { registrarFamilia, type AdaptadorFamilia } from "../familias";
import { validarVariacion, CLAVES_DE_CODIGO } from "../validar";

/** Payload de variación de widget: config visual y opciones (sin datos personales). */
export interface PayloadWidget {
  widgetType: WidgetType;
  settings: Record<string, unknown>;
  size?: "S" | "M" | "L" | "XL";
}

/** Estado inyectado que el anfitrión presta; el adaptador nunca lo guarda. */
export interface DepsWidget {
  leer: (widgetType: WidgetType) => DashboardWidget | null;
  escribir: (widgetType: WidgetType, parche: Partial<Pick<DashboardWidget, "settings" | "size">>) => DashboardWidget | null;
}

/** IDs publicables de la familia widget (manifiesto canónico). */
export function idsWidget(): WidgetType[] {
  return Object.keys(WIDGET_MANIFEST) as WidgetType[];
}

/** Construye el payload capturable de un widget activo. */
export function capturarPayloadWidget(widget: DashboardWidget): PayloadWidget {
  const manifest = getManifest(widget.widget_type);
  return { widgetType: widget.widget_type, settings: widget.settings ?? {}, size: widget.size ?? (manifest ? "M" : undefined) };
}

/** Detecta claves de código dentro de settings (anidado). */
function settingsTieneCodigo(settings: unknown): boolean {
  if (typeof settings !== "object" || settings === null || Array.isArray(settings)) return false;
  const obj = settings as Record<string, unknown>;
  for (const clave of Object.keys(obj)) {
    if (CLAVES_DE_CODIGO.has(clave.toLowerCase())) return true;
    if (typeof obj[clave] === "object" && obj[clave] !== null && !Array.isArray(obj[clave]) && settingsTieneCodigo(obj[clave])) return true;
  }
  return false;
}

/** Valida widgetType en manifiesto y size dentro de restricciones. */
export function validarPayloadWidget(payload: unknown): { ok: true; payload: PayloadWidget } | { ok: false; motivos: string[] } {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return { ok: false, motivos: ["Widget: el payload debe ser un objeto"] };
  const p = payload as Record<string, unknown>;
  if (typeof p.widgetType !== "string") return { ok: false, motivos: ["Widget: falta widgetType"] };
  if (!getManifest(p.widgetType as WidgetType)) return { ok: false, motivos: [`Widget: «${p.widgetType}» no está en el manifiesto del OS`] };
  if (p.settings !== undefined && (typeof p.settings !== "object" || p.settings === null || Array.isArray(p.settings))) return { ok: false, motivos: ["Widget: settings debe ser un objeto plano"] };
  const size = p.size;
  if (size !== undefined && !["S", "M", "L", "XL"].includes(size as string)) return { ok: false, motivos: ["Widget: size debe ser S, M, L o XL"] };
  if (size !== undefined) {
    const c = getSizeConstraints(p.widgetType as WidgetType);
    const dims = { S: { w: 3, h: 3 }, M: { w: 4, h: 4 }, L: { w: 6, h: 5 }, XL: { w: 12, h: 6 } }[size as "S" | "M" | "L" | "XL"];
    if (dims.w < c.minW || dims.h < c.minH || (c.maxW && dims.w > c.maxW) || (c.maxH && dims.h > c.maxH)) return { ok: false, motivos: [`Widget: la talla «${size}» no respeta los límites del manifiesto (minW:${c.minW}, minH:${c.minH})`] };
  }
  const revision = validarVariacion(payload);
  if (revision.ok === false) return { ok: false, motivos: revision.motivos };
  if (p.settings && settingsTieneCodigo(p.settings)) return { ok: false, motivos: ["Widget: settings parece llevar código; un widget no es código"] };
  return { ok: true, payload: { widgetType: p.widgetType as WidgetType, settings: (p.settings ?? {}) as Record<string, unknown>, size: p.size as "S" | "M" | "L" | "XL" | undefined } };
}

/** Resuelve `widget:<WidgetType>`: devuelve el WidgetType si está en el manifiesto, nulo si no. */
export function widgetTypeDeClave(clave: string): WidgetType | null {
  const [familia, id] = clave.split(":");
  if (familia !== "widget" || !id) return null;
  return getManifest(id as WidgetType) ? (id as WidgetType) : null;
}

/** Crea el adaptador de la familia widget con lector/escritor inyectados. */
export function crearAdaptadorWidget(deps: DepsWidget): AdaptadorFamilia<PayloadWidget> {
  return {
    familia: "widget",
    nombre: "Widgets del Dashboard",
    capturar: (clave) => { const wt = widgetTypeDeClave(clave); if (!wt) return null; const w = deps.leer(wt); return w ? capturarPayloadWidget(w) : null; },
    validar: (raw) => validarPayloadWidget(raw),
    aplicar: (clave, payload) => {
      const validado = validarPayloadWidget(payload);
      if (validado.ok === false) throw new Error(`Variación de widget rechazada: ${validado.motivos.join(" · ")}`);
      const wt = widgetTypeDeClave(clave);
      if (!wt) throw new Error(`Variación de widget: clave «${clave}» no válida`);
      const anterior = deps.leer(wt);
      if (!anterior) throw new Error(`Variación de widget: no hay instancia para «${wt}»`);
      deps.escribir(wt, { settings: validado.payload.settings, size: validado.payload.size });
      return { deshacer: () => anterior && deps.escribir(wt, { settings: anterior.settings, size: anterior.size }) };
    },
  };
}

/** Registra el adaptador `widget:` en el registro compartido de familias. */
export function registrarAdaptadorWidget(deps: DepsWidget): void { registrarFamilia(crearAdaptadorWidget(deps)); }