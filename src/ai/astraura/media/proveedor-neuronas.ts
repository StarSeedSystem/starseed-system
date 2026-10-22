"use client";

/**
 * Astraura · proveedor «neuronas» de media-gen (IMG1011B). Contrato: architecture/astraura-imagenes.md §3–§6.
 *
 * Genera VARIAS opciones de imagen a la vez repartiendo el trabajo por capas: tu propio aparato, la
 * pestaña (WebGPU), tus otras neuronas y la malla; la web gratis (Pollinations) es el suelo que nunca
 * falta (regla de oro de media-gen). El reparto lo decide el núcleo puro `planImagen`
 * (src/lib/imagenes/plan.ts); aquí solo se RECOLECTAN las neuronas con sus capacidades, se ejecuta cada
 * opción contra su servicio local (IMG1011A) y se sustituyen las que fallan por la siguiente del plan.
 *
 * Honestidad («basta de ilusiones»): lo que no corre aquí se dice por qué en `descartes` (el servicio
 * de imágenes de una neurona no está encendido, la pestaña no tiene el generador WebGPU registrado,
 * los Spaces de Hugging Face aún no se llaman desde aquí). Nunca se instala ni se descarga nada, nunca
 * se sondea Supabase (las capacidades llegan con el latido de `listNeurons`, con su caché de 5 min).
 *
 * La capa «malla» (RTIMG1011F) corre por el RELÉ `capacidad.*` (§6 de `architecture/apps-en-la-malla.md`):
 * un `capacidad.pedir` tipo «imagen» a la neurona elegida del plan, por el espacio `CAPACIDAD_MALLA_NS`
 * con el tope `CAPACIDAD_MALLA_MAX_BYTES`. El cliente del relé (`pedirCapacidad`, de
 * `src/lib/network/capacidad-por-malla.ts`) valida con `esMensajeCapacidadMalla`,
 * lee con `parseCapacidadMallaMensaje` y reensambla los `capacidad.trozo` con
 * `unirTrozosOrdenados` (llegan en desorden). La ejecución va en
 * `src/lib/imagenes/adaptadores/malla-imagenes.ts` (`pedirGeneracionMalla`); sin servidores de
 * capacidad detrás (tarea F, «servir capacidades») el pedido falla con su motivo y la galería
 * sustituye esa opción por la siguiente: el relé es un candidato, no un contrato.
 */
import { planImagen, type CapaImg, type NeuronaImg, type OpcionImagen, type PeticionImagen } from "@/lib/imagenes/plan";
import { modeloPorId, MOTORES_IMG, type CapacidadImg, type MotorImg } from "@/lib/imagenes/modelos";
import type { UsoLicencia } from "@/lib/avatares/adn/adn";

/** Una opción de la galería que ve la Protomolécula: de dónde salió, con qué licencia y cuánto tardó. */
export interface OpcionGaleria {
  url?: string;
  /** Referencia al archivo cuando la sirve otra neurona (todavía sin traer). */
  ref?: string;
  modelo: string | null;
  capa: CapaImg;
  neurona?: string;
  semilla: number;
  licencia: string;
  uso: UsoLicencia | "libre";
  atribucion: string;
  segundos: number;
}

export interface GaleriaImagenes {
  ok: boolean;
  opciones: OpcionGaleria[];
  descartes: string[];
  error?: string;
}

/** Capacidades de imagen que publica cada neurona en su ficha (`capabilities.imagenes`, IMG1011A). */
export interface CapacidadImagenesNeurona {
  endpoint?: string;
  modelos: string[];
  motores: MotorImg[];
  ocupada: boolean;
  vramGB: number | null;
  ramLibreGB: number;
  medidas?: Record<string, number>;
}

