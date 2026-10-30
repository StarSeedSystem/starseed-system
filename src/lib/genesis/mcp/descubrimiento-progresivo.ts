/**
 * Descubrimiento progresivo de herramientas MCP (patrón Strata de Klavis).
 * PURO: sin red, disco ni reloj. Contrato: architecture/repos-libreria-1025.md §3.
 */
import type { HerramientaMcp } from "./protocolo";

export type MedioIa = "modelo-pequeno" | "modelo-mediano" | "modelo-grande";

export const PERFILES_MEDIO: Record<
  MedioIa,
  { maxResultados: number; maxDescripcion: number; conEsquema: boolean }
> = {
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

export interface DocumentoBm25 {
  id: string;
  texto: string;
}

export interface ResultadoBm25 {
  id: string;
  puntuacion: number;
}

export interface IndiceBm25 {
  buscar(consulta: string, limite: number): ResultadoBm25[];
}

export interface OpcionesProgresivo {
  medio?: MedioIa;
  umbral?: number;
  permitida?: (h: HerramientaMcp) => boolean;
}

const PALABRAS_VACIAS = new Set([
  "de", "la", "el", "los", "las", "un", "una", "y", "en",
  "the", "a", "of", "to", "for", "and",
]);

export function tokenizar(texto: string): string[] {
  return texto
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !PALABRAS_VACIAS.has(t));
}

export function crearIndiceBm25(docs: ReadonlyArray<DocumentoBm25>): IndiceBm25 {
  const k1 = 1.5;
  const b = 0.75;
  const tokensPorDoc = docs.map((d) => tokenizar(d.texto));
  const longitudes = tokensPorDoc.map((t) => t.length);
  const totalLongitudes = longitudes.reduce((suma, v) => suma + v, 0);
  const longitudMedia = docs.length > 0 ? totalLongitudes / docs.length : 0;
  const frecuencias = tokensPorDoc.map((tokens) => {
    const f = new Map<string, number>();
    for (const t of tokens) f.set(t, (f.get(t) ?? 0) + 1);
    return f;
  });
  const docsPorTermino = new Map<string, number>();
  for (const f of frecuencias) {
    for (const t of f.keys()) docsPorTermino.set(t, (docsPorTermino.get(t) ?? 0) + 1);
  }
  const total = docs.length;
  const idf = (termino: string): number => {
    const n = docsPorTermino.get(termino) ?? 0;
    if (n === 0) return 0;
    return Math.log(1 + (total - n + 0.5) / (n + 0.5));
  };

  return {
    buscar(consulta, limite) {
      const terminos = Array.from(new Set(tokenizar(consulta)));
      if (terminos.length === 0 || total === 0 || limite <= 0) return [];
      const resultados: ResultadoBm25[] = [];
      docs.forEach((doc, i) => {
        const f = frecuencias[i];
        const dl = longitudes[i];
        const norma = 1 - b + (b * dl) / (longitudMedia || 1);
        let puntuacion = 0;
        for (const t of terminos) {
          const tf = f.get(t) ?? 0;
          if (tf === 0) continue;
          puntuacion += idf(t) * ((tf * (k1 + 1)) / (tf + k1 * norma));
        }
        if (puntuacion > 0) resultados.push({ id: doc.id, puntuacion });
      });
      resultados.sort((x, y) => {
        if (y.puntuacion !== x.puntuacion) return y.puntuacion - x.puntuacion;
        return x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
      });
      return resultados.slice(0, limite);
    },
  };
}

function textoTool(h: HerramientaMcp): string {
  const propiedades = h.esquema?.properties;
  const claves =
    propiedades && typeof propiedades === "object"
      ? Object.keys(propiedades as Record<string, unknown>)
      : [];
  return [h.nombre, h.descripcion, ...claves].join(" ");
}

function respuesta(valor: unknown) {
  return { contenido: [{ tipo: "texto" as const, texto: JSON.stringify(valor) }] };
}

function error(texto: string) {
  return { contenido: [{ tipo: "texto" as const, texto }], esError: true };
}

