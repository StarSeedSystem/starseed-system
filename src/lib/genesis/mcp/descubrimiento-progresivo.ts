/**
 * Descubrimiento progresivo de herramientas MCP (patrón Strata / Klavis).
 * Puro, sin node:*, adaptado al presupuesto de contexto de cada medio.
 */
import type { HerramientaMcp } from "./protocolo";

export type MedioIa = "modelo-pequeno" | "modelo-mediano" | "modelo-grande";

export const PERFILES_MEDIO: Record<MedioIa, { maxResultados: number; maxDescripcion: number; conEsquema: boolean }> = {
  "modelo-pequeno": { maxResultados: 3, maxDescripcion: 80, conEsquema: false },
  "modelo-mediano": { maxResultados: 5, maxDescripcion: 160, conEsquema: false },
  "modelo-grande": { maxResultados: 8, maxDescripcion: 400, conEsquema: true },
};

export const UMBRAL_PROGRESIVO = 12;

export const METAHERRAMIENTAS = ["descubrir_herramientas", "detalle_herramienta", "ejecutar_herramienta"] as const;

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
  // Separar camelCase antes de minúsculas: "tareasListar" -> ["tareas", "Listar"]
  const conCamel = texto
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2");
  // Normalizar tildes (NFD), minúsculas
  const normalizado = conCamel.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  // Partir por todo lo que no sea [a-z0-9]
  const partes = normalizado.split(/[^a-z0-9]+/);
  const resultado = partes
    .map((t) => t)
    .filter((t) => t.length > 1 && !PALABRAS_VACIAS.has(t));
  return Array.from(new Set(resultado));
}

export interface IndiceBm25 {
  buscar(consulta: string, limite: number): { id: string; puntuacion: number }[];
}

function calcularBm25(
  docs: ReadonlyArray<{ id: string; texto: string }>,
  consulta: string,
): { id: string; puntuacion: number }[] {
  if (consulta.trim().length === 0) return [];
  const terminosConsulta = Array.from(new Set(tokenizar(consulta)));
  if (terminosConsulta.length === 0) return [];

  const N = docs.length;
  // Calcular df por término (número de documentos que contienen el término)
  const dfPorTermino = new Map<string, number>();
  for (const t of terminosConsulta) {
    let n = 0;
    for (const d of docs) {
      const tokens = new Set(tokenizar(d.texto));
      if (tokens.has(t)) n += 1;
    }
    dfPorTermino.set(t, n);
  }

  // Longitud de documentos y promedio
  const longitudes = docs.map((d) => tokenizar(d.texto).length);
  const avgLen = longitudes.reduce((a, b) => a + b, 0) / (longitudes.length || 1);

  const k1 = 1.5;
  const b = 0.75;
  const resultados: { id: string; puntuacion: number }[] = [];

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const tokensDoc = tokenizar(doc.texto);
    const docLen = tokensDoc.length || 1;
    let score = 0;
    for (const t of terminosConsulta) {
      const n = dfPorTermino.get(t) ?? 0;
      if (n === 0) continue;
      const f = tokensDoc.filter((tk) => tk === t).length;
      if (f === 0) continue;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      const numerador = f * (k1 + 1);
      const denominador = f + k1 * (1 - b + b * (docLen / avgLen));
      score += idf * (numerador / denominador);
    }
    if (score > 0) {
      resultados.push({ id: doc.id, puntuacion: score });
    }
  }

  resultados.sort((a, b) => {
    if (b.puntuacion !== a.puntuacion) return b.puntuacion - a.puntuacion;
    return a.id.localeCompare(b.id);
  });
  return resultados;
}

export function crearIndiceBm25(docs: ReadonlyArray<{ id: string; texto: string }>): IndiceBm25 {
  return {
    buscar(consulta: string, limite: number): { id: string; puntuacion: number }[] {
      const res = calcularBm25(docs, consulta);
      return res.slice(0, Math.max(0, limite));
    },
  };
}

function textoDocParaIndice(h: HerramientaMcp): string {
  let extra = "";
  try {
    if (h.esquema && typeof h.esquema === "object" && h.esquema !== null) {
      const props = (h.esquema as Record<string, unknown>)?.properties;
      if (props && typeof props === "object" && props !== null) {
        extra = " " + Object.keys(props).join(" ");
      }
    }
  } catch {
    // ignorar errores al leer esquema
  }
  return h.nombre + " " + h.descripcion + extra;
}

