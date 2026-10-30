/**
 * GENESIS · DESCUBRIMIENTO PROGRESIVO DE HERRAMIENTAS MCP (2026-10-30)
 * ─────────────────────────────────────────────────────────────────────────────
 * Patrón Strata (Klavis-AI/klavis) adaptado al OS: en vez de volcar cientos de
 * herramientas en `tools/list`, se ofrecen tres metaherramientas (descubrir,
 * detalle y ejecutar) y el resto se descubre por palabras clave con BM25 propio.
 * El presupuesto de contexto se ajusta al medio de IA (modelo pequeño, mediano
 * o grande) y el ámbito/permisos de Genesis mandan SIEMPRE antes de descubrir.
 *
 * Módulo PURO: sin React, sin red, sin disco, sin reloj y sin `node:*`.
 * Contrato: architecture/repos-libreria-1025.md §4.8.
 */
import type { HerramientaMcp } from "./protocolo";

export type MedioIa = "modelo-pequeno" | "modelo-mediano" | "modelo-grande";

export interface PerfilMedio {
  maxResultados: number;
  maxDescripcion: number;
  conEsquema: boolean;
}

export const PERFILES_MEDIO: Record<MedioIa, PerfilMedio> = {
  "modelo-pequeno": { maxResultados: 3, maxDescripcion: 80, conEsquema: false },
  "modelo-mediano": { maxResultados: 5, maxDescripcion: 160, conEsquema: false },
  "modelo-grande": { maxResultados: 8, maxDescripcion: 400, conEsquema: true },
};

export const UMBRAL_PROGRESIVO = 12;

export const METAHERRAMIENTAS = [
  "descubrir_herramientas",
  "detalle_herramienta",
  "ejecutar_herramienta",
] as const;

const PALABRAS_VACIAS = new Set([
  "de", "la", "el", "los", "las", "un", "una", "y", "en",
  "the", "a", "of", "to", "for", "and",
]);

/**
 * Separa camelCase ANTES de pasar a minúsculas, quita tildes (NFD) y parte por
 * todo lo que no sea [a-z0-9] (también el guion bajo). Sin stemming.
 */
export function tokenizar(texto: string): string[] {
  const separado = texto
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  return separado
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !PALABRAS_VACIAS.has(token));
}

export interface DocumentoBm25 {
  id: string;
  texto: string;
}

export interface IndiceBm25 {
  buscar(consulta: string, limite: number): Array<{ id: string; puntuacion: number }>;
}

const K1 = 1.5;
const B = 0.75;

interface DocumentoIndexado {
  id: string;
  longitud: number;
  frecuencias: Map<string, number>;
}

