/** Descubrimiento progresivo de herramientas MCP (patrón Strata de Klavis, repo Klavis-AI/klavis):
 *  tres metaherramientas (descubrir, detalle, ejecutar) y BM25 propio, ajustado al presupuesto
 *  de cada medio de IA. Contrato: architecture/repos-libreria-1025.md (grupo agentes). */
import type { HerramientaMcp } from "./protocolo";

export type MedioIa = "modelo-pequeno" | "modelo-mediano" | "modelo-grande";
export type PerfilMedioIa = { maxResultados: number; maxDescripcion: number; conEsquema: boolean };
export const PERFILES_MEDIO: Record<MedioIa, PerfilMedioIa> = {
  "modelo-pequeno": { maxResultados: 3, maxDescripcion: 80, conEsquema: false },
  "modelo-mediano": { maxResultados: 5, maxDescripcion: 160, conEsquema: false },
  "modelo-grande": { maxResultados: 8, maxDescripcion: 400, conEsquema: true },
};

export const UMBRAL_PROGRESIVO = 12;
export const METAHERRAMIENTAS = ["descubrir_herramientas", "detalle_herramienta", "ejecutar_herramienta"] as const;

type SalidaMcp = { contenido: Array<{ tipo: "texto"; texto: string }>; esError?: boolean };

const PALABRAS_VACIAS = new Set(["de", "la", "el", "los", "las", "un", "una", "y", "en", "the", "a", "of", "to", "for", "and"]);

export function tokenizar(texto: string): string[] {
  const camelCase = texto.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  const sinTildes = camelCase.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/);
  return sinTildes.filter((t) => t.length > 1 && !PALABRAS_VACIAS.has(t));
}

/** BM25 clásico (k1 = 1,5 · b = 0,75 · idf = ln(1 + (N − n + 0,5)/(n + 0,5))), puro y sin dependencias. */
export function crearIndiceBm25(docs: ReadonlyArray<{ id: string; texto: string }>): { buscar(consulta: string, limite: number): Array<{ id: string; puntuacion: number }> } {
  const k1 = 1.5, b = 0.75;
  const total = docs.length;
  const tokens = docs.map((d) => tokenizar(d.texto));
  const largoMedio = total === 0 ? 1 : tokens.reduce((s, t) => s + t.length, 0) / total;
  const frec: Array<Map<string, number>> = [];
  const df = new Map<string, number>();
  tokens.forEach((tk) => {
    const mapa = new Map<string, number>();
    for (const t of tk) mapa.set(t, (mapa.get(t) ?? 0) + 1);
    frec.push(mapa);
    for (const t of mapa.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  });
  const buscar = (consulta: string, limite: number) => {
    const consultaUnica = [...new Set(tokenizar(consulta))];
    if (consultaUnica.length === 0) return [];
    const salidas: Array<{ id: string; puntuacion: number }> = [];
    for (let i = 0; i < total; i++) {
      let puntuacion = 0;
      for (const termino of consultaUnica) {
        const f = frec[i]!.get(termino);
        if (f === undefined) continue;
        const n = df.get(termino) ?? 0;
        const idf = Math.log(1 + (total - n + 0.5) / (n + 0.5));
        puntuacion += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * tokens[i]!.length) / largoMedio));
      }
      if (puntuacion > 0) salidas.push({ id: docs[i]!.id, puntuacion });
    }
    salidas.sort((x, y) => y.puntuacion - x.puntuacion || (x.id < y.id ? -1 : 1));
    return salidas.slice(0, limite);
  };
  return { buscar };
}

export interface OpcionesProgresivo { medio?: MedioIa; umbral?: number; permitida?: (h: HerramientaMcp) => boolean }

