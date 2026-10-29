/**
 * MCP autoadaptable: descubrimiento progresivo de herramientas (patrón Strata de Klavis).
 * En vez de volcar todas las herramientas al modelo, cuando hay muchas solo se exponen
 * tres metaherramientas y el resto se descubre por palabras clave con BM25 propio.
 * Contrato: architecture/repos-libreria-1025.md (grupo agentes).
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

export function tokenizar(texto: string): string[] {
  const conEspacios = texto.replace(/([a-z])([A-Z])/g, "$1 $2");
  const normal = conEspacios
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return normal
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !PALABRAS_VACIAS.has(t));
}

export interface DocIndice {
  id: string;
  texto: string;
}

export function crearIndiceBm25(docs: ReadonlyArray<DocIndice>) {
  const k1 = 1.5;
  const b = 0.75;
  const docsTokens = docs.map((d) => ({ id: d.id, tokens: tokenizar(d.texto) }));
  const total = docsTokens.length;
  const df = new Map<string, number>();
  for (const doc of docsTokens) {
    for (const t of new Set(doc.tokens)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const frecuencias = docsTokens.map((doc) => {
    const f = new Map<string, number>();
    for (const t of doc.tokens) f.set(t, (f.get(t) ?? 0) + 1);
    return f;
  });
  const longitudes = docsTokens.map((doc) => doc.tokens.length);
  const media = total === 0 ? 0 : longitudes.reduce((a, c) => a + c, 0) / total;

  return {
    buscar(consulta: string, limite: number): Array<{ id: string; puntuacion: number }> {
      const terminos = [...new Set(tokenizar(consulta))];
      if (terminos.length === 0 || total === 0) return [];
      const resultados: Array<{ id: string; puntuacion: number }> = [];
      for (let i = 0; i < total; i++) {
        let puntuacion = 0;
        for (const t of terminos) {
          const n = df.get(t) ?? 0;
          const tf = frecuencias[i].get(t) ?? 0;
          if (n === 0 || tf === 0) continue;
          const idf = Math.log(1 + (total - n + 0.5) / (n + 0.5));
          const norma = tf + k1 * (1 - b + b * (longitudes[i] / media));
          puntuacion += (idf * tf * (k1 + 1)) / norma;
        }
        if (puntuacion > 0) resultados.push({ id: docsTokens[i].id, puntuacion });
      }
      resultados.sort((x, y) => y.puntuacion - x.puntuacion || x.id.localeCompare(y.id));
      return resultados.slice(0, Math.max(0, limite));
    },
  };
}

export interface OpcionesProgresivo {
  medio?: MedioIa;
  umbral?: number;
  permitida?: (h: HerramientaMcp) => boolean;
}

export function envolverProgresivo(
  herramientas: HerramientaMcp[],
  opciones: OpcionesProgresivo = {}
): HerramientaMcp[] {
  const visibles = herramientas.filter((h) => (opciones.permitida ? opciones.permitida(h) : true));
  const umbral = opciones.umbral ?? UMBRAL_PROGRESIVO;
  if (visibles.length <= umbral) return visibles;
  return crearMetaherramientas(visibles, opciones.medio ?? "modelo-mediano");
}

type ResultadoMcp = HerramientaMcp["ejecutar"] extends (...args: never[]) => Promise<infer R> ? R : never;

const salida = (t: string): ResultadoMcp => ({ contenido: [{ tipo: "texto", texto: t }] });
const fallo = (t: string): ResultadoMcp => ({ contenido: [{ tipo: "texto", texto: t }], esError: true });
const desconocida = (nombre: string) => `Herramienta desconocida o no permitida: ${nombre}`;

function recortar(t: string, max: number): string {
  return t.length > max ? t.slice(0, max) : t;
}

function textoIndice(h: HerramientaMcp): string {
  const props = h.esquema?.properties;
  const claves = props && typeof props === "object" ? Object.keys(props).join(" ") : "";
  return `${h.nombre} ${h.descripcion} ${claves}`;
}

function crearMetaherramientas(visibles: HerramientaMcp[], medio: MedioIa): HerramientaMcp[] {
  const perfil = PERFILES_MEDIO[medio];
  const indice = crearIndiceBm25(visibles.map((h) => ({ id: h.nombre, texto: textoIndice(h) })));
  const porNombre = new Map(visibles.map((h) => [h.nombre, h]));
  return [
    {
      nombre: "descubrir_herramientas",
      descripcion: "Busca herramientas por palabras clave; luego usa detalle_herramienta para ver el esquema.",
      esquema: {
        type: "object",
        required: ["consulta"],
        properties: { consulta: { type: "string" }, limite: { type: "number" } },
      },
      ejecutar: async (args) => {
        const consulta = typeof args.consulta === "string" ? args.consulta : "";
        const pedido = typeof args.limite === "number" ? args.limite : perfil.maxResultados;
        const hallados = indice.buscar(consulta, Math.min(pedido, perfil.maxResultados));
        if (hallados.length === 0) {
          return salida(JSON.stringify({ resultados: [], sugerencia: "prueba con otras palabras" }));
        }
        const resultados = hallados.map((r) => {
          const h = porNombre.get(r.id) as HerramientaMcp;
          const base = { nombre: h.nombre, descripcion: recortar(h.descripcion, perfil.maxDescripcion) };
          return perfil.conEsquema ? { ...base, esquema: h.esquema } : base;
        });
        return salida(JSON.stringify({ resultados, total: visibles.length }));
      },
    },
    detalleMetaherramienta(porNombre),
    ejecutarMetaherramienta(porNombre),
  ];
}

const ESQUEMA_NOMBRE = {
  type: "object",
  required: ["nombre"],
  properties: { nombre: { type: "string" } },
};

function detalleMetaherramienta(porNombre: Map<string, HerramientaMcp>): HerramientaMcp {
  return {
    nombre: "detalle_herramienta",
    descripcion: "Devuelve el esquema completo de una herramienta antes de ejecutarla.",
    esquema: ESQUEMA_NOMBRE,
    ejecutar: async (args) => {
      const nombre = typeof args.nombre === "string" ? args.nombre : "";
      const h = porNombre.get(nombre);
      if (!h) return fallo(desconocida(nombre));
      return salida(JSON.stringify({ nombre: h.nombre, descripcion: h.descripcion, esquema: h.esquema }));
    },
  };
}

function limpiarArgumentos(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function ejecutarMetaherramienta(porNombre: Map<string, HerramientaMcp>): HerramientaMcp {
  return {
    nombre: "ejecutar_herramienta",
    descripcion: "Ejecuta una herramienta descubierta con sus argumentos.",
    esquema: {
      type: "object",
      required: ["nombre"],
      properties: { nombre: { type: "string" }, argumentos: { type: "object" } },
    },
    ejecutar: async (args, ctx) => {
      const nombre = typeof args.nombre === "string" ? args.nombre : "";
      const metas: readonly string[] = METAHERRAMIENTAS;
      const h = porNombre.get(nombre);
      if (metas.includes(nombre) || !h) return fallo(desconocida(nombre));
      try {
        return await h.ejecutar(limpiarArgumentos(args.argumentos), ctx);
      } catch {
        return fallo("La herramienta falló.");
      }
    },
  };
}