/** Índice BM25 clásico (k1 = 1,5 · b = 0,75) sobre documentos ya tokenizados. */
export function crearIndiceBm25(docs: ReadonlyArray<DocumentoBm25>): IndiceBm25 {
  const documentos: DocumentoIndexado[] = docs.map((doc) => {
    const tokens = tokenizar(doc.texto);
    const frecuencias = new Map<string, number>();
    for (const token of tokens) {
      frecuencias.set(token, (frecuencias.get(token) ?? 0) + 1);
    }
    return { id: doc.id, longitud: tokens.length, frecuencias };
  });

  const total = documentos.length;
  const longitudMedia =
    total === 0 ? 0 : documentos.reduce((suma, doc) => suma + doc.longitud, 0) / total;
  const frecuenciaDocumental = new Map<string, number>();
  for (const doc of documentos) {
    for (const token of doc.frecuencias.keys()) {
      frecuenciaDocumental.set(token, (frecuenciaDocumental.get(token) ?? 0) + 1);
    }
  }

  return {
    buscar(consulta: string, limite: number) {
      const terminos = [...new Set(tokenizar(consulta))];
      if (terminos.length === 0 || total === 0 || !Number.isFinite(limite) || limite <= 0) {
        return [];
      }
      const resultados: Array<{ id: string; puntuacion: number }> = [];
      for (const doc of documentos) {
        let puntuacion = 0;
        for (const termino of terminos) {
          const tf = doc.frecuencias.get(termino);
          if (!tf) continue;
          const df = frecuenciaDocumental.get(termino) ?? 0;
          const idf = Math.log(1 + (total - df + 0.5) / (df + 0.5));
          const normalizador = longitudMedia === 0 ? 0 : 1 - B + B * (doc.longitud / longitudMedia);
          puntuacion += idf * ((tf * (K1 + 1)) / (tf + K1 * normalizador));
        }
        if (puntuacion > 0) resultados.push({ id: doc.id, puntuacion });
      }
      resultados.sort(
        (a, b) => b.puntuacion - a.puntuacion || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
      return resultados.slice(0, Math.floor(limite));
    },
  };
}

export interface OpcionesProgresivo {
  medio?: MedioIa;
  umbral?: number;
  permitida?: (h: HerramientaMcp) => boolean;
}

type ResultadoMcp = Awaited<ReturnType<HerramientaMcp["ejecutar"]>>;

function responder(texto: string): ResultadoMcp {
  return { contenido: [{ tipo: "texto", texto }] };
}

function fallar(texto: string): ResultadoMcp {
  return { contenido: [{ tipo: "texto", texto }], esError: true };
}

function recortar(texto: string, maximo: number): string {
  return texto.length > maximo ? texto.slice(0, maximo) : texto;
}

function clavesEsquema(esquema: Record<string, unknown>): string[] {
  const propiedades = esquema.properties;
  if (typeof propiedades !== "object" || propiedades === null || Array.isArray(propiedades)) {
    return [];
  }
  return Object.keys(propiedades as Record<string, unknown>);
}

function enteroAcotado(valor: unknown, defecto: number, maximo: number): number {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return maximo;
  return Math.min(Math.max(0, Math.floor(valor)), maximo);
}

/**
 * Envuelve las herramientas visibles en el patrón progresivo. Si hay pocas
 * (≤ umbral) se devuelven tal cual; si hay muchas, solo las tres
 * metaherramientas. `permitida` se aplica ANTES de contar y descubrir.
 */
export function envolverProgresivo(
  herramientas: HerramientaMcp[],
  opciones: OpcionesProgresivo = {},
): HerramientaMcp[] {
  const permitida = opciones.permitida;
  const visibles = permitida ? herramientas.filter((h) => permitida(h)) : herramientas;
  const umbral = Number.isFinite(opciones.umbral) ? (opciones.umbral as number) : UMBRAL_PROGRESIVO;
  if (visibles.length <= umbral) {
    return visibles.length === herramientas.length ? herramientas : visibles;
  }

  const perfil = PERFILES_MEDIO[opciones.medio ?? "modelo-mediano"];
  const indice = crearIndiceBm25(
    visibles.map((h) => ({
      id: h.nombre,
      texto: `${h.nombre} ${h.descripcion} ${clavesEsquema(h.esquema).join(" ")}`,
    })),
  );
  const porNombre = new Map(visibles.map((h) => [h.nombre, h]));
  const nombresMeta = new Set<string>(METAHERRAMIENTAS);
  const desconocida = (nombre: string) => fallar(`Herramienta desconocida o no permitida: ${nombre}`);

  const descubrir: HerramientaMcp = {
    nombre: "descubrir_herramientas",
    descripcion: "Descubre por palabras clave las acciones disponibles y su descripción.",
    esquema: {
      type: "object",
      properties: {
        consulta: { type: "string", description: "Palabras clave de lo que quieres hacer." },
        limite: { type: "number", description: "Máximo de resultados." },
      },
      required: ["consulta"],
    },
    ejecutar: async (args) => {
      const consulta = typeof args.consulta === "string" ? args.consulta : "";
      const limite = enteroAcotado(args.limite, perfil.maxResultados, perfil.maxResultados);
      const coincidencias = indice.buscar(consulta, visibles.length);
      const resultados = coincidencias.slice(0, limite).map(({ id }) => {
        const herramienta = porNombre.get(id);
        const ficha: Record<string, unknown> = {
          nombre: id,
          descripcion: recortar(herramienta?.descripcion ?? "", perfil.maxDescripcion),
        };
        if (perfil.conEsquema) ficha.esquema = herramienta?.esquema ?? {};
        return ficha;
      });
      const cuerpo: Record<string, unknown> = { resultados, total: coincidencias.length };
      if (resultados.length === 0) cuerpo.sugerencia = "prueba con otras palabras";
      return responder(JSON.stringify(cuerpo));
    },
  };

  const detalle: HerramientaMcp = {
    nombre: "detalle_herramienta",
    descripcion: "Devuelve la ficha completa (descripción y esquema) de una herramienta.",
    esquema: {
      type: "object",
      properties: { nombre: { type: "string", description: "Nombre exacto de la herramienta." } },
      required: ["nombre"],
    },
    ejecutar: async (args) => {
      const nombre = typeof args.nombre === "string" ? args.nombre : "";
      const herramienta = porNombre.get(nombre);
      if (!herramienta) return desconocida(nombre);
      return responder(
        JSON.stringify({
          nombre: herramienta.nombre,
          descripcion: herramienta.descripcion,
          esquema: herramienta.esquema,
        }),
      );
    },
  };

  const ejecutarMeta: HerramientaMcp = {
    nombre: "ejecutar_herramienta",
    descripcion: "Ejecuta una herramienta visible con sus argumentos.",
    esquema: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "Nombre exacto de la herramienta." },
        argumentos: { type: "object", description: "Argumentos de la herramienta." },
      },
      required: ["nombre"],
    },
    ejecutar: async (args, ctx) => {
      const nombre = typeof args.nombre === "string" ? args.nombre : "";
      const herramienta = porNombre.get(nombre);
      if (!herramienta || nombresMeta.has(nombre)) return desconocida(nombre);
      const bruto = args.argumentos;
      const argumentos =
        typeof bruto === "object" && bruto !== null && !Array.isArray(bruto)
          ? (bruto as Record<string, unknown>)
          : {};
      try {
        return await herramienta.ejecutar(argumentos, ctx);
      } catch {
        return fallar("La herramienta falló.");
      }
    },
  };

  return [descubrir, detalle, ejecutarMeta];
}