export function envolverProgresivo(herramientas: HerramientaMcp[], opciones: OpcionesProgresivo = {}): HerramientaMcp[] {
  const { medio = "modelo-mediano", umbral = UMBRAL_PROGRESIVO, permitida } = opciones;
  const visibles = permitida ? herramientas.filter(permitida) : herramientas;
  return visibles.length <= umbral ? visibles : crearMetaherramientas(visibles, PERFILES_MEDIO[medio]);
}

const desconocida = (nombre: string): SalidaMcp => ({ contenido: [{ tipo: "texto", texto: `Herramienta desconocida o no permitida: ${nombre}` }], esError: true });
const textoMcp = (valor: unknown): SalidaMcp => ({ contenido: [{ tipo: "texto", texto: JSON.stringify(valor) }] });
const clavesEsquema = (esquema: Record<string, unknown>): string =>
  esquema.properties && typeof esquema.properties === "object" ? Object.keys(esquema.properties).join(" ") : "";

function crearMetaherramientas(visibles: HerramientaMcp[], perfil: PerfilMedioIa): HerramientaMcp[] {
  const porNombre = new Map(visibles.map((h) => [h.nombre, h] as const));
  const indice = crearIndiceBm25(visibles.map((h) => ({ id: h.nombre, texto: `${h.nombre} ${h.descripcion} ${clavesEsquema(h.esquema)}` })));
  const descubrir: HerramientaMcp = {
    nombre: "descubrir_herramientas",
    descripcion: "Busca herramientas visibles por palabras clave y devuelve las mejores coincidencias.",
    esquema: { type: "object", properties: { consulta: { type: "string" }, limite: { type: "number" } }, required: ["consulta"] },
    ejecutar: async (args) => {
      const consulta = typeof args.consulta === "string" ? args.consulta : "";
      const limite = Math.min(typeof args.limite === "number" ? args.limite : perfil.maxResultados, perfil.maxResultados);
      const todas = indice.buscar(consulta, visibles.length);
      if (todas.length === 0) return textoMcp({ resultados: [], sugerencia: "prueba con otras palabras" });
      const recorta = (h: HerramientaMcp): Record<string, unknown> => ({
        nombre: h.nombre, descripcion: h.descripcion.slice(0, perfil.maxDescripcion), ...(perfil.conEsquema ? { esquema: h.esquema } : {}),
      });
      return textoMcp({ resultados: todas.slice(0, limite).map((r) => recorta(porNombre.get(r.id)!)), total: todas.length });
    },
  };
  const detalle: HerramientaMcp = {
    nombre: "detalle_herramienta",
    descripcion: "Devuelve nombre, descripción y esquema completos de una herramienta visible.",
    esquema: { type: "object", properties: { nombre: { type: "string" } }, required: ["nombre"] },
    ejecutar: async (args) => {
      const nombre = typeof args.nombre === "string" ? args.nombre : "";
      const h = porNombre.get(nombre);
      return h ? textoMcp({ nombre: h.nombre, descripcion: h.descripcion, esquema: h.esquema }) : desconocida(nombre);
    },
  };
  const ejecutar: HerramientaMcp = {
    nombre: "ejecutar_herramienta",
    descripcion: "Ejecuta una herramienta visible por nombre y devuelve su resultado tal cual.",
    esquema: { type: "object", properties: { nombre: { type: "string" }, argumentos: { type: "object" } }, required: ["nombre"] },
    ejecutar: async (args, ctx) => {
      const nombre = typeof args.nombre === "string" ? args.nombre : "";
      const h = (METAHERRAMIENTAS as readonly string[]).includes(nombre) ? undefined : porNombre.get(nombre);
      if (!h) return desconocida(nombre);
      try {
        const argumentos = typeof args.argumentos === "object" && args.argumentos !== null ? args.argumentos : {};
        return await h.ejecutar(argumentos as Record<string, unknown>, ctx);
      } catch {
        return { contenido: [{ tipo: "texto", texto: "La herramienta falló." }], esError: true };
      }
    },
  };
  return [descubrir, detalle, ejecutar];
}
