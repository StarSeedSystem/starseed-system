/**
 * MCP autoadaptable: descubrimiento progresivo de herramientas (patrón Strata de Klavis).
 * En vez de volcar todas las herramientas al modelo de turno (protocolo.ts lista todas),
 * ofrece pocas metaherramientas que descubren el resto por palabras clave con un BM25
 * propio, y el presupuesto de contexto se adapta al medio de IA (resultados, longitud
 * de descripción y esquema según el modelo sea pequeño, mediano o grande).
 * Contrato: architecture/repos-libreria-1025.md (grupo agentes, tarea AGT1025B).
 */
import type { HerramientaMcp } from "./protocolo";

export type MedioIa = "modelo-pequeno" | "modelo-mediano" | "modelo-grande";

export interface PerfilMedio {
  readonly maxResultados: number;
  readonly maxDescripcion: number;
  readonly conEsquema: boolean;
}

export const PERFILES_MEDIO: Record<MedioIa, PerfilMedio> = {
  "modelo-pequeno": { maxResultados: 3, maxDescripcion: 80, conEsquema: false },
  "modelo-mediano": { maxResultados: 5, maxDescripcion: 160, conEsquema: false },
  "modelo-grande": { maxResultados: 8, maxDescripcion: 400, conEsquema: true },
};

/** Por debajo de este número de herramientas visibles no hace falta descubrir nada. */
export const UMBRAL_PROGRESIVO = 12;

export const METAHERRAMIENTAS = [
  "descubrir_herramientas",
  "detalle_herramienta",
  "ejecutar_herramienta",
] as const;

const PALABRAS_VACIAS = new Set([
  "de",
  "la",
  "el",
  "los",
  "las",
  "un",
  "una",
  "y",
  "en",
  "the",
  "a",
  "of",
  "to",
  "for",
  "and",
]);

/**
 * Separa camelCase ANTES de pasar a minúsculas, quita tildes (NFD), pone en minúsculas
 * y parte por todo lo que no sea [a-z0-9] (el guion bajo también).
 * Descarta tokens de un carácter y palabras vacías mínimas. Sin stemming:
 * «tareasListar» y «tareas_listar» dan ["tareas","listar"].
 */
export function tokenizar(texto: string): string[] {
  const conCamel = texto.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  const sinTildes = conCamel.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return sinTildes
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !PALABRAS_VACIAS.has(t));
}

/** Documento del índice: un identificador (normalmente el nombre de la herramienta) y su texto. */
export interface DocIndice {
  readonly id: string;
  readonly texto: string;
}

export interface ResultadoIndice {
  readonly id: string;
  readonly puntuacion: number;
}

export interface IndiceBm25 {
  buscar: (consulta: string, limite: number) => ResultadoIndice[];
}

interface DocMedido {
  readonly id: string;
  readonly tf: Map<string, number>;
  readonly longitud: number;
}

const K1_BM25 = 1.5;
const B_BM25 = 0.75;

/**
 * BM25 clásico: k1 = 1,5 · b = 0,75 · idf = ln(1 + (N − n + 0,5) / (n + 0,5)).
 * Términos de la consulta sin repetir; solo puntuación > 0; orden por puntuación
 * descendente y, en empate, por id ascendente; consulta vacía → [].
 */
