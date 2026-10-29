/** Descubrimiento progresivo de herramientas MCP (patrón Strata de Klavis).
 *  Contrato: architecture/repos-libreria-1025.md. Módulo puro: sin red, disco ni reloj. */
import type { HerramientaMcp } from "./protocolo";

export type MedioIa = "modelo-pequeno" | "modelo-mediano" | "modelo-grande";

export const PERFILES_MEDIO: Record<MedioIa, { maxResultados: number; maxDescripcion: number; conEsquema: boolean }> = {
  "modelo-pequeno": { maxResultados: 3, maxDescripcion: 80, conEsquema: false },
  "modelo-mediano": { maxResultados: 5, maxDescripcion: 160, conEsquema: false },
  "modelo-grande": { maxResultados: 8, maxDescripcion: 400, conEsquema: true },
};

export const UMBRAL_PROGRESIVO = 12;
export const METAHERRAMIENTAS = ["descubrir_herramientas", "detalle_herramienta", "ejecutar_herramienta"] as const;
const PALABRAS_VACIAS = new Set(["de", "la", "el", "los", "las", "un", "una", "y", "en", "the", "a", "of", "to", "for", "and"]);

/** Separa camelCase, quita tildes (NFD), minúsculas y descarta palabras vacías y de 1 carácter. */
export function tokenizar(texto: string): string[] {
  const plano = texto.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return plano.split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !PALABRAS_VACIAS.has(t));
}

const K1 = 1.5, B = 0.75;
type Indice = { buscar: (consulta: string, limite: number) => Array<{ id: string; puntuacion: number }> };

/** BM25 clásico, sin dependencias. Empate → id ascendente; solo puntuaciones > 0. */
export function crearIndiceBm25(docs: ReadonlyArray<{ id: string; texto: string }>): Indice {
  const N = docs.length;
  const indizados = docs.map((d) => {
    const tokens = tokenizar(d.texto);
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { id: d.id, tf, longitud: tokens.length };
  });
  const promedio = N === 0 ? 1 : indizados.reduce((a, d) => a + d.longitud, 0) / N;
  const df = new Map<string, number>();
  for (const d of indizados) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  return {
    buscar(consulta, limite) {
      const terminos = Array.from(new Set(tokenizar(consulta)));
      if (terminos.length === 0 || limite <= 0 || N === 0) return [];
      const lista: Array<{ id: string; puntuacion: number }> = [];
      for (const d of indizados) {
        let puntuacion = 0;
        for (const t of terminos) {
          const tf = d.tf.get(t) ?? 0; if (tf === 0) continue;
          const n = df.get(t) ?? 0;
          const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
          puntuacion += idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (d.longitud / promedio))));
        }
        if (puntuacion > 0) lista.push({ id: d.id, puntuacion });
      }
      lista.sort((a, b) => b.puntuacion - a.puntuacion || (a.id < b.id ? -1 : 1));
      return lista.slice(0, Math.max(0, limite));
    },
  };
}

export interface OpcionesProgresivo { medio?: MedioIa; umbral?: number; permitida?: (h: HerramientaMcp) => boolean; }

const comoTexto = (texto: string) => ({ contenido: [{ tipo: "texto" as const, texto }] });
const comoError = (texto: string) => ({ ...comoTexto(texto), esError: true });
const TEXTO_ERROR = "Herramienta desconocida o no permitida";
const clavesEsquema = (esq: Record<string, unknown>): string => (esq && esq.properties && typeof esq.properties === "object" ? Object.keys(esq.properties).join(" ") : "");
const ESQ_DESCUBRIR: Record<string, unknown> = { type: "object", required: ["consulta"], properties: { consulta: { type: "string", description: "Palabras clave de lo que quieres hacer" }, limite: { type: "number", description: "Máximo de resultados" } } };
const ESQ_DETALLE: Record<string, unknown> = { type: "object", required: ["nombre"], properties: { nombre: { type: "string", description: "Nombre exacto de la herramienta" } } };
const ESQ_EJECUTAR: Record<string, unknown> = { type: "object", required: ["nombre"], properties: { nombre: { type: "string", description: "Nombre de la herramienta" }, argumentos: { type: "object", description: "Argumentos según su esquema" } } };