/** Lee defensivamente `capabilities.imagenes` de una ficha de neurona. Sin sección ⇒ la neurona no sirve imágenes. */
export function leerCapacidadImagenes(capabilities: unknown): CapacidadImagenesNeurona | null {
  if (!capabilities || typeof capabilities !== "object") return null;
  const sec = (capabilities as Record<string, unknown>).imagenes;
  if (!sec || typeof sec !== "object") return null;
  const s = sec as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);
  const modelos = Array.isArray(s.modelos) ? s.modelos.filter((m): m is string => typeof m === "string" && !!m) : [];
  const motores = (Array.isArray(s.motores) ? s.motores : []).filter((m): m is MotorImg =>
    typeof m === "string" && (MOTORES_IMG as readonly string[]).includes(m));
  const medidas: Record<string, number> = {};
  if (s.medidas && typeof s.medidas === "object") {
    for (const [k, v] of Object.entries(s.medidas as Record<string, unknown>)) {
      const n = numero(v);
      if (k && n) medidas[k] = n;
    }
  }
  return {
    endpoint: texto(s.endpoint),
    modelos,
    motores,
    ocupada: s.ocupada === true,
    vramGB: numero(s.vramGB) ?? null,
    ramLibreGB: numero(s.ramLibreGB) ?? 0,
    ...(Object.keys(medidas).length ? { medidas } : {}),
  };
}

type GpuNeurona = NeuronaImg["gpu"];

function gpuDesdeVendor(vendor: unknown, renderer: unknown): GpuNeurona {
  const t = `${typeof vendor === "string" ? vendor : ""} ${typeof renderer === "string" ? renderer : ""}`.toLowerCase();
  if (t.includes("nvidia") || t.includes("geforce")) return "nvidia";
  if (t.includes("apple")) return "apple";
  if (t.includes("amd") || t.includes("radeon")) return "amd";
  return "ninguna";
}

/**
 * Convierte una fila cruda del registro de neuronas (la forma de `Neuron` de
 * src/lib/neurons/neurons.ts, sin importarlo para no tocar red al probar) en una `NeuronaImg` del plan.
 * Devuelve null si la neurona no publica capacidades de imagen: entonces no recibe trabajo.
 */
export function aNeuronaImg(fila: unknown, capa: "dispositivo" | "neurona" | "malla"): NeuronaImg | null {
  if (!fila || typeof fila !== "object") return null;
  const f = fila as Record<string, unknown>;
  const id = typeof f.id === "string" && f.id.trim() ? f.id.trim() : null;
  if (!id) return null;
  const cap = leerCapacidadImagenes(f.capabilities);
  if (!cap || !cap.modelos.length || !cap.motores.length) return null;
  const caps = (f.capabilities ?? {}) as Record<string, unknown>;
  return {
    id,
    capa,
    gpu: gpuDesdeVendor(caps.gpuVendor, caps.gpuRenderer),
    vramGB: cap.vramGB,
    ramLibreGB: cap.ramLibreGB > 0 ? cap.ramLibreGB : typeof caps.memoryGb === "number" ? caps.memoryGb : 0,
    motores: cap.motores,
    instalados: cap.modelos,
    ocupada: cap.ocupada,
    ...(cap.medidas ? { medidas: cap.medidas } : {}),
  };
}

/** Generador de la pestaña (WebGPU) que registra IMG1011H cuando existe; si no, la capa «navegador» no corre. */
export type GeneradorTab = (prompt: string, semilla: number) => Promise<{ url?: string; ref?: string } | null>;

let generadorTab: GeneradorTab | null = null;

/** Lo llama el servicio de la pestaña (IMG1011H) al cargar; null lo desregistra. */
export function registrarGeneradorTab(fn: GeneradorTab | null): void {
  generadorTab = fn;
}

/** La neurona «navegador» del plan: la pestaña con WebGPU corre SD-Turbo si el generador está registrado. */
export function neuronaTab(registrada: boolean, ramGB: number, ocupada = false): NeuronaImg | null {
  if (!registrada) return null;
  return {
    id: "pestaña",
    capa: "navegador",
    gpu: "ninguna",
    vramGB: null,
    ramLibreGB: ramGB,
    motores: ["onnx-web"],
    instalados: ["sd-turbo"],
    ocupada,
  };
}

/* ── Ficha visible de cada opción (licencia y atribución siempre a la vista, §6) ─────────────── */

const LICENCIA_WEB = "Pollinations (web gratis; el servicio no declara licencia propia del resultado)";

