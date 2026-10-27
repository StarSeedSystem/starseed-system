/**
 * MCP autoadaptable: descubrimiento progresivo de herramientas (patrón Strata de Klavis).
 * Contrato: architecture/repos-libreria-1025.md §3, tareas AGT1025B.
 * Módulo puro (sin node:*, sin red, sin disco, sin reloj); nada de `any`.
 */
import { type HerramientaMcp } from "./protocolo";

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

export const PALABRAS_VACIAS = new Set([
  "de", "la", "el", "los", "las", "un", "una", "y", "en",
  "the", "a", "of", "to", "for", "and",
]);

export function tokenizar(texto: string): string[] {
  const conSeparadores = texto.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  const minusculas = conSeparadores
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const bruto = minusculas.split(/[^a-z0-9]+/);
  const tokens: string[] = [];
  for (const trozo of bruto) {
    if (trozo.length > 1 && !PALABRAS_VACIAS.has(trozo)) tokens.push(trozo);
  }
  return tokens;
}

export interface DocIndice {
  id: string;
  texto: string;
}

export interface ResultadoBm25 {
  id: string;
  puntuacion: number;
}

export interface IndiceBm25 {
  buscar: (consulta: string, limite: number) => ResultadoBm25[];
}

const K1_BM25 = 1.5;
const B_BM25 = 0.75;
const LONG_MEDIA_DEFECTO = 1;

export function crearIndiceBm25(docs: ReadonlyArray<DocIndice>): IndiceBm25 {
  const terminosDoc: Array<string[]> = docs.map((d) => tokenizar(d.texto));
  const frecuencias: Array<Map<string, number>> = terminosDoc.map((terminos) => {
    const f = new Map<string, number>();
    for (const t of terminos) f.set(t, (f.get(t) ?? 0) + 1);
    return f;
  });
  const longitudes: number[] = terminosDoc.map((t) => Math.max(t.length, LONG_MEDIA_DEFECTO));
  const longitudMedia =
    longitudes.reduce((suma, l) => suma + l, 0) / Math.max(longitudes.length, 1) || 1;
  const total = docs.length;
  const apariciones = new Map<string, number>();
  for (const terminos of terminosDoc) {
    const vistos = new Set(terminos);
    for (const t of vistos) apariciones.set(t, (apariciones.get(t) ?? 0) + 1);
  }
  const idf = new Map<string, number>();
  for (const [t, n] of apariciones) {
    idf.set(t, Math.log(1 + (total - n + 0.5) / (n + 0.5)));
  }

  return {
    buscar(consulta: string, limite: number): ResultadoBm25[] {
      const terminos = Array.from(new Set(tokenizar(consulta)));
      if (terminos.length === 0) return [];
      const puntuaciones: ResultadoBm25[] = [];
      for (let i = 0; i < total; i++) {
        let puntos = 0;
        for (const t of terminos) {
          const tf = frecuencias[i].get(t);
          if (tf === undefined) continue;
          const peso = idf.get(t) ?? 0;
          const parte =
            (tf * (K1_BM25 + 1)) /
            (tf + K1_BM25 * (1 - B_BM25 + B_BM25 * (longitudes[i] / longitudMedia)));
          puntos += peso * parte;
        }
        if (puntos > 0) puntuaciones.push({ id: docs[i].id, puntuacion: puntos });
      }
      puntuaciones.sort((a, b) =>
        b.puntuacion === a.puntuacion
          ? a.id.localeCompare(b.id)
          : b.puntuacion - a.puntuacion
      );
      return puntuaciones.slice(0, Math.max(limite, 0));
    },
  };
}

export interface OpcionesProgresivo {
  medio?: MedioIa;
  umbral?: number;
  permitida?: (h: HerramientaMcp) => boolean;
}

type Contenido = Array<{ tipo: "texto"; texto: string }>;
type Respuesta = { contenido: Contenido; esError?: boolean };

function textoJson(valor: unknown): Respuesta {
  return { contenido: [{ tipo: "texto", texto: JSON.stringify(valor) }] };
}

function errorTexto(mensaje: string): Respuesta {
  return { contenido: [{ tipo: "texto", texto: mensaje }], esError: true };
}

/** Recorta una descripción al máximo del medio, sin dejarla a mitad de palabra si se puede. */
function recortar(texto: string, max: number): string {
  if (texto.length <= max) return texto;
  const espacio = max - 1;
  const corto = texto.slice(0, espacio);
  const ultimoEspacio = corto.lastIndexOf(" ");
  return (
    (ultimoEspacio > espacio * 0.6 ? corto.slice(0, ultimoEspacio) : corto).trim() + "…"
  );
}

