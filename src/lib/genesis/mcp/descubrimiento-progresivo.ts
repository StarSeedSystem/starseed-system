/**
 * MCP autoadaptable: descubrimiento progresivo (patrón Strata de Klavis, AGT1025B).
 * En vez de volcar TODAS las herramientas al modelo (un modelo pequeño pierde el
 * contexto), expone metaherramientas que descubren el resto por palabras clave.
 * Puro: sin red, disco ni reloj. Adapta el contrato de repos-libreria-1025 §4.8.
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
const VACIAS = new Set(["de", "la", "el", "los", "las", "un", "una", "y", "en", "the", "a", "of", "to", "for", "and"]);

/** Separa camelCase ANTES de minúsculas; quita tildes con NFD; parte por todo lo no [a-z0-9]. */
export function tokenizar(texto: string): string[] {
  return texto
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !VACIAS.has(t));
}

/** BM25 clásico: k1 1,5 · b 0,75 · idf ln(1 + (N−n+0,5)/(n+0,5)), consulta sin repetir términos. */
export function crearIndiceBm25(docs: ReadonlyArray<{ id: string; texto: string }>): {
  buscar(consulta: string, limite: number): { id: string; puntuacion: number }[];
} {
  const K1 = 1.5, B = 0.75;
  const tokens = docs.map((d) => tokenizar(d.texto));
  const freq = tokens.map((ts) => ts.reduce((f, t) => f.set(t, (f.get(t) ?? 0) + 1), new Map<string, number>()));
  const df = new Map<string, number>();
  for (const f of freq) for (const t of f.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const N = docs.length;
  const tamMedio = tokens.reduce((s, ts) => s + ts.length, 0) / Math.max(N, 1);
  return {
    buscar(consulta: string, limite: number) {
      if (docs.length === 0) return [];
      const terminos = Array.from(new Set(tokenizar(consulta)));
      if (terminos.length === 0) return [];
      const salida: { id: string; puntuacion: number }[] = [];
      for (let i = 0; i < N; i++) {
        let puntuacion = 0;
        for (const t of terminos) {
          const tf = freq[i].get(t);
          if (!tf) continue;
          const n = df.get(t) ?? 0;
          puntuacion += Math.log(1 + (N - n + 0.5) / (n + 0.5)) * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * tokens[i].length) / tamMedio)));
        }
        if (puntuacion > 0) salida.push({ id: docs[i].id, puntuacion });
      }
      salida.sort((x, y) => y.puntuacion - x.puntuacion || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
      return salida.slice(0, Math.max(limite, 0));
    },
  };
}

export interface OpcionesProgresivo { medio?: MedioIa; umbral?: number; permitida?: (h: HerramientaMcp) => boolean }
const DESCONOCIDA = (nombre: string) => ({ contenido: [{ tipo: "texto" as const, texto: `Herramienta desconocida o no permitida: ${nombre}` }], esError: true });
/** Índice construido una vez: nombre + descripción + claves de esquema.properties. */
function textoIndice(h: HerramientaMcp): string {
  const props = (h.esquema as { properties?: Record<string, unknown> } | null | undefined)?.properties;
  const claves = props && typeof props === "object" ? Object.keys(props).join(" ") : "";
  return [h.nombre, h.descripcion, claves].filter((p) => p.length > 0).join(" ");
}

export function envolverProgresivo(herramientas: HerramientaMcp[], opciones?: OpcionesProgresivo): HerramientaMcp[] {
  const visibles = herramientas.filter(opciones?.permitida ?? (() => true));
  if (visibles.length <= (opciones?.umbral ?? UMBRAL_PROGRESIVO)) return visibles;
  const perfil = PERFILES_MEDIO[opciones?.medio ?? "modelo-mediano"];
  const porNombre = new Map(visibles.map((h) => [h.nombre, h]));
  const indice = crearIndiceBm25(visibles.map((h) => ({ id: h.nombre, texto: textoIndice(h) })));
  const descubrir: HerramientaMcp = {
    nombre: "descubrir_herramientas",
    descripcion: "Descubre herramientas visibles por palabras clave; usa detalle_herramienta antes de ejecutar.",
    esquema: { type: "object", properties: { consulta: { type: "string" }, limite: { type: "number" } }, required: ["consulta"] },
    ejecutar: async (args) => {
      const consulta = typeof args.consulta === "string" ? args.consulta : "";
      if (consulta.length === 0) return { contenido: [{ tipo: "texto", texto: "Falta la consulta." }], esError: true };
      const bruto = typeof args.limite === "number" && Number.isFinite(args.limite) && args.limite > 0 ? args.limite : perfil.maxResultados;
      const halladas = indice.buscar(consulta, Math.min(bruto, perfil.maxResultados)).map((r) => {
        const h = porNombre.get(r.id);
        if (!h) throw new Error("Resultado fuera del índice");
        const base: { nombre: string; descripcion: string; esquema?: Record<string, unknown> } = { nombre: r.id, descripcion: h.descripcion.slice(0, perfil.maxDescripcion), ...(perfil.conEsquema ? { esquema: h.esquema } : {}) };
        return base;
      });
      const cuerpo: Record<string, unknown> = { resultados: halladas, total: visibles.length };
      if (halladas.length === 0) cuerpo.sugerencia = "prueba con otras palabras";
      return { contenido: [{ tipo: "texto", texto: JSON.stringify(cuerpo) }] };
    },
  };
  const detalle: HerramientaMcp = {
    nombre: "detalle_herramienta",
    descripcion: "Da la descripción y el esquema completos de una herramienta visible por su nombre.",
    esquema: { type: "object", properties: { nombre: { type: "string" } }, required: ["nombre"] },
    ejecutar: async (args) => {
      const h = typeof args.nombre === "string" ? porNombre.get(args.nombre) : undefined;
      if (!h) return DESCONOCIDA(String(args.nombre));
      return { contenido: [{ tipo: "texto", texto: JSON.stringify({ nombre: h.nombre, descripcion: h.descripcion, esquema: h.esquema }) }] };
    },
  };
  const ejecutar: HerramientaMcp = {
    nombre: "ejecutar_herramienta",
    descripcion: "Ejecuta una herramienta visible por nombre con sus argumentos.",
    esquema: { type: "object", properties: { nombre: { type: "string" }, argumentos: { type: "object" } }, required: ["nombre"] },
    ejecutar: async (args, ctx) => {
      const h = typeof args.nombre === "string" ? porNombre.get(args.nombre) : undefined;
      if (!h || (METAHERRAMIENTAS as readonly string[]).includes(String(args.nombre))) return DESCONOCIDA(String(args.nombre));
      const argumentos = typeof args.argumentos === "object" && args.argumentos !== null ? (args.argumentos as Record<string, unknown>) : {};
      try { return await h.ejecutar(argumentos, ctx); } catch { return { contenido: [{ tipo: "texto", texto: "La herramienta falló." }], esError: true }; }
    },
  };
  return [descubrir, detalle, ejecutar];
}