/** Monta la opción de la galería a partir del plan y del resultado de ejecutarla. Puro. */
export function armarOpcion(
  op: OpcionImagen,
  res: { url?: string; ref?: string; segundos: number },
): OpcionGaleria {
  const m = op.modelo;
  const donde =
    op.capa === "web-gratis" ? "la web gratis" :
    op.capa === "espacio" ? `su Space de Hugging Face` :
    op.neuronaId ? `tu neurona «${op.neuronaId}»` : "tu aparato";
  const atribucion = m
    ? `Generada con ${m.nombre} (${m.licencia}) en ${donde}.`
    : "Generada con Pollinations (web gratis).";
  return {
    ...(res.url ? { url: res.url } : {}),
    ...(res.ref ? { ref: res.ref } : {}),
    modelo: m ? m.nombre : null,
    capa: op.capa,
    ...(op.neuronaId ? { neurona: op.neuronaId } : {}),
    semilla: op.semilla,
    licencia: m ? m.licencia : LICENCIA_WEB,
    uso: m ? m.uso : "libre",
    atribucion,
    segundos: res.segundos,
  };
}

/** Cómo se ejecuta UNA opción del plan; null = falló (se sustituye por la siguiente). Inyectable en pruebas. */
export type EjecutarOpcion = (
  op: OpcionImagen,
  prompt: string,
) => Promise<{ url?: string; ref?: string; segundos: number } | null>;

const TIMEOUT_LOCAL_MS = 180000;
/** El relé `capacidad.*` es un candidato: sin respuesta del peer en este plazo, la opción se descarta. */
const TIMEOUT_MALLA_MS = 15000;

async function fetchJsonLocal(url: string, body: unknown): Promise<unknown | null> {
  if (typeof fetch === "undefined" || !/^https?:\/\//i.test(url)) return null;
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => { try { ctl.abort(); } catch { /* noop */ } }, TIMEOUT_LOCAL_MS) : null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctl?.signal,
      credentials: "omit",
    });
    if (timer) clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    if (timer) clearTimeout(timer);
    return null;
  }
}

/** Extrae una URL o referencia de la respuesta del servicio local (IMG1011A): {url}, {ref} o {base64}. */
export function extraerResultadoLocal(data: unknown): { url?: string; ref?: string } | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  if (typeof o.url === "string" && o.url.trim()) return { url: o.url.trim() };
  if (typeof o.ref === "string" && o.ref.trim()) return { ref: o.ref.trim() };
  const b64 = typeof o.base64 === "string" ? o.base64 : typeof o.imagen === "string" ? o.imagen : "";
  if (b64.trim()) {
    const s = b64.trim();
    return { url: /^data:|^https?:\/\//i.test(s) ? s : `data:image/png;base64,${s}` };
  }
  return null;
}

export interface EntradaGaleria {
  prompt: string;
  opciones?: number;
  prioridad?: "calidad" | "rapidez";
  comercial?: boolean;
  necesita?: readonly CapacidadImg[];
  conReferencia?: boolean;
  permisoRemoto?: boolean;
  espacios?: readonly string[];
  /** Neuronas de la malla (IMG1011F) cuando ya existen; se añaden a las de la cuenta. */
  neuronasExtra?: readonly NeuronaImg[];
  /** Si se pasan, NO se consulta el registro de neuronas (pruebas sin red, o malla ya resuelta). */
  neuronas?: readonly NeuronaImg[];
  semillaBase?: number;
  /** Web gratis (Pollinations) ejecutada por media-gen: no se duplica su lógica aquí. */
  viaWebGratis?: (semilla: number) => Promise<{ url?: string; segundos?: number } | null>;
}

