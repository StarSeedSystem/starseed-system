// Adaptador de publicaciones y mensajes para «Variaciones públicas» (contrato: architecture/variaciones-publicas.md §5).
// Familias post: y mensaje: con parte #estilo, #plantilla o #decoracion. Captura y aplica SÓLO los estilos y plantillas
// del editor rico y del compositor de publicaciones, NUNCA el texto, los adjuntos ni los destinatarios. Módulo PURO: el borrador va inyectado.
import { validarVariacion } from "../validar";
import { registrarFamilia, type AdaptadorFamilia } from "../familias";
import { validarEstilo } from "@/lib/mensajeria/formato";
import type { AnimacionFondo, BloqueDoc, EstiloMensaje } from "@/lib/mensajeria/formato-tipos";

export type ParteEditor = "estilo" | "plantilla" | "decoracion";
export const FAMILIAS_BORRADOR = ["post", "mensaje"] as const;
const PARTES: ReadonlySet<string> = new Set(["estilo", "plantilla", "decoracion"]);
const FAMILIAS: ReadonlySet<string> = new Set(FAMILIAS_BORRADOR);
export type Decoracion = Pick<EstiloMensaje, "colorMarco" | "grosorMarco" | "fondo"> & { animacionFondo?: AnimacionFondo };
const DECORATIVAS = ["colorMarco", "grosorMarco", "fondo", "animacionFondo"] as const;
export const TIPOS_PLANTILLA = ["parrafo", "titulo", "lista", "tareas", "cita", "codigo", "separador"] as const;
const TIPOS: ReadonlySet<string> = new Set(TIPOS_PLANTILLA);
export type TipoBloquePlantilla = (typeof TIPOS_PLANTILLA)[number];
export type PayloadBorrador =
  | { parte: "estilo"; estilo: EstiloMensaje }
  | { parte: "plantilla"; bloques: TipoBloquePlantilla[] }
  | { parte: "decoracion"; decoracion: Decoracion };
const ANDAMIOS: Record<TipoBloquePlantilla, BloqueDoc> = {
  parrafo: { tipo: "parrafo", tramos: [] }, titulo: { tipo: "titulo", nivel: 1, tramos: [] },
  lista: { tipo: "lista", ordenada: false, items: [[]] }, tareas: { tipo: "tareas", items: [{ hecha: false, tramos: [] }] },
  cita: { tipo: "cita", tramos: [] }, codigo: { tipo: "codigo", texto: "" }, separador: { tipo: "separador" },
};
/** Andamio vacío de un tipo de bloque: la estructura, jamás el contenido. */
export function andamioDeBloque(tipo: TipoBloquePlantilla): BloqueDoc {
  return JSON.parse(JSON.stringify(ANDAMIOS[tipo])) as BloqueDoc; // copia fresca: el editor puede mutar los tramos
}

/** Devuelve la parte #estilo/#plantilla/#decoracion de una clave post:/mensaje:, nulo si no tiene parte válida. */
export function parteDeClave(clave: string): ParteEditor | null {
  const [familia, resto] = clave.split(":", 2);
  if (!resto || !FAMILIAS.has(familia)) return null;
  const parte = resto.split("#", 2)[1];
  return PARTES.has(parte) ? (parte as ParteEditor) : null;
}
/** Lo decorativo del estilo (marco, fondo, animación de fondo), nulo si no lleva nada. */
export function decoracionDe(estilo: unknown): Decoracion | null {
  const e = (typeof estilo === "object" && estilo !== null ? estilo : {}) as Record<string, unknown>;
  const d = Object.fromEntries(DECORATIVAS.filter((c) => e[c] !== undefined && e[c] !== "").map((c) => [c, e[c]]));
  return Object.keys(d).length ? (d as Decoracion) : null;
}
// Privacidad: una variación del editor JAMÁS lleva contenido (texto, adjuntos) ni destinatarios: cada parte solo acepta su clave.
const CONTENIDO_PROHIBIDO = new Set(["texto", "cuerpo", "body", "doc", "lienzo", "destinatarios", "destinos", "adjuntos", "attachments"]);
export type ResultadoPayload = { ok: true; payload: PayloadBorrador } | { ok: false; motivos: string[] };

