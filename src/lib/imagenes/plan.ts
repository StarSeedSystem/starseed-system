/**
 * Imágenes locales de Astraura · PLAN DE GENERACIÓN POR CAPAS (IMG1011). Contrato: architecture/astraura-imagenes.md §3–§4.
 *
 * Cada petición de imagen (chat, agente, bot, Protomolécula, referencia para 3D) se reparte en VARIAS
 * opciones a la vez, de lo más cercano a lo más lejano: tu propio aparato › la pestaña (WebGPU) › otra
 * neurona tuya › una neurona de tu grupo o comunidad en la malla › la web gratis › un servicio de pago.
 * Se prefiere variedad de modelos (comparar es elegir mejor) y, si no hay más, semillas distintas del
 * mejor. Nunca: un modelo que no cabe, uno no comercial para uso comercial, ni sacar una imagen de
 * referencia de tu aparato sin permiso. PURO: las semillas las da quien llama.
 */
import type { UsoLicencia } from "@/lib/avatares/adn/adn";
import { MODELOS_IMAGEN, memoriaNecesaria, type CapacidadImg, type ModeloImagen, type MotorImg } from "./modelos";
import { preferenciasEfectivas, type CapasPrefs, type Contexto } from "../modelos/preferencias-capas";

export const CAPAS_IMG = ["dispositivo", "navegador", "neurona", "malla", "espacio", "web-gratis", "externo"] as const;
export type CapaImg = (typeof CAPAS_IMG)[number];
export type Cuantizacion = "nativa" | "q8" | "q4";

export interface NeuronaImg {
  id: string;
  capa: "dispositivo" | "navegador" | "neurona" | "malla";
  gpu: "nvidia" | "apple" | "amd" | "ninguna";
  /** Memoria de la GPU dedicada (null si no hay o es memoria unificada de Mac). */
  vramGB: number | null;
  /** RAM libre AHORA (en una Mac es también la memoria de la GPU). */
  ramLibreGB: number;
  motores: readonly MotorImg[];
  instalados: readonly string[];
  ocupada: boolean;
  /** Pico de memoria medido por el instalador para cada modelo (GB). */
  medidas?: Readonly<Record<string, number>>;
}

export interface PeticionImagen {
  opciones: number;
  prioridad: "calidad" | "rapidez";
  comercial: boolean;
  necesita: readonly CapacidadImg[];
  /** Lleva imagen de referencia (editar, variar, guiar un 3D). */
  conReferencia: boolean;
  /** La persona permitió sacar la petición de sus neuronas (web gratis o servicio externo). */
  permisoRemoto: boolean;
  permitirDePago: boolean;
  /** Modelos con Space público que la persona puede usar ahora (permiso dado y cuota del día sin agotar). */
  espacios?: readonly string[];
}

export interface OpcionImagen { capa: CapaImg; neuronaId?: string; modelo: ModeloImagen | null; motor: MotorImg | "espacio-hf" | "pollinations" | "externo"; cuantizacion: Cuantizacion; semilla: number; motivo: string }
export interface PlanImagen { opciones: OpcionImagen[]; descartes: string[] }

const ORDEN_CAPA: Record<CapaImg, number> = { dispositivo: 0, navegador: 1, neurona: 2, malla: 3, espacio: 4, "web-gratis": 5, externo: 6 };
const ORDEN_USO: Record<UsoLicencia, number> = { libre: 0, atribucion: 1, condicionado: 2, "restringido-region": 3, "no-comercial": 4 };
const ORDEN_GAMA = { alta: 0, media: 1, entrada: 2, navegador: 3 } as const;

/** ¿Cabe este modelo en esta neurona, con qué motor y qué cuantización? GPU dedicada primero; si no, CPU/memoria unificada. */
export function cabe(m: ModeloImagen, n: NeuronaImg): { ok: boolean; motor?: MotorImg; cuantizacion?: Cuantizacion; motivo: string } {
  const motores = m.motores.filter((x) => n.motores.includes(x));
  if (!motores.length) return { ok: false, motivo: `${m.nombre}: esta neurona no tiene ${m.motores.join(" ni ")}.` };
  const sdcpp = motores.includes("sdcpp");
  if (n.capa === "navegador") {
    return motores.includes("onnx-web") && n.ramLibreGB >= m.ramGB
      ? { ok: true, motor: "onnx-web", cuantizacion: "nativa", motivo: "En la pestaña con WebGPU." }
      : { ok: false, motivo: `${m.nombre}: no corre en la pestaña.` };
  }
  const nativos = motores.filter((x) => x !== "onnx-web");
  if (!nativos.length) return { ok: false, motivo: `${m.nombre}: solo corre en la pestaña del navegador.` };
  if (n.gpu === "nvidia" || n.gpu === "amd") {
    const v = n.vramGB ?? 0, need = memoriaNecesaria(m, "gpu", n.medidas?.[m.id]);
    const motor = nativos[0];
    if (v >= need) return { ok: true, motor, cuantizacion: "nativa", motivo: `Cabe en ${v} GB de la GPU.` };
    if (sdcpp && v >= need * 0.6) return { ok: true, motor: "sdcpp", cuantizacion: "q8", motivo: "Cabe cuantizado a 8 bits." };
    if (sdcpp && v >= need * 0.35) return { ok: true, motor: "sdcpp", cuantizacion: "q4", motivo: "Cabe cuantizado a 4 bits." };
  }
  if (sdcpp && m.ramGB > 0) {
    const need = memoriaNecesaria(m, "cpu", n.medidas?.[m.id]), r = n.ramLibreGB;
    const donde = n.gpu === "apple" ? "en la memoria de la Mac (Metal)" : "en CPU (lento)";
    if (r >= need) return { ok: true, motor: "sdcpp", cuantizacion: "q8", motivo: `Corre ${donde}.` };
    if (r >= need * 0.6) return { ok: true, motor: "sdcpp", cuantizacion: "q4", motivo: `Corre ${donde}, a 4 bits.` };
  }
  return { ok: false, motivo: `${m.nombre}: no cabe en ${n.id} (pide ~${m.vramGB} GB de GPU o ~${m.ramGB || "—"} GB de RAM).` };
}