export function crearIndiceBm25(docs: ReadonlyArray<DocIndice>): IndiceBm25 {
  const medidos: DocMedido[] = docs.map((d) => {
    const tokens = tokenizar(d.texto);
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { id: d.id, tf, longitud: tokens.length };
  });
  const total = medidos.length;
  const longitudMedia = total === 0 ? 0 : medidos.reduce((s, d) => s + d.longitud, 0) / total;
  const df = new Map<string, number>();
  for (const d of medidos) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = new Map<string, number>();
  for (const [t, n] of df) idf.set(t, Math.log(1 + (total - n + 0.5) / (n + 0.5)));

  return {
    buscar(consulta: string, limite: number): ResultadoIndice[] {
      const terminos = [...new Set(tokenizar(consulta))];
      if (terminos.length === 0 || longitudMedia === 0) return [];
      const puntuados: ResultadoIndice[] = [];
      for (const d of medidos) {
        let puntuacion = 0;
        for (const t of terminos) {
          const tf = d.tf.get(t);
          if (tf === undefined) continue;
          puntuacion += (idf.get(t) ?? 0) * ((tf * (K1_BM25 + 1)) / (tf + K1_BM25 * (1 - B_BM25 + (B_BM25 * d.longitud) / longitudMedia)));
        }
        if (puntuacion > 0) puntuados.push({ id: d.id, puntuacion });
      }
      return puntuados
        .sort((a, b) => b.puntuacion - a.puntuacion || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .slice(0, Math.max(0, Math.floor(limite)));
    },
  };
}

export interface OpcionesProgresivo {
  readonly medio?: MedioIa;
  readonly umbral?: number;
  /** El ámbito y los permisos de Genesis mandan SIEMPRE antes de descubrir. */
  readonly permitida?: (h: HerramientaMcp) => boolean;
}

export function envolverProgresivo(herramientas: HerramientaMcp[], opciones?: OpcionesProgresivo): HerramientaMcp[] {
  const visibles = opciones?.permitida ? herramientas.filter(opciones.permitida) : herramientas;
  const umbral = opciones?.umbral ?? UMBRAL_PROGRESIVO;
  if (visibles.length <= umbral) return visibles;
  return crearMetaherramientas(visibles, opciones?.medio ?? "modelo-mediano");
}

interface EntradaDescubrir {
  nombre: string;
  descripcion: string;
  esquema?: Record<string, unknown>;
}

function crearMetaherramientas(visibles: HerramientaMcp[], medio: MedioIa): HerramientaMcp[] {
  const perfil = PERFILES_MEDIO[medio];
  const indice = crearIndiceBm25(
    visibles.map((h) => ({
      id: h.nombre,
      texto: `${h.nombre} ${h.descripcion} ${clavesDeEsquema(h.esquema).join(" ")}`,
    })),
  );
  const porNombre = new Map(visibles.map((h) => [h.nombre, h]));

  const descubrir: HerramientaMcp = {
    nombre: "descubrir_herramientas",
    descripcion: "Busca herramientas disponibles por palabras clave, sin cargar la lista entera.",
    esquema: {
      type: "object",
      properties: { consulta: { type: "string" }, limite: { type: "number" } },
      required: ["consulta"],
    },
    ejecutar: async (args) => {
      const consulta = typeof args.consulta === "string" ? args.consulta : "";
      const pedido = typeof args.limite === "number" && Number.isFinite(args.limite) ? Math.floor(args.limite) : perfil.maxResultados;
      const limite = Math.max(0, Math.min(pedido, perfil.maxResultados));
      const coincidencias = indice.buscar(consulta, Number.MAX_SAFE_INTEGER);
      const resultados = coincidencias
        .slice(0, limite)
        .map((c): EntradaDescubrir | null => describir(porNombre, c.id, perfil))
        .filter((e): e is EntradaDescubrir => e !== null);
      // «total» = coincidencias antes del recorte de limite: si es mayor, conviene afinar.
      const cuerpo: Record<string, unknown> = { resultados, total: coincidencias.length };
      if (resultados.length === 0) cuerpo.sugerencia = "prueba con otras palabras";
      return textoJson(cuerpo);
    },
  };

  return [descubrir, crearDetalle(porNombre), crearEjecutar(porNombre)];
}

function describir(porNombre: Map<string, HerramientaMcp>, id: string, perfil: PerfilMedio): EntradaDescubrir | null {
  const h = porNombre.get(id);
  if (!h) return null;
  const entrada: EntradaDescubrir = { nombre: h.nombre, descripcion: h.descripcion.slice(0, perfil.maxDescripcion) };
  if (perfil.conEsquema) entrada.esquema = h.esquema;
  return entrada;
}

function crearDetalle(porNombre: Map<string, HerramientaMcp>): HerramientaMcp {
  return {
    nombre: "detalle_herramienta",
    descripcion: "Da la descripción y el esquema completos de una herramienta concreta.",
    esquema: { type: "object", properties: { nombre: { type: "string" } }, required: ["nombre"] },
    ejecutar: async (args) => {
      const nombre = typeof args.nombre === "string" ? args.nombre : "";
      const h = porNombre.get(nombre);
      if (!h) return errorTexto(`Herramienta desconocida o no permitida: ${nombre}`);
      return textoJson({ nombre: h.nombre, descripcion: h.descripcion, esquema: h.esquema });
    },
  };
}

function crearEjecutar(porNombre: Map<string, HerramientaMcp>): HerramientaMcp {
  return {
    nombre: "ejecutar_herramienta",
    descripcion: "Ejecuta una herramienta descubierta por su nombre.",
    esquema: {
      type: "object",
      properties: { nombre: { type: "string" }, argumentos: { type: "object" } },
      required: ["nombre"],
    },
    ejecutar: async (args, ctx) => {
      const nombre = typeof args.nombre === "string" ? args.nombre : "";
      const esMeta = (METAHERRAMIENTAS as readonly string[]).includes(nombre);
      const h = esMeta ? undefined : porNombre.get(nombre);
      if (!h) return errorTexto(`Herramienta desconocida o no permitida: ${nombre}`);
      const argumentos = typeof args.argumentos === "object" && args.argumentos !== null ? (args.argumentos as Record<string, unknown>) : {};
      try {
        return await h.ejecutar(argumentos, ctx);
      } catch {
        return errorTexto("La herramienta falló.");
      }
    },
  };
}

function clavesDeEsquema(esquema: Record<string, unknown>): string[] {
  const props = esquema["properties"];
  return props !== null && typeof props === "object" ? Object.keys(props) : [];
}

function textoJson(cuerpo: Record<string, unknown>): { contenido: Array<{ tipo: "texto"; texto: string }> } {
  return { contenido: [{ tipo: "texto", texto: JSON.stringify(cuerpo) }] };
}

function errorTexto(texto: string): { contenido: Array<{ tipo: "texto"; texto: string }>; esError: boolean } {
  return { contenido: [{ tipo: "texto", texto }], esError: true };
}