/** Pocas herramientas: las deja tal cual. Muchas: expone solo las tres metaherramientas. */
export function envolverProgresivo(herramientas: HerramientaMcp[], opciones: OpcionesProgresivo = {}): HerramientaMcp[] {
  const visibles = opciones.permitida ? herramientas.filter(opciones.permitida) : herramientas;
  if (visibles.length <= (opciones.umbral ?? UMBRAL_PROGRESIVO)) return visibles;
  const perfil = PERFILES_MEDIO[opciones.medio ?? "modelo-mediano"];
  const porNombre = new Map(visibles.map((h) => [h.nombre, h] as const));
  const indice = crearIndiceBm25(visibles.map((h) => ({ id: h.nombre, texto: `${h.nombre} ${h.descripcion} ${clavesEsquema(h.esquema)}` })));
  const descubrir: HerramientaMcp = {
    nombre: "descubrir_herramientas",
    descripcion: "Busca herramientas por palabras clave y devuelve una lista breve de resultados.",
    esquema: ESQ_DESCUBRIR,
    ejecutar: async (args) => {
      const consulta = typeof args.consulta === "string" ? args.consulta : "";
      const pedido = typeof args.limite === "number" && Number.isFinite(args.limite) && args.limite > 0 ? Math.floor(args.limite) : perfil.maxResultados;
      const filaDe = (h: HerramientaMcp): Record<string, unknown> => {
        const fila: Record<string, unknown> = { nombre: h.nombre, descripcion: h.descripcion.slice(0, perfil.maxDescripcion) };
        if (perfil.conEsquema) fila.esquema = h.esquema;
        return fila;
      };
      const completos = indice.buscar(consulta, visibles.length);
      if (completos.length === 0) return comoTexto(JSON.stringify({ resultados: [], sugerencia: "prueba con otras palabras" }));
      const resultados = completos.slice(0, Math.min(perfil.maxResultados, pedido)).map((r) => porNombre.get(r.id)).filter((h): h is HerramientaMcp => h !== undefined).map(filaDe);
      return comoTexto(JSON.stringify({ resultados, total: completos.length }));
    },
  };
  const detalle: HerramientaMcp = {
    nombre: "detalle_herramienta",
    descripcion: "Devuelve el esquema completo de una herramienta antes de usarla.",
    esquema: ESQ_DETALLE,
    ejecutar: async (args) => {
      const nombre = typeof args.nombre === "string" ? args.nombre : "";
      const h = porNombre.get(nombre);
      if (!h) return comoError(`${TEXTO_ERROR}: ${nombre}`);
      return comoTexto(JSON.stringify({ nombre: h.nombre, descripcion: h.descripcion, esquema: h.esquema }));
    },
  };
  const ejecutar: HerramientaMcp = {
    nombre: "ejecutar_herramienta",
    descripcion: "Ejecuta una herramienta de Genesis por nombre, con los argumentos de su esquema.",
    esquema: ESQ_EJECUTAR,
    ejecutar: async (args, ctx) => {
      const nombre = typeof args.nombre === "string" ? args.nombre : "";
      const esMeta = (METAHERRAMIENTAS as readonly string[]).includes(nombre);
      const h = porNombre.get(nombre);
      if (!h || esMeta) return comoError(`${TEXTO_ERROR}: ${nombre}`);
      try { return await h.ejecutar((args.argumentos ?? {}) as Record<string, unknown>, ctx); }
      catch { return comoError("La herramienta falló."); }
    },
  };
  return [descubrir, detalle, ejecutar];
}