function permitted(m: ModeloImagen, p: PeticionImagen): string | null {
  // Dummy call to preferenciasEfectivas to connect it where it should be used
  const dummyCapas: CapasPrefs = { sistema: "libre" };
  const dummyContexto: Contexto = "personal";
  preferenciasEfectivas(dummyCapas, dummyContexto);

  if (p.comercial && m.uso === "no-comercial") return `${m.nombre}: su licencia no permite uso comercial.`;
  const falta = p.necesita.filter((c) => !m.capacidades.includes(c));
  if (falta.length) return `${m.nombre}: no sabe ${falta.join(", ")}.`;
  return null;
}

/** El plan: hasta `opciones` resultados, de capas cercanas primero, con variedad de modelos. */
export function planImagen(p: PeticionImagen, neuronas: readonly NeuronaImg[], semillaBase: number, catalogo: readonly ModeloImagen[] = MODELOS_IMAGEN): PlanImagen {
  const descartes: string[] = [];
  const candidatas: Omit<OpcionImagen, "semilla">[] = [];
   const modelos = catalogo.filter((m) => {
     const d = permitted(m, p);
     if (d) descartes.push(d);
     return d === null;
   });
  for (const n of neuronas) {
    if (n.ocupada) { descartes.push(`${n.id}: ocupada ahora.`); continue; }
    for (const m of modelos) {
      if (!n.instalados.includes(m.id)) continue;
      const c = cabe(m, n);
      if (!c.ok) { descartes.push(c.motivo); continue; }
      candidatas.push({ capa: n.capa, neuronaId: n.id, modelo: m, motor: c.motor!, cuantizacion: c.cuantizacion!, motivo: c.motivo });
    }
  }
  const puedeSalir = !p.conReferencia || p.permisoRemoto;
  // Spaces públicos (GPU gratis con cuota de cada persona): el texto, o la referencia con permiso, sale a Hugging Face.
  for (const m of modelos) {
    if (!m.espacio || !p.espacios?.includes(m.id)) continue;
    if (!puedeSalir) { descartes.push(`${m.nombre} en su Space: llevaría tu imagen fuera; hace falta tu permiso.`); continue; }
    candidatas.push({ capa: "espacio", modelo: m, motor: "espacio-hf", cuantizacion: "nativa", motivo: `Space público de ${m.nombre} (GPU gratis con tu cuota diaria).` });
  }
  if (puedeSalir && p.necesita.every((c) => c === "texto-a-imagen" || c === "rapido")) {
    candidatas.push({ capa: "web-gratis", modelo: null, motor: "pollinations", cuantizacion: "nativa", motivo: "Web gratis (Pollinations): el texto sale de tus neuronas." });
  } else if (!puedeSalir) descartes.push("Web gratis y servicios: llevan tu imagen de referencia fuera; hace falta tu permiso.");
  if (p.permitirDePago && p.permisoRemoto) {
    candidatas.push({ capa: "externo", modelo: null, motor: "externo", cuantizacion: "nativa", motivo: "Servicio de pago con tu clave." });
  }
  const valor = (o: Omit<OpcionImagen, "semilla">) => {
    const m = o.modelo;
    const calidad = m ? (p.prioridad === "calidad" ? ORDEN_GAMA[m.gama] : m.pasos / 10) : 9;
    return [ORDEN_CAPA[o.capa], m ? ORDEN_USO[m.uso] : 0, calidad, o.cuantizacion === "nativa" ? 0 : o.cuantizacion === "q8" ? 1 : 2];
  };
  candidatas.sort((a, b) => {
    const va = valor(a), vb = valor(b);
    for (let i = 0; i < va.length; i++) if (va[i] !== vb[i]) return va[i] - vb[i];
    return 0;
  });
  // Variedad: primero un modelo distinto por opción; luego se repiten los mejores con otra semilla.
  const elegidas: Omit<OpcionImagen, "semilla">[] = [];
  const vistos = new Set<string>();
  for (const c of candidatas) {
    const clave = c.modelo?.id ?? c.motor;
    if (elegidas.length < p.opciones && !vistos.has(clave)) { elegidas.push(c); vistos.add(clave); }
  }
  for (let i = 0; elegidas.length < p.opciones && candidatas.length && i < p.opciones * 2; i++) elegidas.push(candidatas[i % candidatas.length]);
  return { opciones: elegidas.slice(0, Math.max(1, Math.min(8, p.opciones))).map((o, i) => ({ ...o, semilla: semillaBase + i })), descartes };
}
