/**
 * Taller 3D · CLIENTE DEL SERVICIO LOCAL (AV1011F). Contrato: architecture/astraura-avatares-3d.md §4, §5 y §11.
 *
 * Habla con `servicios/taller-3d/taller.py`, que escucha SOLO en 127.0.0.1 con un token (lo da quien monta el
 * cliente: nunca va en el código ni en registros). Pasos: consulta las capacidades de la neurona, llama a
 * `planificar` SOLO con los motores que el taller tiene de verdad instalados (los demás, con el motivo que da el
 * servicio), envía el trabajo, espera su estado, baja el resultado y convierte cada `.provenance.json` en
 * `Procedencia`. Lo sube a la Biblioteca por la vía que ya existe (`Dependencias3D.guardar`, la de
 * `components/avatares/generar-3d.tsx`), sin duplicarla. Las consultas de estado van a 127.0.0.1, nunca a
 * Supabase; sin alguien esperando el trabajo, no se pregunta nada.
 */
import { USOS_LICENCIA, type Esqueleto, type Procedencia, type UsoLicencia } from "../adn/adn";
import { planificar, usoPermitido, type Partida, type PeticionPlan, type PlanAvatar } from "../adn/canalizacion";
import { MOTORES_3D, REQUISITOS_3D, type Etapa, type Motor3D, type Requisito3D } from "../adn/motores";
import { capacidadesDe, type Destino3D, type Hierro, type PlanOptimizacion } from "../adn/optimizacion";
import type { Dependencias3D, ResultadoTaller } from "./use-generar-3d";

export const URL_TALLER = "http://127.0.0.1:8797";
/** Etapas que hace el servicio; «detallar» no tiene motor listo y «animar» va en el navegador de quien mira. */
export const ETAPAS_TALLER: readonly Etapa[] = ["generar", "remallar", "riggear"];
export const INTERVALO_ESTADO_MS = 5_000;
export const TOPE_ESPERA_MS = 3 * 60 * 60 * 1000;

export type Buscar = (url: string, init?: RequestInit) => Promise<Response>;
export type Resultado<T> = { ok: true; valor: T } | { ok: false; motivo: string };
export interface ConexionTaller { token: string; url?: string; buscar?: Buscar }
export interface MotorDelTaller { listo: boolean; motivo: string | null }
export interface CapacidadesTaller3D {
  requisitos: Requisito3D[];
  hierro: Hierro;
  a1: boolean;
  motores: Record<string, MotorDelTaller>;
  recursos: { memoria_libre_gb: number | null; presion: number | null; bateria: boolean | null } | null;
}
export interface ProcedenciaTaller {
  etapa: string; herramienta: string; licencia: string; uso: string;
  atribucion?: string; regionesExcluidas?: string[]; entrada_sha256?: string; salida_sha256?: string; origen?: unknown;
}
export interface TrabajoTaller {
  id: string;
  estado: "en-cola" | "trabajando" | "lista" | "fallida";
  etapas: string[];
  etapa: string | null;
  progreso: number;
  motivo: string | null;
  resultado: { archivo: string; formato: string; bytes: number; sha256: string } | null;
  procedencia: ProcedenciaTaller[];
}

const NO_RESPONDE = "El taller 3D no responde en esta máquina. Arráncalo con «python3 servicios/taller-3d/taller.py servir» (ver su README).";
const esObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

