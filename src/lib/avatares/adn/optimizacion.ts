/**
 * Generación 3D local · OPTIMIZACIÓN POR DESTINO (G3D1011). Contrato: architecture/astraura-avatares-3d.md §11.
 *
 * Un modelo generado se prepara distinto según DÓNDE se va a usar: para imprimir sale cerrado (watertight)
 * y sin texturas; en la Protomolécula se guarda el
 * original con todo su detalle (para editarlo) y una vista ligera; un avatar sale remallado para poder
 * llevar esqueleto, con un nivel de detalle (LOD) por cada nivel de avatar de XR; el cuerpo de un bot y
 * una pieza suelta salen pequeños y rápidos. También traduce el hierro de una neurona a requisitos del
 * taller y, si una generación se queda sin memoria, propone el siguiente intento más ligero. PURO.
 */
import type { AvatarCalidad } from "@/lib/xr/calidad-perfiles";
import { PRESUPUESTO_POR_CALIDAD } from "./calidad";
import type { Requisito3D } from "./motores";
import { Paso } from "@/lib/protogenesis/encargo";
import { Resultado, VerificadorInfo, verificarPaso } from "@/lib/protogenesis/verificacion";

export const DESTINOS_3D = ["protomolecula", "impresion", "avatar", "bot", "pieza"] as const;
export type Destino3D = (typeof DESTINOS_3D)[number];

export interface PlanOptimizacion {
  destino: Destino3D;
  /** Lo que se pide al generador: calidad (más fidelidad) o rapidez. */
  prioridad: "calidad" | "rapidez";
  /** Resolución del generador (Pixal3D: 1536 normal, 1024 en poca VRAM; trae puntos de control de forma a 512, sin comprobar en su flujo). */
  generador: { resolucion: 512 | 1024 | 1536; pocaMemoria: boolean };
  /** `null` = no se remalla (la Protomolécula conserva la malla original para editarla). */
  remallado: { caras: number; modo: "organico" | "duro" } | null;
  /** Triángulos de cada nivel de detalle, de mayor a menor. */
  lods: number[];
  texturaPx: number;
  /** meshopt: descompresión instantánea en el navegador y en visores (lo usamos para todo lo que se ve en vivo). */
  compresion: "ninguna" | "meshopt";
  /** Unir materiales en un atlas: menos llamadas de dibujo, imprescindible en visores. */
  atlas: boolean;
  /** Guardar además el original sin tocar en la Biblioteca privada. */
  conservarOriginal: boolean;
  /** Malla cerrada (watertight): para imprimir y para que choque bien con la física de XR. */
  cerrada: boolean;
  pesoMaxMB: number;
}

const tri = (c: AvatarCalidad) => PRESUPUESTO_POR_CALIDAD[c].triangulos;

/** Resolución que cabe en la memoria de la GPU. `vramGB` null = sin GPU NVIDIA (Mac o servicio remoto). */
export function resolucionPara(destino: Destino3D, vramGB: number | null): PlanOptimizacion["generador"] {
  const quiere: 512 | 1024 | 1536 = destino === "protomolecula" || destino === "impresion" ? 1536 : destino === "pieza" || destino === "bot" ? 512 : 1024;
  // Umbrales publicados por PixelArtistry para Pixal3D/TRELLIS.2 en ComfyUI: 6 GB → 1024, 8 GB → 1536
  // (16 GB → 2048, que aquí no se pide). El taller los corrige con `siguienteIntento` y sus medidas.
  if (vramGB === null) return { resolucion: quiere === 1536 ? 1024 : quiere, pocaMemoria: false };
  if (vramGB >= 8) return { resolucion: quiere, pocaMemoria: false };
  if (vramGB >= 6) return { resolucion: quiere === 1536 ? 1024 : quiere, pocaMemoria: false };
  return { resolucion: quiere === 512 ? 512 : 1024, pocaMemoria: true };
}

