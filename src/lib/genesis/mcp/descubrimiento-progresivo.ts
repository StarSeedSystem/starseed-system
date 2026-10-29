/**
 * Descubrimiento progresivo de herramientas MCP (patrón Strata de Klavis, con BM25 propio).
 * Contrato: architecture/repos-libreria-1025.md (grupo agentes). Módulo puro: sin node:*.
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

const PALABRAS_VACIAS = new Set([
  "de", "la", "el", "los", "las", "un", "una", "y", "en", "the", "a", "of", "to", "for", "and",
]);

export function tokenizar(texto: string): string[] {
  const partidos = texto.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  const sinTildes = partidos.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return sinTildes.split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !PALABRAS_VACIAS.has(t));
}

export function crearIndiceBm25(
  docs: ReadonlyArray<{ id: string; texto: string }>
): { buscar(consulta: string, limite: number): { id: string; puntuacion: number }[] } {
  const K1 = 1.5;
  const B = 0.75;
  const terminos = docs.map((d) => tokenizar(d.texto));
  const N = docs.length;
  const longitudMedia = N > 0 ? terminos.reduce((s, t) => s + t.length, 0) / N : 0;
  const df = new Map<string, number>();
  for (const termino of new Set(terminos.flat())) {
    let apariciones = 0;
    for (const doc of terminos) if (doc.includes(termino)) apariciones++;
    df.set(termino, apariciones);
  }

  return {
    buscar(consulta, limite) {
      const consultados = [...new Set(tokenizar(consulta))];
      if (consultados.length === 0 || N === 0 || longitudMedia === 0) return [];
      const hallados: { id: string; puntuacion: number }[] = [];
      for (let i = 0; i < N; i++) {
        const doc = terminos[i];
        let puntuacion = 0;
        for (const termino of consultados) {
          let tf = 0;
          for (const t of doc) if (t === termino) tf++;
          if (tf === 0) continue;
          const n = df.get(termino) ?? 0;
          const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
          puntuacion += (idf * (tf * (K1 + 1))) / (tf + K1 * (1 - B + B * (doc.length / longitudMedia)));
        }
        if (puntuacion > 0) hallados.push({ id: docs[i].id, puntuacion });
      }
      hallados.sort((a, b) =>
        b.puntuacion === a.puntuacion ? (a.id < b.id ? -1 : 1) : b.puntuacion - a.puntuacion
      );
      return hallados.slice(0, Math.max(0, Math.floor(limite)));
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
  const visibles = opciones.permitida ? herramientas.filter(opciones.permitida) : herramientas;
  const umbral = opciones.umbral ?? UMBRAL_PROGRESIVO;
  if (visibles.length <= umbral) {
    return opciones.permitida ? visibles : herramientas;
  }

  const medio = opciones.medio ?? "modelo-mediano";
  const perfil = PERFILES_MEDIO[medio];
  const porNombre = new Map<string, HerramientaMcp>(visibles.map((h) => [h.nombre, h] as const));
  const indice = crearIndiceBm25(
    visibles.map((h) => ({
      id: h.nombre,
      texto: [h.nombre, h.descripcion, clavesPropiedades(h.esquema).join(" ")].join(" "),
    }))
  );

  const descubrir: HerramientaMcp = {
    nombre: "descubrir_herramientas",
    descripcion: "Busca herramientas por palabras clave y devuelve las mejores coincidencias.",
    esquema: {
      type: "object",
      properties: { consulta: { type: "string" }, limite: { type: "number" } },
      required: ["consulta"],
    },
    ejecutar: async (args) => {
      const query = typeof args.consulta === "string" ? args.consulta : "";
      if (query.trim() === "") return errorMcp("Falta la consulta de búsqueda.");
      const todas = indice.buscar(query, visibles.length);
      const tope = Math.min(
        typeof args.limite === "number" && args.limite > 0 ? Math.floor(args.limite) : perfil.maxResultados,
        perfil.maxResultados
      );
      const resultados = todas.slice(0, tope).flatMap((r) => {
        const h = porNombre.get(r.id);
        if (!h) return [];
        const item: Record<string, unknown> = {
          nombre: h.nombre,
          descripcion: h.descripcion.slice(0, perfil.maxDescripcion),
        };
        if (perfil.conEsquema) item.esquema = h.esquema;
        return [item];
      });
      if (resultados.length === 0) {
        return textoJson({ resultados: [], sugerencia: "prueba con otras palabras" });
      }
      return textoJson({ resultados, total: todas.length });
    },
  };

  const detalle: HerramientaMcp = {
    nombre: "detalle_herramienta",
    descripcion: "Devuelve descripción y esquema completos de una herramienta descubierta.",
    esquema: { type: "object", properties: { nombre: { type: "string" } }, required: ["nombre"] },
    ejecutar: async (args) => {
      const nombre = typeof args.nombre === "string" ? args.nombre : "";
      const h = porNombre.get(nombre);
      if (!h) return errorMcp(`Herramienta desconocida o no permitida: ${nombre}`);
      return textoJson({ nombre: h.nombre, descripcion: h.descripcion, esquema: h.esquema });
    },
  };

  const ejecutar: HerramientaMcp = {
    nombre: "ejecutar_herramienta",
    descripcion: "Ejecuta una herramienta descubierta con sus argumentos y devuelve su resultado.",
    esquema: {
      type: "object",
      properties: { nombre: { type: "string" }, argumentos: { type: "object" } },
      required: ["nombre"],
    },
    ejecutar: async (args, ctx) => {
      const nombre = typeof args.nombre === "string" ? args.nombre : "";
      const h = porNombre.get(nombre);
      const argumentos =
        typeof args.argumentos === "object" && args.argumentos !== null
          ? (args.argumentos as Record<string, unknown>)
          : {};
      // Una metaherramienta nunca se cura ejecutándose a sí misma por esta puerta.
      if (!h || (METAHERRAMIENTAS as readonly string[]).includes(nombre)) {
        return errorMcp(`Herramienta desconocida o no permitida: ${nombre}`);
      }
      try {
        return await h.ejecutar(argumentos, ctx);
      } catch {
        return errorMcp("La herramienta falló.");
      }
    },
  };

  return [descubrir, detalle, ejecutar];
}

function clavesPropiedades(esquema: Record<string, unknown>): string[] {
  const props = esquema.properties;
  return typeof props === "object" && props !== null ? Object.keys(props) : [];
}

function textoJson(valor: unknown) {
  return { contenido: [{ tipo: "texto" as const, texto: JSON.stringify(valor) }] };
}

function errorMcp(mensaje: string) {
  return { contenido: [{ tipo: "texto" as const, texto: mensaje }], esError: true };
}