/** Valida un payload: JSON plano, sin secretos, su parte y nada de contenido ni destinatarios. */
export function validarPayloadBorrador(payload: unknown): ResultadoPayload {
  const base = validarVariacion(payload);
  const motivos: string[] = base.ok ? [] : [...base.motivos];
  const p = (typeof payload === "object" && payload !== null && !Array.isArray(payload) ? payload : null) as Record<string, unknown> | null;
  const parte = typeof p?.parte === "string" && PARTES.has(p.parte) ? (p.parte as ParteEditor) : null;
  if (!p || !parte) return { ok: false, motivos: [...motivos, "Editor: el payload debe ser un objeto con parte «estilo», «plantilla» o «decoracion»"] };
  const permitida: Record<ParteEditor, string> = { estilo: "estilo", plantilla: "bloques", decoracion: "decoracion" };
  for (const clave of Object.keys(p)) {
    if (clave === "parte" || clave === permitida[parte]) continue;
    motivos.push(CONTENIDO_PROHIBIDO.has(clave) ? `Privacidad: una variación del editor nunca lleva texto ni destinatarios («${clave}»)` : `Editor: «${clave}» no pertenece a la parte «${parte}»`);
  }
  const carga = p[permitida[parte]];
  if (parte === "estilo") {
    const estilo = validarEstilo(carga);
    if (!estilo) motivos.push("Estilo: no trae un estilo válido del editor");
    else if (motivos.length === 0) return { ok: true, payload: { parte, estilo } };
  } else if (parte === "plantilla") {
    const bloques = Array.isArray(carga) ? carga.filter((t): t is TipoBloquePlantilla => typeof t === "string" && TIPOS.has(t)) : [];
    if (!Array.isArray(carga) || bloques.length === 0) motivos.push("Plantilla: trae vacía o sin tipos de bloque");
    else if (bloques.length !== carga.length) motivos.push("Plantilla: solo tipos de bloque, nunca texto ni contenido");
    else if (motivos.length === 0) return { ok: true, payload: { parte, bloques } };
  } else if (!carga || typeof carga !== "object" || Array.isArray(carga) || decoracionDe(carga) === null || Object.keys(carga).some((k) => !(DECORATIVAS as readonly string[]).includes(k))) {
    motivos.push("Decoracion: trae algo que no es marco, fondo ni animación de fondo de la superficie");
  } else if (motivos.length === 0) {
    return { ok: true, payload: { parte, decoracion: decoracionDe(carga) ?? {} } };
  }
  return { ok: false, motivos };
}

/** El borrador actual del editor rico o del compositor de publicaciones, inyectado (sin DOM fijo). */
export interface EditorBorrador {
  estiloActual(): EstiloMensaje | null;
  escribirEstilo(estilo: EstiloMensaje | null): void;
  tiposDeBloque(): TipoBloquePlantilla[];
  insertarAndamios(bloques: BloqueDoc[]): () => void;
}

const NOMBRES = { post: "Ajustes de publicación", mensaje: "Estilos del editor de mensajes" } as const; type FamiliaBorrador = (typeof FAMILIAS_BORRADOR)[number];

/** Crea el adaptador de una familia (post o mensaje) sobre un borrador inyectado. */
export function crearAdaptadorBorrador(familia: FamiliaBorrador, editor: EditorBorrador): AdaptadorFamilia<PayloadBorrador> {
  return {
    familia,
    nombre: NOMBRES[familia],
    capturar: (clave) => {
      const parte = parteDeClave(clave);
      if (!parte) return null;
      const estilo = editor.estiloActual();
      if (parte === "estilo") return estilo ? { parte: "estilo", estilo } : null;
      const bloques = editor.tiposDeBloque();
      if (parte === "plantilla") return bloques.length ? { parte: "plantilla", bloques } : null;
      const decoracion = decoracionDe(estilo);
      return decoracion ? { parte: "decoracion", decoracion } : null;
    },
    validar: (payload) => {
      const r = validarPayloadBorrador(payload);
      return r.ok ? { ok: true, payload: r.payload } : { ok: false, motivos: r.motivos };
    },
    aplicar: (_clave, payload) => {
      const v = validarPayloadBorrador(payload);
      if (!v.ok) throw new Error(`Variación del editor rechazada: ${v.motivos.join(" · ")}`);
      const previo = editor.estiloActual();
      if (v.payload.parte === "plantilla") return { deshacer: editor.insertarAndamios(v.payload.bloques.map(andamioDeBloque)) };
      editor.escribirEstilo(v.payload.parte === "estilo" ? v.payload.estilo : { ...(previo ?? {}), ...v.payload.decoracion });
      return { deshacer: () => editor.escribirEstilo(previo) };
    },
  };
}

/** Registra el adaptador de una familia sobre su borrador en el registro común del clic derecho. */
export function registrarAdaptadorBorrador(familia: FamiliaBorrador, editor: EditorBorrador): void { registrarFamilia(crearAdaptadorBorrador(familia, editor)); }