async function pedir(c: ConexionTaller, ruta: string, init: RequestInit = {}): Promise<Resultado<Response>> {
  const buscar = c.buscar ?? fetch;
  let r: Response;
  try {
    r = await buscar(`${(c.url ?? URL_TALLER).replace(/\/+$/, "")}${ruta}`, {
      ...init, cache: "no-store", headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${c.token}` },
    });
  } catch {
    return { ok: false, motivo: NO_RESPONDE };
  }
  if (r.ok) return { ok: true, valor: r };
  const j = (await r.json().catch(() => ({}))) as { motivo?: unknown };
  return { ok: false, motivo: texto(j.motivo) ?? `El taller respondió ${r.status}.` };
}

/** Lee la respuesta de /capacidades (o null si no tiene la forma esperada). Solo nombres de REQUISITOS_3D. */
export function leerCapacidades(raw: unknown): CapacidadesTaller3D | null {
  if (!esObj(raw) || !Array.isArray(raw.requisitos) || !esObj(raw.hierro) || !esObj(raw.motores)) return null;
  const h = raw.hierro;
  if (!["nvidia", "apple", "ninguna"].includes(String(h.gpu)) || typeof h.ramGB !== "number") return null;
  const hierro: Hierro = {
    gpu: h.gpu as Hierro["gpu"], ramGB: h.ramGB, vramGB: typeof h.vramGB === "number" ? h.vramGB : null,
    blender: h.blender === true, permiteEspacioHf: false, claveExterna: false, // el taller local no decide eso
  };
  const motores: Record<string, MotorDelTaller> = {};
  for (const [id, m] of Object.entries(raw.motores)) if (esObj(m)) motores[id] = { listo: m.listo === true, motivo: texto(m.motivo) };
  const rec = esObj(raw.recursos) ? raw.recursos : null;
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  return {
    requisitos: raw.requisitos.filter((x): x is Requisito3D => (REQUISITOS_3D as readonly unknown[]).includes(x)),
    hierro, a1: raw.a1 === true, motores,
    recursos: rec ? { memoria_libre_gb: num(rec.memoria_libre_gb), presion: num(rec.presion), bateria: typeof rec.bateria === "boolean" ? rec.bateria : null } : null,
  };
}

export async function consultarCapacidades(c: ConexionTaller): Promise<Resultado<CapacidadesTaller3D>> {
  const r = await pedir(c, "/capacidades");
  if (!r.ok) return r;
  const caps = leerCapacidades(await r.valor.json().catch(() => null));
  return caps ? { ok: true, valor: caps } : { ok: false, motivo: "El taller respondió algo que no son capacidades: ¿es otra versión?" };
}

/** Los motores con los que planificar aquí: en las etapas del taller, solo los que tiene listos (y por qué no los demás). */
export function motoresDelTaller(caps: CapacidadesTaller3D, motores: readonly Motor3D[] = MOTORES_3D): { motores: Motor3D[]; descartes: Partial<Record<Etapa, string[]>> } {
  const descartes: Partial<Record<Etapa, string[]>> = {};
  const usables = motores.filter((m) => {
    if (m.etapa === "animar") return true;
    if (m.remoto) return false; // lo remoto no lo hace el taller local
    const t = caps.motores[m.id];
    if (ETAPAS_TALLER.includes(m.etapa) && t?.listo) return true;
    const porQue = t ? t.motivo : ETAPAS_TALLER.includes(m.etapa) ? "este taller no sabe ejecutarlo" : "el taller no hace esta etapa";
    (descartes[m.etapa] ??= []).push(`${m.nombre}: ${porQue ?? "no está listo en esta neurona"}`);
    return false;
  });
  return { motores: usables, descartes };
}

/** `planificar` con las capacidades del taller (`capacidadesDe` + el navegador, que anima) y sus motores listos. */
export function planDelTaller(p: Omit<PeticionPlan, "capacidades">, caps: CapacidadesTaller3D): PlanAvatar {
  const { motores, descartes } = motoresDelTaller(caps);
  const capacidades = [...new Set<Requisito3D>([...capacidadesDe(caps.hierro), ...caps.requisitos, "navegador"])];
  const plan = planificar({ ...p, capacidades }, motores);
  return { ...plan, pasos: plan.pasos.map((x) => (x.saltada ? x : { ...x, descartes: [...x.descartes, ...(descartes[x.etapa] ?? [])] })) };
}

/** Las etapas del plan que hará el taller (con motor elegido). */
export const etapasDelTaller = (plan: PlanAvatar) => plan.pasos.filter((x) => !x.saltada && x.motor && ETAPAS_TALLER.includes(x.etapa));

function aBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function leerTrabajo(raw: unknown): TrabajoTaller | null {
  if (!esObj(raw) || typeof raw.id !== "string" || !["en-cola", "trabajando", "lista", "fallida"].includes(String(raw.estado))) return null;
  const res = esObj(raw.resultado) && typeof raw.resultado.archivo === "string" ? raw.resultado as unknown as TrabajoTaller["resultado"] : null;
  return {
    id: raw.id, estado: raw.estado as TrabajoTaller["estado"], etapas: Array.isArray(raw.etapas) ? raw.etapas.map(String) : [],
    etapa: texto(raw.etapa), progreso: typeof raw.progreso === "number" ? raw.progreso : 0, motivo: texto(raw.motivo), resultado: res,
    procedencia: Array.isArray(raw.procedencia) ? (raw.procedencia.filter(esObj) as unknown as ProcedenciaTaller[]) : [],
  };
}

export async function enviarTrabajo(c: ConexionTaller, plan: PlanAvatar, entrada: { nombre: string; bytes: Uint8Array }, optimizacion?: PlanOptimizacion): Promise<Resultado<TrabajoTaller>> {
  const r = await pedir(c, "/trabajos", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan, optimizacion, entrada: { nombre: entrada.nombre, base64: aBase64(entrada.bytes) } }),
  });
  if (!r.ok) return r;
  const t = leerTrabajo(await r.valor.json().catch(() => null));
  return t ? { ok: true, valor: t } : { ok: false, motivo: "El taller aceptó el trabajo pero no devolvió su id." };
}

export async function consultarTrabajo(c: ConexionTaller, id: string): Promise<Resultado<TrabajoTaller>> {
  if (!/^[0-9a-f]{32}$/.test(id)) return { ok: false, motivo: "Id de trabajo no válido." };
  const r = await pedir(c, `/trabajos/${id}`);
  if (!r.ok) return r;
  const t = leerTrabajo(await r.valor.json().catch(() => null));
  return t ? { ok: true, valor: t } : { ok: false, motivo: "El estado del trabajo no tiene la forma esperada." };
}

/** Un `.provenance.json` del taller → `Procedencia` del ADN. Si su «uso» no es uno conocido se toma el de la tabla
 *  de motores y, si tampoco, «condicionado» (lo desconocido nunca se trata como libre). */
export function procedenciaDeProvenance(p: unknown): Procedencia | null {
  if (!esObj(p)) return null;
  const herramienta = texto(p.herramienta);
  if (!herramienta) return null;
  const motor = MOTORES_3D.find((m) => m.id === herramienta);
  const uso: UsoLicencia = (USOS_LICENCIA as readonly unknown[]).includes(p.uso) ? (p.uso as UsoLicencia) : motor?.uso ?? "condicionado";
  const out: Procedencia = { herramienta, licencia: texto(p.licencia) ?? motor?.licencia ?? "sin declarar", uso };
  const atribucion = texto(p.atribucion) ?? motor?.atribucion;
  if (atribucion) out.atribucion = atribucion;
  const regiones = Array.isArray(p.regionesExcluidas) ? p.regionesExcluidas.filter((r): r is string => typeof r === "string") : motor?.regionesExcluidas ?? [];
  if (regiones.length) out.regionesExcluidas = [...regiones];
  return out;
}

const falloDe = (motivo: string): "sin-memoria" | "lento" | "otro" =>
  /memoria|out of memory|oom/i.test(motivo) ? "sin-memoria" : /tiempo agotado/i.test(motivo) ? "lento" : "otro";

export interface OpcionesEjecucion {
  optimizacion?: PlanOptimizacion;
  progreso?: (pct: number, etapa: string) => void;
  esperar?: (ms: number) => Promise<void>;
  intervaloMs?: number;
  topeMs?: number;
}

/** Envía el trabajo, espera a que termine (preguntando a 127.0.0.1) y baja el GLB con su procedencia. */
export async function ejecutarEnTaller(c: ConexionTaller, plan: PlanAvatar, entrada: { nombre: string; bytes: Uint8Array }, o: OpcionesEjecucion = {}): Promise<ResultadoTaller> {
  if (!etapasDelTaller(plan).length) {
    const porQue = plan.pasos.filter((x) => !x.saltada && !x.motor && ETAPAS_TALLER.includes(x.etapa)).flatMap((x) => x.descartes).slice(0, 4);
    return { ok: false, fallo: "otro", motivo: `Este taller no puede hacer ninguna etapa del plan.${porQue.length ? ` ${porQue.join(" · ")}` : ""}` };
  }
  const esperar = o.esperar ?? ((ms: number) => new Promise<void>((ok) => setTimeout(ok, ms)));
  const env = await enviarTrabajo(c, plan, entrada, o.optimizacion);
  if (!env.ok) return { ok: false, fallo: falloDe(env.motivo), motivo: env.motivo };
  let t = env.valor;
  for (let pasado = 0; t.estado === "en-cola" || t.estado === "trabajando"; pasado += o.intervaloMs ?? INTERVALO_ESTADO_MS) {
    if (pasado >= (o.topeMs ?? TOPE_ESPERA_MS)) return { ok: false, fallo: "lento", motivo: `El trabajo ${t.id} sigue en el taller tras ${Math.round(pasado / 60000)} min: se deja de esperar (no se cancela).` };
    o.progreso?.(t.progreso, t.estado === "en-cola" ? "En la cola del taller…" : `Taller: ${t.etapa ?? "trabajando"}…`);
    await esperar(o.intervaloMs ?? INTERVALO_ESTADO_MS);
    const s = await consultarTrabajo(c, t.id);
    if (!s.ok) return { ok: false, fallo: "otro", motivo: s.motivo };
    t = s.valor;
  }
  if (t.estado === "fallida" || !t.resultado) { const m = t.motivo ?? "El taller no dio el motivo."; return { ok: false, fallo: falloDe(m), motivo: m }; }
  if (t.resultado.formato !== "glb")
    return { ok: false, fallo: "otro", motivo: `El taller devolvió ${t.resultado.formato.toUpperCase()} (sin Blender no lo convierte a GLB) y la Biblioteca de modelos guarda GLB: instala Blender en esa neurona.` };
  const r = await pedir(c, `/trabajos/${t.id}/resultado`);
  if (!r.ok) return { ok: false, fallo: "otro", motivo: r.motivo };
  const glb = new Blob([await r.valor.arrayBuffer()], { type: "model/gltf-binary" });
  o.progreso?.(100, "Listo en el taller.");
  return { ok: true, glb, lods: [], procedencia: t.procedencia.map(procedenciaDeProvenance).filter((x): x is Procedencia => x !== null) };
}

export interface ContextoTaller { region: string | null; comercial: boolean; esqueleto: Esqueleto; partida?: Partida }

/** El taller local como `Dependencias3D.taller` de `use-generar-3d`: así la subida a la Biblioteca es la que ya existe. */
export function tallerComoDependencia(c: ConexionTaller, ctx: ContextoTaller): NonNullable<Dependencias3D["taller"]> {
  return async (img, opt, progreso) => {
    const caps = await consultarCapacidades(c);
    if (!caps.ok) return { ok: false, fallo: "otro", motivo: caps.motivo };
    const plan = planDelTaller({ partida: ctx.partida ?? "imagen", esqueleto: ctx.esqueleto, region: ctx.region, comercial: ctx.comercial,
      permitirDePago: false, prioridad: opt.prioridad, cerrada: opt.cerrada }, caps.valor);
    const ext = img.type === "image/jpeg" ? "jpg" : img.type === "image/webp" ? "webp" : "png";
    return ejecutarEnTaller(c, plan, { nombre: `entrada.${ext}`, bytes: new Uint8Array(await img.arrayBuffer()) }, { optimizacion: opt, progreso });
  };
}

/** Sube a la Biblioteca un resultado del taller con la vía que ya existe, con las atribuciones de `usoPermitido` (§5). */
export async function subirResultado(r: Extract<ResultadoTaller, { ok: true }>, meta: { titulo: string; destino: Destino3D; region: string | null; comercial: boolean },
  guardar: Dependencias3D["guardar"]): ReturnType<Dependencias3D["guardar"]> {
  const uso = usoPermitido({ procedencia: r.procedencia }, { region: meta.region, comercial: meta.comercial });
  const g = await guardar({ titulo: meta.titulo, destino: meta.destino, glb: r.glb, lods: r.lods, procedencia: r.procedencia, atribuciones: uso.atribuciones });
  // Como `generar3d`: se guarda (en tu Biblioteca) y lo que impide usarlo así se dice, no se calla.
  return g.ok && uso.motivos.length ? { ...g, aviso: [g.aviso, ...uso.motivos].filter(Boolean).join(" ") } : g;
}
