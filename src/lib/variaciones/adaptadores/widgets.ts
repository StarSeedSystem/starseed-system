// Adaptador de la familia «widget» de las variaciones públicas (architecture/
// variaciones-publicas.md §5). Módulo PURO: el puerto del Dashboard se inyecta y
// nunca toca Supabase, reloj, disco ni DOM. La clave es «widget:<WidgetType>»
// (dashboard-types.ts): nombra el TIPO, que toda la gente comparte, nunca una
// instancia. Capturar toma la configuración visual y de opciones (no datos
// personales), aplicar fusiona con la instancia y devuelve deshacer; la huella
// respeta getSizeConstraints.
import type { WidgetType } from "@/components/dashboard/dashboard-types";
import { getManifest, getSizeConstraints } from "@/components/dashboard/widget-manifest";
import { validarVariacion } from "../validar";
import { registrarFamilia, type AdaptadorFamilia } from "../familias";

export type OpcionesWidget = Record<string, unknown>;
/** Operaciones mínimas que el Dashboard presta al adaptador. */
export interface PuertoWidget {
  /** Opciones tal cual de una instancia viva del tipo; `null` si no hay. */
  leer(tipo: WidgetType): OpcionesWidget | null;
  /** Guarda la instrucción ya fusionada de la instancia elegida del tipo. */
  guardar(tipo: WidgetType, opciones: OpcionesWidget): void;
}
export type VariacionWidget = { tipo: WidgetType; opciones: Record<string, unknown> };

/** Opciones visuales compartidas con su rango permitido (cristal del OS, sin hex sueltos). */
const RANGOS: Record<string, readonly [number, number]> = {
  opacity: [0, 1], blur: [0, 40], borderRadius: [0, 48], glowIntensity: [0, 2],
  scale: [0.5, 2], rotateX: [-180, 180], rotateY: [-180, 180],
  animationStiffness: [0, 500], animationDamping: [0, 100],
};
/** La huella de rejilla viaja como «w» y «h», validada con getSizeConstraints. */
const CLAVES_HUELLA: readonly string[] = ["w", "h"];
/** Id de la clave «widget:<WidgetType>`; null si no es de la familia o el tipo no está en el manifiesto. */
const tipoDeClave = (clave: string): WidgetType | null => {
  const [familia, id] = clave.split("#")[0].split(":");
  if (familia !== "widget" || !id || !getManifest(id as WidgetType)) return null;
  return id as WidgetType;
};
const esNumero = (v: unknown, [min, max]: readonly [number, number]): boolean =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
type Veredicto = { ok: true; variacion: VariacionWidget } | { ok: false; motivos: string[] };

/** Valida una variación de widget: JSON plano, campos justos, solo opciones de
 *  la lista y la huella dentro de los límites de getSizeConstraints. */
export function validarVariacionWidget(payload: unknown): Veredicto {
  const base = validarVariacion(payload);
  if (!base.ok) return { ok: false, motivos: base.motivos };
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return { ok: false, motivos: ["Widget: el payload debe ser un objeto"] };
  const registro = payload as Record<string, unknown>;  const motivos = Object.keys(registro)
    .filter((k) => k !== "tipo" && k !== "opciones")
    .map((k) => `Widget: «${k}» no es un campo de esta variación`);
  const tipo = typeof registro.tipo === "string" ? registro.tipo : "";
  const manifiesto = tipo ? getManifest(tipo as WidgetType) : undefined;
  if (!manifiesto) motivos.push("Widget: «tipo» no es un widget del manifiesto del OS");
  const opciones = registro.opciones;
  if (typeof opciones !== "object" || opciones === null || Array.isArray(opciones)) {
    motivos.push("Widget: «opciones» debe ser un objeto");
  } else {
    const actuales = opciones as Record<string, unknown>;
    const entradas = Object.entries(actuales);
    if (entradas.length === 0) motivos.push("Widget: la variación no cambia nada");
    for (const [k, v] of entradas) {
      if (CLAVES_HUELLA.includes(k)) continue;
      if (!(k in RANGOS)) motivos.push(`Widget: «${k}» no es una opción visual de una variación`);
      else if (!esNumero(v, RANGOS[k])) motivos.push(`Widget: «${k}» está fuera de su rango permitido`);
    }
    if (manifiesto) {
      const c = getSizeConstraints(tipo as WidgetType);
      for (const k of CLAVES_HUELLA) {
        if (!(k in actuales)) continue;
        const min = k === "w" ? c.minW : c.minH;
        const max = (k === "w" ? c.maxW : c.maxH) ?? Infinity;
        const v = actuales[k];
        if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
          motivos.push(`Widget: la huella «${k}» debe ir de ${min} a ${max} (getSizeConstraints)`);
        }
      }
    }
  }
  return motivos.length ? { ok: false, motivos } : { ok: true, variacion: payload as VariacionWidget };
}
/** Captura solo la configuración visual y de opciones de una instancia viva; jamás datos personales. */
export function capturarWidget(puerto: PuertoWidget, clave: string): VariacionWidget | null {
  const tipo = tipoDeClave(clave);
  const actuales = tipo ? puerto.leer(tipo) : null;
  if (!actuales) return null;
  const visuales = Object.fromEntries(
    Object.entries(actuales).filter(([k]) => CLAVES_HUELLA.includes(k) || k in RANGOS),
  );
  return { tipo: tipo as WidgetType, opciones: visuales };
}
/** Fusiona la variación con la instancia elegida y devuelve deshacer. Nada se
 *  ejecuta sin validar: payload rechazado, clave que no coincide o instancia
 *  ausente lanzan antes de tocar el puerto. */
export function aplicarWidget(puerto: PuertoWidget, clave: string, variacion: VariacionWidget): () => void {
  const revision = validarVariacionWidget(variacion);
  if (!revision.ok) throw new Error(`Variación de widget rechazada: ${revision.motivos.join(" · ")}`);
  const tipo = revision.variacion.tipo;
  if (tipoDeClave(clave) !== tipo) throw new Error("Widget: la clave no coincide con la variación");
  const previas = puerto.leer(tipo);
  if (!previas) throw new Error("Widget: no hay instancia de este widget en el Dashboard");
  puerto.guardar(tipo, { ...previas, ...revision.variacion.opciones });
  return () => puerto.guardar(tipo, previas);
}
/** Crea el adaptador de la familia widget con el puerto del Dashboard inyectado. */
export function crearAdaptadorWidget(puerto: PuertoWidget): AdaptadorFamilia<VariacionWidget> {
  return {
    familia: "widget",
    nombre: "Widgets del Dashboard",
    capturar: (clave) => capturarWidget(puerto, clave),
    validar: (payload) => {
      const r = validarVariacionWidget(payload);
      return r.ok ? { ok: true, payload: r.variacion } : { ok: false, motivos: r.motivos };
    },
    aplicar: (clave, variacion) => ({ deshacer: aplicarWidget(puerto, clave, variacion) }),
  };
}
/** Registra la familia «widget:» en el registro compartido del clic derecho. */
export function registrarAdaptadorWidget(puerto: PuertoWidget): void {
  registrarFamilia(crearAdaptadorWidget(puerto));
}