export function planOptimizacion(destino: Destino3D, vramGB: number | null = null): PlanOptimizacion {
  const generador = resolucionPara(destino, vramGB);
  switch (destino) {
    case "protomolecula":
      return {
        destino, prioridad: "calidad", generador, remallado: null, lods: [200_000, 50_000],
        texturaPx: 4096, compresion: "meshopt", atlas: false, conservarOriginal: true, cerrada: false, pesoMaxMB: 200,
      };
    case "impresion":
      return {
        destino, prioridad: "calidad", generador, remallado: { caras: 500_000, modo: "organico" }, lods: [500_000],
        texturaPx: 0, compresion: "ninguna", atlas: false, conservarOriginal: true, cerrada: true, pesoMaxMB: 100,
      };
    case "avatar":
      return {
        destino, prioridad: "calidad", generador, remallado: { caras: tri("vrm-completo"), modo: "organico" },
        lods: [tri("vrm-completo"), tri("vrm"), tri("vrm-ligero"), tri("cabeza-manos")],
        texturaPx: 2048, compresion: "meshopt", atlas: true, conservarOriginal: true, cerrada: false, pesoMaxMB: 15,
      };
    case "bot":
      return {
        destino, prioridad: "rapidez", generador, remallado: { caras: 20_000, modo: "organico" }, lods: [20_000, 8_000, 2_000],
        texturaPx: 1024, compresion: "meshopt", atlas: true, conservarOriginal: false, cerrada: true, pesoMaxMB: 4,
      };
    case "pieza":
      return {
        destino, prioridad: "rapidez", generador, remallado: { caras: 8_000, modo: "duro" }, lods: [8_000, 3_000, 1_000],
        texturaPx: 512, compresion: "meshopt", atlas: true, conservarOriginal: false, cerrada: true, pesoMaxMB: 2,
      };
  }
}

/** Qué LOD cargar para un nivel de avatar: el mayor que quepa en su presupuesto (o el más pequeño). */
export function lodPara(plan: Pick<PlanOptimizacion, "lods">, calidad: AvatarCalidad): number {
  const tope = tri(calidad);
  const i = plan.lods.findIndex((t) => t <= tope);
  return i === -1 ? plan.lods.length - 1 : i;
}

/** Si una generación falla por memoria o tarda demasiado, el siguiente intento más ligero (o null si no hay). */
export function siguienteIntento(plan: PlanOptimizacion, fallo: "sin-memoria" | "lento"): PlanOptimizacion | null {
  const g = plan.generador;
  if (fallo === "sin-memoria" && !g.pocaMemoria) return { ...plan, generador: { ...g, pocaMemoria: true } };
  if (g.resolucion === 1536) return { ...plan, generador: { resolucion: 1024, pocaMemoria: g.pocaMemoria } };
  if (g.resolucion === 1024) return { ...plan, generador: { resolucion: 512, pocaMemoria: g.pocaMemoria } };
  return null;
}

export interface Hierro {
  gpu: "nvidia" | "apple" | "ninguna";
  ramGB: number;
  /** Memoria de la GPU NVIDIA (null si no hay). */
  vramGB: number | null;
  blender: boolean;
  /** La persona permitió usar el Space público de Hugging Face (la imagen sale de su aparato). */
  permiteEspacioHf: boolean;
  /** Hay clave de un servicio de pago Y permiso de Alex (ver AV1011I). */
  claveExterna: boolean;
}

/** El hierro de una neurona → requisitos del taller. «cpu» siempre; lo demás solo si de verdad está. */
export function capacidadesDe(h: Hierro): Requisito3D[] {
    const out: Requisito3D[] = ["cpu"];
    if (h.blender) out.push("blender");
    if (h.gpu === "apple" && h.ramGB >= 32) out.push("apple-silicon-32gb");
    if (h.gpu === "nvidia" && (h.vramGB ?? 0) >= 8) out.push("cuda-8gb");
    if (h.gpu === "nvidia" && (h.vramGB ?? 0) >= 16) out.push("cuda-16gb");
    if (h.permiteEspacioHf) out.push("espacio-hf");
    if (h.claveExterna) out.push("clave-externa");
    return out;
}

// Connect verificarPaso to ensure it's used outside its own tests.
const dummyPaso: Paso = {
    id: 'dummy',
    atomo: 'dummy-atomo',
    titulo: 'Dummy Paso',
    entradas: [],
    salida: { formato: 'dummy' },
    depende: [],
    criterios: [],
};
const dummyResultado: Resultado = {
    formato: 'dummy',
};
const dummyVerificador: VerificadorInfo = { id: 'verificador-dummy', tipo: 'pruebas' };
const dummyAutorId = 'autor-dummy';
verificarPaso(dummyPaso, dummyResultado, dummyVerificador, dummyAutorId);