function esMeta(nombre: string): boolean {
  return (METAHERRAMIENTAS as readonly string[]).includes(nombre);
}

const ESQUEMA_DESCUBRIR = {
  type: "object",
  properties: {
    consulta: { type: "string", description: "Palabras clave de lo que necesitas" },
    limite: { type: "number", description: "Máximo de resultados" },
  },
  required: ["consulta"],
};

const ESQUEMA_DETALLE = {
  type: "object",
  properties: { nombre: { type: "string", description: "Nombre exacto de la herramienta" } },
  required: ["nombre"],
};

const ESQUEMA_EJECUTAR = {
  type: "object",
  properties: {
    nombre: { type: "string", description: "Nombre exacto de la herramienta" },
    argumentos: { type: "object", description: "Argumentos de la herramienta" },
  },
  required: ["nombre"],
};

export function envolverProgresivo(
  herramientas: HerramientaMcp[],
  opciones: OpcionesProgresivo = {}
): HerramientaMcp[] {
  const permitida = opciones.permitida ?? (() => true);
  const visibles = herramientas.filter(permitida);
  const umbral = opciones.umbral ?? UMBRAL_PROGRESIVO;
  if (visibles.length <= umbral) return visibles;

  const perfil = PERFILES_MEDIO[opciones.medio ?? "modelo-mediano"];
  const indice = crearIndiceBm25(
    visibles.map((h) => ({ id: h.nombre, texto: textoTool(h) }))
  );
  const porNombre = new Map(visibles.map((h) => [h.nombre, h]));

  const descubrir: HerramientaMcp = {
    nombre: "descubrir_herramientas",
    descripcion: "Descubre por palabras clave las herramientas disponibles.",
    esquema: ESQUEMA_DESCUBRIR,
    async ejecutar(args) {
      const consulta = typeof args.consulta === "string" ? args.consulta : "";
      const pedido = typeof args.limite === "number" ? args.limite : perfil.maxResultados;
      const limite = Math.max(0, Math.min(Math.floor(pedido), perfil.maxResultados));
      const todos = indice.buscar(consulta, visibles.length);
      const resultados = todos.slice(0, limite).map(({ id }) => {
        const h = porNombre.get(id) as HerramientaMcp;
        const base: Record<string, unknown> = {
          nombre: h.nombre,
          descripcion: h.descripcion.slice(0, perfil.maxDescripcion),
        };
        if (perfil.conEsquema) base.esquema = h.esquema;
        return base;
      });
      const cuerpo: Record<string, unknown> = { resultados, total: todos.length };
      if (resultados.length === 0) cuerpo.sugerencia = "prueba con otras palabras";
      return respuesta(cuerpo);
    },
  };

  const detalle: HerramientaMcp = {
    nombre: "detalle_herramienta",
    descripcion: "Muestra la ficha completa de una herramienta visible.",
    esquema: ESQUEMA_DETALLE,
    async ejecutar(args) {
      const nombre = typeof args.nombre === "string" ? args.nombre : "";
      const h = porNombre.get(nombre);
      if (!h) return error(`Herramienta desconocida o no permitida: ${nombre}`);
      return respuesta({ nombre: h.nombre, descripcion: h.descripcion, esquema: h.esquema });
    },
  };

  const ejecutar: HerramientaMcp = {
    nombre: "ejecutar_herramienta",
    descripcion: "Ejecuta una herramienta visible con sus argumentos.",
    esquema: ESQUEMA_EJECUTAR,
    async ejecutar(args, ctx) {
      const nombre = typeof args.nombre === "string" ? args.nombre : "";
      const h = porNombre.get(nombre);
      if (esMeta(nombre) || !h) {
        return error(`Herramienta desconocida o no permitida: ${nombre}`);
      }
      const crudos = args.argumentos;
      const argumentos =
        crudos && typeof crudos === "object" && !Array.isArray(crudos)
          ? (crudos as Record<string, unknown>)
          : {};
      try {
        return await h.ejecutar(argumentos, ctx);
      } catch {
        return error("La herramienta falló.");
      }
    },
  };

  return [descubrir, detalle, ejecutar];
}