export function envolverProgresivo(
  herramientas: HerramientaMcp[],
  opciones?: OpcionesProgresivo,
): HerramientaMcp[] {
  const permitida = opciones?.permitida ?? (() => true);
  const filtradas = herramientas.filter(permitida);
  const umbral = opciones?.umbral ?? UMBRAL_PROGRESIVO;
  if (filtradas.length <= umbral) return filtradas;

  const medio = opciones?.medio ?? "modelo-mediano";
  const perfil = PERFILES_MEDIO[medio];

  const docs = filtradas.map((h) => ({ id: h.nombre, texto: textoDocParaIndice(h) }));
  const indice = crearIndiceBm25(docs);

  const metaDescubrir: HerramientaMcp = {
    nombre: "descubrir_herramientas",
    descripcion: "Descubre herramientas disponibles de forma progresiva según la consulta.",
    esquema: {
      type: "object",
      properties: {
        consulta: { type: "string" },
        limite: { type: "number" },
      },
      required: ["consulta"],
    } as Record<string, unknown>,
    ejecutar: async (args: Record<string, unknown>, ctx?: unknown): Promise<{ contenido: Array<{ tipo: "texto"; texto: string }>; esError?: boolean }> => {
      const consulta = typeof args.consulta === "string" ? args.consulta : "";
      let limite = typeof args.limite === "number" ? (args.limite as number) : perfil.maxResultados;
      limite = Math.min(limite, perfil.maxResultados);
      const resultados = indice.buscar(consulta, limite);
      const resultadosFormateados = resultados.map((r) => {
        const h = filtradas.find((f) => f.nombre === r.id);
        if (!h) {
          const item: Record<string, unknown> = { nombre: r.id, descripcion: "" };
          return item;
        }
        const descRecortada = h.descripcion.slice(0, perfil.maxDescripcion);
        const item: Record<string, unknown> = { nombre: h.nombre, descripcion: descRecortada };
        if (perfil.conEsquema) {
          item.esquema = h.esquema;
        }
        return item;
      });
      const total = filtradas.length;
      if (resultadosFormateados.length === 0 && consulta.trim().length > 0) {
        return {
          contenido: [{ tipo: "texto", texto: JSON.stringify({ resultados: [], sugerencia: "prueba con otras palabras", total }) }],
        };
      }
      return {
        contenido: [{ tipo: "texto", texto: JSON.stringify({ resultados: resultadosFormateados, total }) }],
      };
    },
  };

  const metaDetalle: HerramientaMcp = {
    nombre: "detalle_herramienta",
    descripcion: "Muestra los detalles completos de una herramienta visible.",
    esquema: {
      type: "object",
      properties: { nombre: { type: "string" } },
      required: ["nombre"],
    } as Record<string, unknown>,
    ejecutar: async (args: Record<string, unknown>, ctx?: unknown): Promise<{ contenido: Array<{ tipo: "texto"; texto: string }>; esError?: boolean }> => {
      const nombre = typeof args.nombre === "string" ? args.nombre : "";
      const esMeta = (METAHERRAMIENTAS as ReadonlyArray<string>).includes(nombre);
      const h = filtradas.find((f) => f.nombre === nombre);
      if (esMeta || !h) {
        return { contenido: [{ tipo: "texto", texto: `Herramienta desconocida o no permitida: ${nombre}` }], esError: true };
      }
      const detalle = { nombre: h.nombre, descripcion: h.descripcion, esquema: h.esquema };
      return { contenido: [{ tipo: "texto", texto: JSON.stringify(detalle) }] };
    },
  };

  const metaEjecutar: HerramientaMcp = {
    nombre: "ejecutar_herramienta",
    descripcion: "Ejecuta una herramienta visible con argumentos.",
    esquema: {
      type: "object",
      properties: {
        nombre: { type: "string" },
        argumentos: { type: "object" },
      },
      required: ["nombre"],
    } as Record<string, unknown>,
    ejecutar: async (args: Record<string, unknown>, ctx?: unknown): Promise<{ contenido: Array<{ tipo: "texto"; texto: string }>; esError?: boolean }> => {
      const nombre = typeof args.nombre === "string" ? args.nombre : "";
      const argumentos = (args.argumentos && typeof args.argumentos === "object" && args.argumentos !== null) ? (args.argumentos as Record<string, unknown>) : {};
      const esMeta = (METAHERRAMIENTAS as ReadonlyArray<string>).includes(nombre);
      const h = filtradas.find((f) => f.nombre === nombre);
      if (esMeta || !h) {
        return { contenido: [{ tipo: "texto", texto: `Herramienta desconocida o no permitida: ${nombre}` }], esError: true };
      }
      try {
        const resultado = await h.ejecutar(argumentos, ctx);
        return resultado;
      } catch {
        return { contenido: [{ tipo: "texto", texto: "La herramienta falló." }], esError: true };
      }
    },
  };

  return [metaDescubrir, metaDetalle, metaEjecutar];
}
