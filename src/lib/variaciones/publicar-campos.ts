// ═══════════════════════════════════════════════════════════════════════════
// Núcleo PURO de «Publicar mi variación» (Ola 1019V · tarea Q · contrato:
// architecture/variaciones-publicas.md §4).El componente `publicar-variacion.tsx`
// usa estas funciones; sus pruebas viven en
// `src/components/variaciones/__tests__/publicar-variacion.test.tsx`.
// Sin red, sin disco, sin DOM: entrada → salida y nada más.
// ═══════════════════════════════════════════════════════════════════════════
import {
  motivosNuevaVariacion,
  type NuevaVariacion,
  type FilaVariacion,
} from "./datos";
import type { ShareResourceRef } from "@/lib/sharing/share-targets";

/** Licencias que ofrece el formulario; toda variación declara la suya (contrato §6). */
export const LICENCIAS_VARIACION = [
  "CC0-1.0",
  "MIT",
  "CC-BY-4.0",
  "Apache-2.0",
  "Derechos reservados",
] as const;

/** Campos del formulario de publicación. */
export interface CamposVariacion {
  titulo: string;
  descripcion: string;
  /** Etiquetas tal como el usuario las escribe: separadas por comas o «;». */
  etiquetasTexto: string;
  /** Tema (por ejemplo un preset curado) con el que se publicó la captura. */
  tema: string;
  licencia: string;
  /** Id de la variación de la que deriva, si la publicar deriva de otra (cadena de origen). */
  deVariacion: string;
  /** Si se marca, además se crea una nota pública que la referencia por `references.elemento`. */
  tambienPublicacion: boolean;
}

/** Estado inicial del formulario. */
export const CAMPOS_VACIOS: CamposVariacion = {
  titulo: "",
  descripcion: "",
  etiquetasTexto: "",
  tema: "",
  licencia: LICENCIAS_VARIACION[0],
  deVariacion: "",
  tambienPublicacion: false,
};

/** Convierte el texto del usuario en etiquetas limpias: separa, normaliza, quita repetidas y corta a 8. */
export function etiquetasDesdeTexto(texto: string): string[] {
  const limpias = texto
    .split(/[,;]+/)
    .map((e) => e.trim().replace(/\s+/g, "-").toLowerCase())
    .filter(Boolean);
  return [...new Set(limpias)].slice(0, 8);
}

/** Monta la entrada de `publicarVariacion` desde los campos y el payload capturado por el adaptador. */
export function construirNueva(clave: string, campos: CamposVariacion, payload: unknown): NuevaVariacion {
  const descripcion = campos.descripcion.trim();
  const tema = campos.tema.trim();
  const deVariacion = campos.deVariacion.trim();
  return {
    clave,
    titulo: campos.titulo.trim(),
    descripcion: descripcion || undefined,
    payload,
    licencia: campos.licencia.trim(),
    deVariacion: deVariacion || null,
    etiquetas: etiquetasDesdeTexto(campos.etiquetasTexto),
    tema: tema || undefined,
  };
}

/** Valida antes de guardar: mismas reglas que la capa de datos, ya sin que el componente las repita. */
export function motivosDePublicacion(clave: string, campos: CamposVariacion, payload: unknown): string[] {
  return motivosNuevaVariacion(construirNueva(clave, campos, payload)).motivos;
}

/** Recurso universal para `ShareToDialog`: «publicacion» si ya está publicada, «archivo» si no. */
export function recursoDeVariacion(x: { clave: string; titulo: string; descripcion?: string; id?: string }): ShareResourceRef {
  const kind = x.id ? "publicacion" : "archivo";
  return {
    kind,
    id: x.id ?? x.clave,
    name: x.titulo || x.clave,
    note: [x.descripcion, `Variación de «${x.clave}»`].filter(Boolean).join(" · "),
    mime: kind === "archivo" ? "application/json" : undefined,
    route: kind === "archivo" ? "/library" : undefined,
  };
}

/** Fila de `posts` para el «también como publicación»: NOTA pública con `references.elemento` (contrato §6). */
export function filaNotaVariacion(x: {
  clave: string;
  titulo: string;
  descripcion?: string;
  autorId: string;
  autorNombre: string;
  variacionId: string;
}): Record<string, unknown> {
  return {
    author_id: x.autorId,
    author_name: x.autorNombre,
    type: "note",
    content: {
      title: x.titulo,
      text: x.descripcion || `Variación pública de «${x.clave}».`,
      payload: x.variacionId,
      references: { elemento: x.clave, variacion: x.variacionId },
    },
    meta: { visibility: "public" },
    post_references: { elemento: x.clave },
  };
}

