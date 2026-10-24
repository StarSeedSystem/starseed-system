// Familia «widget» de las variaciones públicas (contrato: architecture/variaciones-publicas.md §5).
// Clave `widget:<WidgetType>` (dashboard-types.ts). El payload lleva la configuración visual y de
// opciones del TIPO de widget (settings, tamaño S/M/L/XL y huella w/h); nunca sus datos personales,
// la instancia ni la posición en la rejilla. Módulo PURO: leer y escribir van inyectados y respeta
// los límites de `getSizeConstraints` (widget-manifest.ts). Nada se ejecuta sin validar.
import type { WidgetType } from "@/components/dashboard/dashboard-types";
import { getManifest, getSizeConstraints } from "@/components/dashboard/widget-manifest";
import { validarVariacion } from "../validar";
import { registrarFamilia, type AdaptadorFamilia } from "../familias";

/** Configuración visual y de opciones de un tipo de widget (lo compartible): las opciones
 *  de configuración (no datos personales), el preset `size` S/M/L/XL y la huella `w`/`h`, que
 *  `aplicar` acota a los límites del manifiesto. */
export interface ConfigWidget {
  settings: Record<string, unknown>;
  size?: "S" | "M" | "L" | "XL";
  w?: number;
  h?: number;
}

/** Estado que el Dashboard presta al adaptador; el adaptador nunca lo guarda. */
export interface DepsWidgets {
  /** Configuración actual de la instancia del tipo en el tablero; `null` si no hay. */
  leer: (tipo: WidgetType) => ConfigWidget | null;
  /** Fusiona la configuración en la instancia elegida del tipo. */
  escribir: (tipo: WidgetType, config: ConfigWidget) => void;
}

/** Resuelve la clave `widget:<tipo>`: devuelve el tipo si el manifiesto lo declara, nulo si no. */
export function idDeWidget(clave: string): WidgetType | null {
  const partes = clave.split(":");
  if (partes.length !== 2 || partes[0] !== "widget") return null;
  const tipo = partes[1] as WidgetType;
  return getManifest(tipo) ? tipo : null;
}

/** Resultado de validar la configuración de un widget. */
export type ResultadoWidget = { ok: true; config: ConfigWidget } | { ok: false; motivos: string[] };

const CLAVES_PERMITIDAS = new Set(["settings", "size", "w", "h"]);
const TAMAÑOS = new Set(["S", "M", "L", "XL"]);

/** Valida el payload: objeto con `settings` JSON plano sin privacidad, claves de la superficie
 *  {settings,size,w,h}, tamaño S/M/L/XL y huella numérica. Los límites por tipo los fija
 *  `aplicar` con `getSizeConstraints`, nunca los lleva el payload. */
export function validarConfigWidget(payload: unknown): ResultadoWidget {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { ok: false, motivos: ["Widget: el payload debe ser la configuración del widget"] };
  }
  const config = payload as Record<string, unknown>;
  const motivos: string[] = [];
  for (const clave of Object.keys(config)) {
    if (!CLAVES_PERMITIDAS.has(clave)) motivos.push(`Widget: «${clave}» no es parte de la configuración compartible`);
  }
  if (!("settings" in config)) {
    motivos.push("Widget: falta «settings», las opciones del widget");
  } else if (typeof config.settings !== "object" || config.settings === null || Array.isArray(config.settings)) {
    motivos.push("Widget: «settings» debe ser el objeto de opciones del widget");
  }
  const revision = validarVariacion(payload);
  if (!revision.ok) motivos.push(...revision.motivos.map((m) => `Widget: ${m}`));
  else if (revision.requiereAislamiento) motivos.push("Widget: la configuración parece llevar código; un widget no es código");
  if (config.size !== undefined && !TAMAÑOS.has(String(config.size))) {
    motivos.push(`Widget: «size» debe ser S, M, L o XL; llegó ${String(config.size)}`);
  }
  for (const eje of ["w", "h"] as const) {
    if (config[eje] === undefined) continue;
    const valor = config[eje];
    if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 1) motivos.push(`Widget: «${eje}» debe ser un número de celdas ≥ 1`);
  }
  return motivos.length === 0 ? { ok: true, config: payload as ConfigWidget } : { ok: false, motivos };
}

/** Acota una huella a los límites del manifiesto; `undefined` se queda sin definir. */
function limitar(valor: number | undefined, minimo: number, maximo?: number): number | undefined {
  if (valor === undefined) return undefined;
  return Math.min(Math.max(valor, minimo), maximo ?? Number.MAX_SAFE_INTEGER);
}

/** Copia plana de la configuración para capturar (sin referencias a la instancia). */
function copia(config: ConfigWidget): ConfigWidget {
  return { settings: { ...config.settings }, size: config.size, w: config.w, h: config.h };
}

/** Crea el adaptador de la familia widget, con el lector y el escritor inyectados. */
export function crearAdaptadorWidgets(deps: DepsWidgets): AdaptadorFamilia<ConfigWidget> {
  return {
    familia: "widget",
    nombre: "Widgets del Dashboard",
    capturar: (clave) => {
      const tipo = idDeWidget(clave);
      const actual = tipo ? deps.leer(tipo) : null;
      return actual ? copia(actual) : null;
    },
    validar: (payload) => {
      const revision = validarConfigWidget(payload);
      return revision.ok ? { ok: true, payload: revision.config } : { ok: false, motivos: revision.motivos };
    },    aplicar: (clave, payload) => {
      const tipo = idDeWidget(clave);
      const validado = validarConfigWidget(payload);
      if (!tipo || !validado.ok) throw new Error(`Variación de widget rechazada: ${validado.ok ? `«${clave}» no es un widget del manifiesto` : validado.motivos.join(" · ")}`);
      const actual = deps.leer(tipo); // aplicar fusiona con la instancia elegida
      if (!actual) return { deshacer: () => undefined };
      const anterior = copia(actual);
      const limites = getSizeConstraints(tipo);
      deps.escribir(tipo, {
        settings: { ...actual.settings, ...validado.config.settings },
        size: validado.config.size ?? actual.size,
        w: limitar(validado.config.w ?? actual.w, limites.minW, limites.maxW),
        h: limitar(validado.config.h ?? actual.h, limites.minH, limites.maxH),
      });
      return { deshacer: () => deps.escribir(tipo, anterior) };
    },
  };
}

/** Registra el adaptador de widgets en el registro de familias del clic derecho. */
export function registrarAdaptadorWidgets(deps: DepsWidgets): void {
  registrarFamilia(crearAdaptadorWidgets(deps));
}