/** Ejecuta una opción contra su capa real. Devuelve null con honestidad cuando esa capa no corre aquí. */
export async function ejecutarOpcionReal(
  op: OpcionImagen,
  prompt: string,
  viaWebGratis: EntradaGaleria["viaWebGratis"],
): Promise<{ url?: string; ref?: string; segundos: number } | null> {
  const t0 = Date.now();
  const tardado = () => Math.round(((Date.now() - t0) / 1000) * 10) / 10;
  if (op.motor === "pollinations") {
    const r = viaWebGratis ? await viaWebGratis(op.semilla) : null;
    return r && (r.url || (r as { ref?: string }).ref)
      ? { ...(r.url ? { url: r.url } : {}), segundos: typeof r.segundos === "number" ? r.segundos : tardado() }
      : null;
  }
  if (op.motor === "onnx-web") {
    if (!generadorTab) return null; // IMG1011H aún no registrado: se dice en el descarte.
    const r = await generadorTab(prompt, op.semilla).catch(() => null);
    return r && (r.url || r.ref) ? { ...r, segundos: tardado() } : null;
  }
  if (op.motor === "espacio-hf") return null; // El cliente de Spaces aún no está conectado: descarte honesto.
  if (op.motor === "externo") return null; // Los servicios de pago se piden con tu clave aparte.
  // Capa «malla» (RTIMG1011F): la generación va por el relé `capacidad.*` a esa neurona.
  if (op.capa === "malla") {
    const r = await (
      await import("@/lib/imagenes/adaptadores/malla-imagenes")
    ).pedirGeneracionMalla(
      op.neuronaId ?? "",
      {
        prompt,
        modelo: op.modelo?.id ?? null,
        semilla: op.semilla,
        ...(op.modelo?.pasos ? { pasos: op.modelo.pasos } : {}),
      },
      { timeoutMs: TIMEOUT_MALLA_MS },
    );
    if (!r.ok || (!r.url && !r.ref)) return null;
    return { ...(r.url ? { url: r.url } : {}), ...(r.ref ? { ref: r.ref } : {}), segundos: tardado() };
  }
  // Capas locales (dispositivo/neurona): el servicio de imágenes de IMG1011A en esa neurona.
  const endpoint = endpointsPorNeurona[op.neuronaId ?? ""];
  if (!endpoint || !op.modelo) return null;
  const data = await fetchJsonLocal(`${endpoint.replace(/\/+$/, "")}/imagen`, {
    prompt,
    modelo: op.modelo.id,
    semilla: op.semilla,
    cuantizacion: op.cuantizacion,
    pasos: op.modelo.pasos,
  });
  if (!data) return null;
  const r = extraerResultadoLocal(data);
  return r ? { ...r, segundos: tardado() } : null;
}

/** Endpoint del servicio de imágenes de cada neurona (se rellena al recolectar). Clave: id de neurona. */
const endpointsPorNeurona: Record<string, string> = {};

/** Recoge las neuronas de la cuenta con capacidades de imagen (latido ya cacheado; sin sondeo nuevo). */
export async function recolectarNeuronasImagen(ramEstaGB = 0): Promise<NeuronaImg[]> {
  const out: NeuronaImg[] = [];
  for (const k of Object.keys(endpointsPorNeurona)) delete endpointsPorNeurona[k];
  const tab = neuronaTab(!!generadorTab, ramEstaGB || 4);
  if (tab) out.push(tab);
  try {
    const { listNeurons } = await import("@/lib/neurons/neurons");
    const lista = await listNeurons();
    for (const n of lista as unknown[]) {
      const esEsta = !!(n && typeof n === "object" && (n as Record<string, unknown>).isThisDevice);
      const cap = leerCapacidadImagenes((n as Record<string, unknown>).capabilities);
      if (esEsta && !cap) continue;
      const neurona = aNeuronaImg(n, esEsta ? "dispositivo" : "neurona");
      if (!neurona) continue;
      if (cap?.endpoint) endpointsPorNeurona[neurona.id] = cap.endpoint;
      out.push(neurona);
    }
  } catch {
    /* sin registro de neuronas disponible: seguimos con la pestaña y la web gratis */
  }
  return out;
}

/* ── La orquestadora de la galería (§4): varias opciones, sustituyendo las que fallen ───────── */

