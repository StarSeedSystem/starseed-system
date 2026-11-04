/**
 * StarSeed OS — DECISIÓN DE AUTO-ACTUALIZACIÓN DE MODELOS (Adenda 111).
 * ============================================================================
 * Pendiente «Auto-actualización efectiva (cuando `autoUpdate` está ON) aplicando el nuevo top
 * sin intervención» del contrato `architecture/ventana-inicio-actualizaciones.md`.
 *
 * Módulo PURO: entra lo que hay (¿auto-actualización encendida?, ¿qué está seleccionado?,
 * ¿cuál es el top nuevo?, ¿qué se ha visto ya?) y sale QUÉ CAMBIAR (o nada) y POR QUÉ.
 * Sin disco, sin red y sin DOM: el cableado (persistir, avisar, registrar) vive en otra capa.
 *
 * Reglas, en este orden: 1) auto-actualización apagada ⇒ nada; 2) lo que la persona fijó a
 * mano ⇒ nunca se toca; 3) sin top nuevo ⇒ nada; 4) el top ya es la selección ⇒ nada;
 * 5) el top ya se vio ⇒ nada (sin bucle); 6) si no, se aplica el top nuevo sin intervención.
 * Cero imports y sin `node:*`: apto para cliente y servidor.
 */

/** Selección vigente de modelos (o de una fuente) en esta neurona. */
export interface SeleccionModelos {
  /** Id de lo seleccionado (modelo o fuente). */
  id: string;
  /** true si la persona lo fijó a mano (no viene de un automático). */
  manual?: boolean;
  /** Etiqueta legible, solo para explicar la decisión. */
  label?: string;
}

/** Top recomendado ahora mismo (el mejor disponible para esta neurona). */
export interface TopModelos {
  /** Id del modelo/fuente recomendado. */
  id: string;
  /** Etiqueta legible, solo para explicar la decisión. */
  label?: string;
}

/** Entrada de la decisión. */
export interface EntradaAutoActualizar {
  /** ¿Auto-actualización encendida? Ausente = encendida (defecto del OS). */
  autoUpdate?: boolean;
  /** Qué está seleccionado ahora (null si no hay nada elegido). */
  seleccionActual: SeleccionModelos | null;
  /** El top nuevo recomendado (null si el catálogo no propone nada). */
  topNuevo: TopModelos | null;
  /** Ids de los tops ya vistos/aplicados (para no repetirlos). */
  vistos?: readonly string[];
}

/** Por qué se decide lo que se decide. */
export type MotivoAutoActualizar =
  | "auto-desactivado" | "fijado-a-mano" | "sin-recomendacion"
  | "ya-seleccionado" | "ya-visto" | "mejora";

/** Resultado de la decisión. */
export interface DecisionAutoActualizar {
  /** true ⇒ hay que aplicar el top nuevo sin intervención. */
  aplicar: boolean;
  /** Id a aplicar (null cuando no hay nada que hacer). */
  id: string | null;
  /** Motivo de la decisión. */
  motivo: MotivoAutoActualizar;
  /** Explicación de una línea en español, para la interfaz o el registro. */
  detalle: string;
}

/** Id comparable: sin espacios y en minúsculas (los ids del catálogo son así). */
function normaliza(id: unknown): string {
  return typeof id === "string" ? id.trim().toLowerCase() : "";
}

/** Etiqueta legible de algo (a la que le caiga), o su id. */
function nombreDe(x: { id: string; label?: string } | null | undefined): string {
  if (!x) return "";
  const etiqueta = typeof x.label === "string" ? x.label.trim() : "";
  return etiqueta || x.id;
}

/**
 * Decide si se aplica el top nuevo de modelos. PURA: no muta la entrada, no lanza
 * y devuelve siempre una decisión válida.
 */
export function queAplicar(entrada?: EntradaAutoActualizar): DecisionAutoActualizar {
  const e = entrada ?? { seleccionActual: null, topNuevo: null };
  const actual = e.seleccionActual ?? null;
  const top = e.topNuevo ?? null;
  const idTop = normaliza(top?.id);

  // 1 · La palabra de la persona: auto-actualización apagada ⇒ no se toca nada.
  if (e.autoUpdate === false) {
    return { aplicar: false, id: null, motivo: "auto-desactivado",
      detalle: "La auto-actualización está apagada: no se cambia nada por su cuenta." };
  }

  // 2 · Lo que la persona fijó a mano es intocable.
  if (actual?.manual === true) {
    return { aplicar: false, id: null, motivo: "fijado-a-mano",
      detalle: `«${nombreDe(actual)}» está fijado a mano: la auto-actualización no lo cambia.` };
  }

  // 3 · Sin recomendación nueva no hay nada que aplicar.
  if (!top || !idTop) {
    return { aplicar: false, id: null, motivo: "sin-recomendacion",
      detalle: "No hay ninguna recomendación nueva que aplicar." };
  }

  // 4 · El top ya es lo que está seleccionado.
  if (normaliza(actual?.id) === idTop) {
    return { aplicar: false, id: null, motivo: "ya-seleccionado",
      detalle: `«${nombreDe(top)}» ya es la selección vigente.` };
  }

  // 5 · Un top ya visto no se repite (nada de bucle aplicar/volver/aplicar).
  const vistos = Array.isArray(e.vistos) ? e.vistos : [];
  if (vistos.some((v) => normaliza(v) === idTop)) {
    return { aplicar: false, id: null, motivo: "ya-visto",
      detalle: `«${nombreDe(top)}» ya se había aplicado antes: no se repite.` };
  }

  // 6 · Aquí sí: el top nuevo se aplica solo, sin intervención.
  return { aplicar: true, id: top?.id.trim(), motivo: "mejora",
    detalle: `Se aplica «${nombreDe(top)}» automáticamente: es el mejor disponible para esta neurona.` };
}
