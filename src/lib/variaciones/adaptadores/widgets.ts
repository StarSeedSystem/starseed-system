// src/lib/variaciones/adaptadores/widgets.ts
// Familia «widget» de las variaciones públicas (contrato: architecture/variaciones-publicas.md §5).
// Clave `widget:<WidgetType>`; el payload toma la configuración visual y de opciones del widget
// (no sus datos personales), aplicar la fusiona con la instancia elegida y devuelve deshacer;
// respeta `getSizeConstraints` de `src/components/dashboard/widget-manifest.ts`. Módulo PURO.
import { validarVariacion } from "../validar";
import { registrarFamilia, type AdaptadorFamilia } from "../familias";
import { getSizeConstraints } from "@/components/dashboard/widget-manifest";
import { type DashboardWidget, type WidgetType } from "@/components/dashboard/dashboard-types";
import { leerClave } from "../clave-elemento";

/** Parche de configuración de widget: ajustes (settings) y tamaño (size) opcional. */
export interface ParcheWidget {
  settings: Record<string, unknown>;
  size?: "S" | "M" | "L" | "XL";
  layout?: { w: number; h: number };
}

/** Dependencias inyectables para el adaptador de widgets. */
export interface DepsWidget {
  /** Lee el widget activo por su tipo. */
  leer: (tipo: WidgetType) => DashboardWidget | null;
  /** Escribe los ajustes y tamaño aplicados; devuelve el valor anterior para deshacer. */
  escribir: (tipo: WidgetType, parche: ParcheWidget) => ParcheWidget | null;
}

/** Patrones que indican una clave privada o sensible. */
const PATRONES_PRIVADOS = [
  /^starseed\./i,
  /^api[_-]?key$/i,
  /^token$/i,
  /^password|contrasena$/i,
  /^secret$/i,
  /^credential$/i,
  /^authorization$/i,
];

/** Detecta si un objeto de ajustes contiene claves privadas o sensibles. */
function hayClavesPrivadas(settings: Record<string, unknown>): boolean {
  for (const clave of Object.keys(settings)) {
    if (PATRONES_PRIVADOS.some((pat) => pat.test(clave))) return true;
  }
  return false;
}

/** Sanear ajustes: elimina datos personales, claves y secretos (contrato §5). */
export function sanearAjustesWidget(settings: Record<string, unknown>): Record<string, unknown> {
  const limpio = { ...settings };
  for (const k of Object.keys(limpio)) {
    if (PATRONES_PRIVADOS.some((pat) => pat.test(k))) {
      delete limpio[k];
    }
  }
  return limpio;
}

/** Extrae el tipo de widget de la clave canónica `widget:<WidgetType>`. */
export function tipoDeClaveWidget(clave: string): WidgetType | null {
  // Formato esperado: widget:<WidgetType> donde WidgetType usa mayúsculas y guión bajo
  // (ej. widget:CLOCK_DATE, widget:WEATHER_BASIC).
  const regex = /^widget:([A-Z0-9_]+)$/i;
  const match = clave.match(regex);
  if (!match) return null;
  return match[1] as WidgetType;
}

/** Resultado de validar un parche de widget. */
export type ResultadoParcheWidget = { ok: true; parche: ParcheWidget } | { ok: false; motivos: string[] };

/** Valida el parche de widget: formato, sanidad y restricciones de tamaño del manifiesto. */
export function validarParcheWidget(payload: unknown, tipo: WidgetType): ResultadoParcheWidget {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { ok: false, motivos: ["Widget: el payload debe ser un objeto con settings y tamaño"] };
  }
  const p = payload as ParcheWidget;
  if (!p.settings || typeof p.settings !== "object" || Array.isArray(p.settings)) {
    return { ok: false, motivos: ["Widget: los ajustes (settings) deben ser un objeto plano"] };
  }

  // Rechazar si contiene claves privadas o sensibles (contrato §5: nada privado entra en un payload)
  if (hayClavesPrivadas(p.settings as Record<string, unknown>)) {
    return { ok: false, motivos: ["Widget: los ajustes contienen claves privadas o sensibles"] };
  }

  const saneado = sanearAjustesWidget(p.settings as Record<string, unknown>);
  const revision = validarVariacion(saneado);
  if (!revision.ok) {
    return { ok: false, motivos: revision.motivos };
  }

  const parche: ParcheWidget = { settings: saneado };
  if (p.size) {
    if (!["S", "M", "L", "XL"].includes(p.size)) {
      return { ok: false, motivos: ["Widget: tamaño inválido"] };
    }
    parche.size = p.size;
  }

  if (p.layout && typeof p.layout === "object") {
    const { w, h } = p.layout;
    if (typeof w === "number" && typeof h === "number") {
      const constraints = getSizeConstraints(tipo);
      if (w < constraints.minW || h < constraints.minH) {
        return { ok: false, motivos: [`Widget: las dimensiones w=${w}, h=${h} incumplen los mínimos del manifiesto (minW=${constraints.minW}, minH=${constraints.minH})`] };
      }
      if (constraints.maxW && w > constraints.maxW) {
        return { ok: false, motivos: ["Widget: tamaño excede el máximo permitido"] };
      }
      if (constraints.maxH && h > constraints.maxH) {
        return { ok: false, motivos: ["Widget: tamaño excede el máximo permitido"] };
      }
      parche.layout = { w, h };
    }
  }

  return { ok: true, parche };
}

/** Crea el adaptador de la familia `widget` con dependencias inyectadas. */
export function crearAdaptadorWidget(deps: DepsWidget): AdaptadorFamilia<ParcheWidget> {
  return {
    familia: "widget",
    nombre: "Configuración de widgets",
    capturar: (clave) => {
      const tipo = tipoDeClaveWidget(clave);
      if (!tipo) return null;
      const widget = deps.leer(tipo);
      if (!widget) return null;
      return {
        settings: sanearAjustesWidget(widget.settings ?? {}),
        size: widget.size,
        layout: widget.layout ? { w: widget.layout.w, h: widget.layout.h } : undefined,
      };
    },
    validar: (payload) => {
      // Validación general genérica si no hay tipo específico en el payload
      const revision = validarVariacion(payload);
      return revision.ok ? { ok: true, payload: payload as ParcheWidget } : { ok: false, motivos: revision.motivos };
    },
    aplicar: (clave, payload) => {
      const tipo = tipoDeClaveWidget(clave);
      if (!tipo) throw new Error("Variación de widget rechazada: clave inválida");
      const validacion = validarParcheWidget(payload, tipo);
      if (!validacion.ok) {
        throw new Error(`Variación de widget rechazada: ${validacion.motivos.join(" · ")}`);
      }
      const previo = deps.escribir(tipo, validacion.parche);
      return {
        deshacer: () => {
          if (previo) {
            deps.escribir(tipo, previo);
          }
        },
      };
    },
  };
}

/** Registra el adaptador de widgets en el registro de familias. */
export function registrarAdaptadorWidget(deps: DepsWidget): void {
  registrarFamilia(crearAdaptadorWidget(deps));
}