/**
 * Genera la galería de `EntradaGaleria.opciones` opciones (1–8, 4 por defecto):
 *   1) Recolecta las neuronas de la cuenta con capacidades de imagen (más las de la malla si vienen).
 *   2) `planImagen` decide las candidatas (hasta 8, capa cercana primero, modelos variados).
 *   3) Lanza las primeras en PARALELO; cada una que falla se SUSTITUYE por la siguiente del plan.
 *   4) Si ninguna responde, `ok:false` con los motivos honestos — la regla de oro (Pollinations para una
 *      sola imagen) sigue en `media-gen.generateImage`, que es quien decide el failover final.
 * Nunca lanza; con `neuronas` y `ejecutar` inyectados no toca red (así se prueba). Sin `viaWebGratis`
 * no puede producir la opción web gratis — quien llama la pasa desde media-gen.
 */
export async function generarGaleriaImagenes(
  entrada: EntradaGaleria,
  ejecutar?: EjecutarOpcion,
): Promise<GaleriaImagenes> {
  try {
    const descartes: string[] = [];
    const prompt = (entrada?.prompt ?? "").toString().trim();
    if (!prompt) {
      return { ok: false, opciones: [], descartes, error: "Describe qué imagen quieres generar." };
    }
    const pedidas = Math.max(1, Math.min(8, Math.floor(entrada.opciones ?? 4) || 4));
    let neuronas: NeuronaImg[];
    if (entrada.neuronas) {
      neuronas = [...entrada.neuronas];
    } else {
      neuronas = await recolectarNeuronasImagen();
    }
    if (entrada.neuronasExtra) neuronas.push(...entrada.neuronasExtra);

    const peticion: PeticionImagen = {
      opciones: Math.min(8, pedidas * 2), // pide de más para tener sustitutas si alguna falla
      prioridad: entrada.prioridad ?? "calidad",
      comercial: entrada.comercial === true,
      necesita: entrada.necesita ?? (["texto-a-imagen"] as const),
      conReferencia: entrada.conReferencia === true,
      permisoRemoto: entrada.permisoRemoto === true,
      permitirDePago: false, // los servicios de pago se piden con tu clave aparte
      ...(entrada.espacios && entrada.espacios.length ? { espacios: entrada.espacios } : {}),
    };
    const plan = planImagen(peticion, neuronas, entrada.semillaBase ?? 1);
    descartes.push(...plan.descartes);
    if (!plan.opciones.length) {
      return {
        ok: false,
        opciones: [],
        descartes,
        error: "No hay ninguna opción posible con tus neuronas y permisos actuales.",
      };
    }

    const correr: EjecutarOpcion = ejecutar ?? ((op, p) => ejecutarOpcionReal(op, p, entrada.viaWebGratis));

    // Lanza las primeras `pedidas` en paralelo; las que fallen promueven la siguiente del plan.
    const nombreDe = (op: OpcionImagen) => op.modelo?.nombre ?? op.motor;
    const pendientes = new Map<number, Promise<OpcionGaleria | null>>();
    const lanzar = (i: number): void => {
      if (pendientes.has(i) || i >= plan.opciones.length) return;
      const op = plan.opciones[i];
      pendientes.set(
        i,
        correr(op, prompt)
          .then((r) => (r ? armarOpcion(op, r) : null))
          .catch(() => null),
      );
    };
    for (let i = 0; i < Math.min(pedidas, plan.opciones.length); i++) lanzar(i);

    const opciones: OpcionGaleria[] = [];
    let siguiente = Math.min(pedidas, plan.opciones.length);
    for (let i = 0; i < plan.opciones.length && opciones.length < pedidas; i++) {
      lanzar(i);
      const r = await pendientes.get(i);
      if (r) {
        opciones.push(r);
        continue;
      }
      descartes.push(`${nombreDe(plan.opciones[i])} (${plan.opciones[i].capa}): no respondió; se intentó la siguiente del plan.`);
      if (siguiente < plan.opciones.length) {
        lanzar(siguiente);
        siguiente++;
      }
    }

    if (!opciones.length) {
      return {
        ok: false,
        opciones: [],
        descartes,
        error: "Ninguna opción respondió. El failover a una sola imagen por la web gratis lo decide media-gen.",
      };
    }
    return { ok: true, opciones, descartes };
  } catch (e) {
    return {
      ok: false,
      opciones: [],
      descartes: [],
      error: e instanceof Error && e.message ? e.message : "Error inesperado preparando las opciones.",
    };
  }
}