/** Claves visibles del esquema (properties), para el índice y para detalle. */
function clavesEsquema(esquema: Record<string, unknown>): string {
  if (typeof esquema !== "object" || esquema === null) return "";
  const propiedades = (esquema as Record<string, unknown>).properties;
  if (typeof propiedades !== "object" || propiedades === null) return "";
  return Object.keys(propiedades as Record<string, unknown>).join(" ");
}

const MENSAJE_DESCONOCIDA = "Herramienta desconocida o no permitida: ";

/** Construye las tres metaherramientas sobre las herramientas visibles. */
function crearMetaherramientas(
  visibles: HerramientaMcp[],
  medio: MedioIa
): HerramientaMcp[] {
  const perfil = PERFILES_MEDIO[medio];
  const indice = crearIndiceBm25(
    visibles.map((h) => ({ id: h.nombre, texto: `${h.nombre} ${h.descripcion} ${clavesEsquema(h.esquema)}` }))
  );
  const porNombre = new Map(visibles.map((h) => [h.nombre, h]));
  const descubrir: HerramientaMcp = {
    nombre: "descubrir_herramientas",
    descripcion: `Descubre herramientas por palabras clave (${visibles.length} disponibles; empieza aquí).`,
    esquema: {
      type: "object",
      properties: { consulta: { type: "string" }, limite: { type: "number" } },
      required: ["consulta"],
    },
    ejecutar: async (args) => {
      const consulta = typeof args.consulta === "string" ? args.consulta : "";
      const pedidos = typeof args.limite === "number" ? args.limite : perfil.maxResultados;
      const encontrados = indice.buscar(consulta, perfil.maxResultados);
      const elegidos = encontrados.slice(0, Math.min(Math.max(pedidos, 0), perfil.maxResultados));
      if (elegidos.length === 0) {
        return textoJson({ resultados: [], sugerencia: "prueba con otras palabras" });
      }
      return textoJson({
        resultados: elegidos.flatMap(({ id }) => {
          const h = porNombre.get(id);
          if (!h) return [];
          const base: Record<string, unknown> = {
            nombre: h.nombre,
            descripcion: recortar(h.descripcion, perfil.maxDescripcion),
          };
          if (perfil.conEsquema) base.esquema = h.esquema;
          return [base];
        }),
        total: encontrados.length,
      });
    },
  };
  const detalle: HerramientaMcp = {
    nombre: "detalle_herramienta",
    descripcion: "Da el esquema completo de una herramienta descubierta.",
    esquema: {
      type: "object",
      properties: { nombre: { type: "string" } },
      required: ["nombre"],
    },
    ejecutar: async (args) => {
      const nombre = typeof args.nombre === "string" ? args.nombre : "";
      const h = porNombre.get(nombre);
      if (!h) return errorTexto(MENSAJE_DESCONOCIDA + nombre);
      return textoJson({ nombre: h.nombre, descripcion: h.descripcion, esquema: h.esquema });
    },
  };
  const ejecutar: HerramientaMcp = {
    nombre: "ejecutar_herramienta",
    descripcion: "Ejecuta una herramienta descubierta por su nombre, con sus argumentos.",
    esquema: {
      type: "object",
      properties: { nombre: { type: "string" }, argumentos: { type: "object" } },
      required: ["nombre"],
    },
    ejecutar: async (args, ctx) => {
      const nombre = typeof args.nombre === "string" ? args.nombre : "";
      const h = porNombre.get(nombre);
      if (!h) return errorTexto(MENSAJE_DESCONOCIDA + nombre);
      try {
        const argumentos = typeof args.argumentos === "object" && args.argumentos !== null
          ? (args.argumentos as Record<string, unknown>)
          : {};
        return await h.ejecutar(argumentos, ctx);
      } catch {
        return errorTexto("La herramienta falló.");
      }
    },
  };
  return [descubrir, detalle, ejecutar];
}

export function envolverProgresivo(
  herramientas: HerramientaMcp[],
  opciones?: OpcionesProgresivo
): HerramientaMcp[] {
  const filtro = opciones?.permitida ?? (() => true);
  const visibles = herramientas.filter(filtro);
  const umbral = opciones?.umbral ?? UMBRAL_PROGRESIVO;
  if (visibles.length <= umbral) return visibles;
  return crearMetaherramientas(visibles, opciones?.medio ?? "modelo-mediano");
}
