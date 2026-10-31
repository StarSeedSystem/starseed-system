// Alcance · servidor del panel de Genesis (INV1025P). SOLO SERVIDOR: importa
// node:fs y solo puede importarlo una ruta o otro módulo de servidor.
// ─────────────────────────────────────────────────────────────────────────────
// Lee y escribe el almacén privado `~/.starseed/alcance/` (objetivos.json,
// supresion.json, fichas/<obj>.json, registro.jsonl) y las propuestas de
// imaginación reutilizando las rutas y el normalizador de `imaginacion-servidor`.
// La dirección de contacto JAMÁS se guarda ni viaja en el estado: se resuelve
// a cada lectura SOLO para mostrarla en la confirmación (R5). El registro de
// envíos guarda únicamente el hash del destinatario. Contrato:
// architecture/repos-libreria-1025.md §7 (R1–R10) y `src/lib/alcance/alcance-tipos.ts`.
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { normalizarPropuesta, rutasImaginacion, type PropuestaVisible } from "@/lib/mando/imaginacion-servidor";
import { evaluarEnvio, huellaTexto } from "@/lib/alcance/alcance-envio";
import { resolverDestino, seguimientoDe, type DestinoResuelto, type EnlaceVerificado, type EstadoEnvio, type FichaPrivada, type ObjetivoPrivado, type PropuestaAlcance, type VistaAlcance } from "@/lib/alcance/alcance-tipos";
import { enviarPorProveedor } from "@/lib/mail/proveedor-envio";

type RutasAlcance = ReturnType<typeof rutasAlcance>;

export type Crudo = Record<string, unknown>;
export interface LugarAlcance { raiz?: string; casa?: string; ahora?: Date; hace?: typeof fetch }
export interface ResultadoAlcance { ok: boolean; error?: string; motivos?: string[]; mailto?: string; abrir?: string; copiar?: string; vista?: VistaAlcance }

const tuEnv = (nombre: string) => ((process.env as Record<string, string | undefined>)[nombre] || "").trim();
/** Firma honesta del remitente (R7): el nombre va en el correo, la identidad es real. */
export const REMITENTE_DEFECTO = "Alex · StarSeed OS";
export const remitenteNombre = () => tuEnv("STARSEED_REMITENTE_NOMBRE") || REMITENTE_DEFECTO;
/** Pie honesto del mensaje: identidad real y forma de no recibir más (R7). PURA. */
export function pieDe(remitente: string) {
  return { identidad: remitente, baja: "Responde a este correo pidiendo no recibir más mensajes y no volverás a recibir ninguno." };
}
const esObj = (v: unknown): v is Crudo => typeof v === "object" && v !== null && !Array.isArray(v);

/* Rutas del almacén privado (carpeta 700, archivos 600 en la escritura Python). */
export function rutasAlcance(lugar: LugarAlcance = {}) {
  const base = path.join(lugar.casa ?? os.homedir(), ".starseed", "alcance");
  return {
    objetivos: path.join(base, "objetivos.json"),
    supresion: path.join(base, "supresion.json"),
    registro: path.join(base, "registro.jsonl"),
    ficha: (id: string) => path.join(base, "fichas", `${id.replace(/[^A-Za-z0-9._-]/g, "_")}.json`),
    propuestas: rutasImaginacion({ raiz: lugar.raiz }).propuestas,
  };
}
const leerJson = async (ruta: string): Promise<unknown> =>
  readFile(ruta, "utf-8").then((t) => JSON.parse(t) as unknown, () => null);

/* ── Estado del alcance pegado a la propuesta (crudo, en propuestas.json) ── */
export interface EstadoAlcance { estadoEnvio: EstadoEnvio; aprobadaPorHumano: boolean; huellaAprobada: string }
export const ESTADOS_ENVIO: EstadoEnvio[] = ["pendiente", "aprobada", "enviada", "respondida", "sin-respuesta", "rebotada", "no-contactar"];
export const MARCABLES: EstadoEnvio[] = ["respondida", "sin-respuesta", "rebotada", "no-contactar"];
export function normalizarAlcance(d: unknown): EstadoAlcance {
  const o = esObj(d) ? d : {};
  const envio = `${o.estadoEnvio ?? ""}`;
  return {
    estadoEnvio: ESTADOS_ENVIO.includes(envio as EstadoEnvio) ? (envio as EstadoEnvio) : "pendiente",
    aprobadaPorHumano: o.aprobadaPorHumano === true,
    huellaAprobada: typeof o.huellaAprobada === "string" ? o.huellaAprobada.slice(0, 64) : "",
  };
}
export function enlacesDeTexto(t: string): string[] {
  const salida: string[] = [];
  for (const m of `${t}`.matchAll(/https:\/\/[^\s<>")\]]+/g)) {
    const u = m[0].replace(/[.,;:!?]+$/, "");
    if (!salida.includes(u)) salida.push(u);
  }
  return salida.slice(0, 12);
}
/** Firma base como la del almacén Python (`huella`: sin acentos, minúsculas). */
export function plano(t: string): string {
  return `${t}`.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}
export async function hashPlano(valor: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(plano(valor)));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}
/** Correo del destinatario dentro de un canal publicado, o "" si no hay. PURA. */
export function correoDe(canal: string): string {
  const m = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.exec(canal);
  return m ? m[0] : "";
}
/** `mailto:` con asunto y cuerpo codificados (R3: lo envía la persona, no el OS). PURA. */
export function mailtoDe(to: string, asunto: string, cuerpo: string): string {
  const qs = new URLSearchParams();
  if (asunto.trim()) qs.set("subject", asunto.trim());
  if (cuerpo.trim()) qs.set("body", cuerpo.trim());
  const q = qs.toString();
  return `mailto:${encodeURIComponent(to.trim())}${q ? `?${q}` : ""}`;
}

/* ── Disco: la lista cruda de propuestas, con escritura atómica ─────────── */
async function escribirAtomico(ruta: string, datos: unknown): Promise<void> {
  await mkdir(path.dirname(ruta), { recursive: true });
  const temporal = `${ruta}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporal, `${JSON.stringify(datos, null, 2)}\n`, "utf-8");
  await rename(temporal, ruta);
}
/** La lista de propuestas como está en el disco y cómo volverla a guardar con su forma. */
export async function listaCruda(lugar: LugarAlcance = {}) {
  const crudo = await leerJson(rutasAlcance(lugar).propuestas);
  const arr = Array.isArray(crudo) ? crudo : esObj(crudo) && Array.isArray(crudo.propuestas) ? crudo.propuestas : [];
  const guardar = (l: Crudo[]) => escribirAtomico(rutasAlcance(lugar).propuestas, esObj(crudo) ? { ...crudo, propuestas: l } : l);
  return { lista: arr as Crudo[], guardar };
}
/** Busca una propuesta por id; null si no existe. `agente === "alcance"` se comprueba aparte. */
export async function buscarAlcance(id: string, lugar: LugarAlcance = {}) {
  if (!id.trim()) return null;
  const { lista, guardar } = await listaCruda(lugar);
  const i = lista.findIndex((d) => typeof d.id === "string" && d.id === id);
  if (i === -1) return null;
  return { item: lista[i], indice: i, lista, guardar, esAlcance: lista[i].agente === "alcance" };
}

/* ── Registro de envíos (solo hash del destinatario) y supresión ────────── */
export interface FilaRegistro { destinoId: string; fecha: string; estado: EstadoEnvio; recordatorio: boolean; medio: string }
async function leerSuprimidos(ruta: string): Promise<string[]> {
  const v = await leerJson(ruta);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
async function leerRegistro(ruta: string): Promise<FilaRegistro[]> {
  const t = await readFile(ruta, "utf-8").catch(() => "");
  return t.split("\n").flatMap((l) => {
    if (!l.trim()) return [];
    try {
      const d = JSON.parse(l) as unknown;
      return esObj(d) && typeof d.destinoId === "string" && typeof d.fecha === "string" && ESTADOS_ENVIO.includes(d.estado as EstadoEnvio)
        ? [{ destinoId: d.destinoId, fecha: d.fecha, estado: d.estado as EstadoEnvio, recordatorio: d.recordatorio === true, medio: `${d.medio ?? ""}`.slice(0, 40) }]
        : [];
    } catch {
      return [];
    }
  });
}
async function anotar(ruta: string, fila: FilaRegistro): Promise<void> {
  await mkdir(path.dirname(ruta), { recursive: true });
  await appendFile(ruta, `${JSON.stringify(fila)}\n`, { mode: 0o600 });
}

/* ── Enlaces vivos (2xx hace menos de 15 min, reloj de evaluarEnvio) ─────── */
export async function verificarEnlaces(urls: string[], hace: typeof fetch = fetch): Promise<EnlaceVerificado[]> {
  const verificadoEn = new Date().toISOString();
  const salida: EnlaceVerificado[] = [];
  for (const url of urls) {
    let codigo = await probe(url, hace);
    if (codigo < 200 || codigo >= 300) codigo = await probe(url, hace, true);
    salida.push({ url, codigo, verificadoEn });
  }
  return salida;
}
async function probe(url: string, hace: typeof fetch, repetida = false): Promise<number> {
  try {
    const r = await hace(url, {
      redirect: "follow",
      ...(repetida ? {} : { method: "HEAD" as const }),
      signal: AbortSignal.timeout(6_000),
      headers: { "User-Agent": "starseed-os-alcance (+https://starseed-os.vercel.app)" },
    });
    return r.status;
  } catch {
    return 0;
  }
}

/* ── Destino privado: objetivo + ficha ≫ destino resuelto y su hash ─────── */
async function destinoYHash(item: Crudo, rutas: RutasAlcance): Promise<{ destino: DestinoResuelto; hash: string; oid: string }> {
  const origen = esObj(item.origen) ? item.origen : {};
  const destinoCrudo = esObj(item.destino) ? item.destino : {};
  const oid = `${origen.objetivo ?? destinoCrudo.objetivo ?? ""}`.trim();
  const crudo = await leerJson(rutas.objetivos);
  const listaObj = (Array.isArray(crudo) ? crudo : esObj(crudo) && Array.isArray(crudo.objetivos) ? crudo.objetivos : []).filter(esObj);
  const objetivo = (listaObj.find((o) => `${o.id ?? ""}`.trim() === oid) ?? null) as ObjetivoPrivado | null;
  const ficha = (await leerJson(rutas.ficha(oid))) as FichaPrivada | null;
  const destino = resolverDestino(objetivo, ficha);
  // El hash: lo que el almacén Python (huella del canal) o el propio objetivo; solo hash en el registro (R5).
  const hash = await hashPlano(destino.canalPublicado || oid || destino.nombrePublico);
  return { destino, hash, oid };
}

/* ── Contexto completo de una propuesta de alcance (vista + piezas del envío) ── */
export interface ContextoAlcance {
  item: Crudo; normalizada: PropuestaVisible | null; estado: EstadoAlcance;
  propuesta: PropuestaAlcance;
  vista: VistaAlcance; destino: DestinoResuelto; hash: string; correo: string;
  urls: string[]; registro: FilaRegistro[]; suprimidos: string[];
}
export async function contextoAlcance(id: string, lugar: LugarAlcance = {}): Promise<ContextoAlcance | null> {
  const r = await buscarAlcance(id, lugar);
  if (!r || !r.esAlcance) return null;
  const ahora = lugar.ahora ?? new Date();
  const rutas = rutasAlcance(lugar);
  const p = normalizarPropuesta(r.item);
  const estado = normalizarAlcance(r.item.alcance);
  const { destino, hash } = await destinoYHash(r.item, rutas);
  const referencias = p ? p.referencias.map((x) => x.url) : [];
  const afirmaciones = Array.isArray(r.item.afirmaciones) ? r.item.afirmaciones.filter(esObj).map((a) => `${a.fuente_url ?? ""}`) : [];
  const urls = [...new Set([...referencias, ...afirmaciones, ...enlacesDeTexto(p ? p.cuerpo : "")])].filter((u) => u.startsWith("https://")).slice(0, 12);
  const enlaces = await verificarEnlaces(urls, lugar.hace);
  const correo = correoDe(destino.canalPublicado);
  const registro = (await leerRegistro(rutas.registro)).filter((f) => f.destinoId === hash);
  const suprimidos = await leerSuprimidos(rutas.supresion);
  const aprobado = estado.aprobadaPorHumano && estado.huellaAprobada && p?.estado === "aprobada";
  const propuesta: PropuestaAlcance = {
    id: p ? p.id : id,
    medio: destino.medio,
    asunto: p ? p.titulo : "",
    cuerpo: p ? p.cuerpo : "",
    enlaces: urls,
    pie: pieDe(remitenteNombre()),
    estado: aprobado ? "aprobada" : "esperando-aprobacion",
    aprobadaPorHumano: estado.aprobadaPorHumano,
    huellaAprobada: estado.huellaAprobada,
    automatico: false,
    recordatorio: false,
  };
  // Los motivos se calculan como si la confirmación ENVIAR fuera a llegar (la da la ventana del panel);
  // lo que el envío exige antes es lo real: aprobación humana, huella igual, enlaces vivos y destino no suprimido.
  const veredicto = await evaluarEnvio({
    propuesta, destino: { ...destino, id: hash }, registro, suprimidos, ahora, enlaces,
    confirmacion: { texto: "ENVIAR", porPersona: true },
  });
  const vista: VistaAlcance = {
    id: id,
    titular: p ? p.titulo : "",
    asunto: p ? p.titulo : "",
    cuerpo: p ? p.cuerpo : "",
    medio: destino.medio,
    remitente: remitenteNombre(),
    destinatario: correo || destino.canalPublicado,
    destinoUrl: destino.canalPublicado.startsWith("https://") ? destino.canalPublicado : "",
    estadoPropuesta: p ? p.estado : "",
    envio: estado.estadoEnvio,
    aprobada: estado.aprobadaPorHumano,
    huellaAprobada: estado.huellaAprobada,
    enlaces,
    suprimido: suprimidos.includes(hash),
    seguimiento: seguimientoDe(estado.estadoEnvio),
    motivos: veredicto.motivos,
  };
  return { item: r.item, normalizada: p, estado, propuesta, vista, destino, hash, correo, urls, registro, suprimidos };
}

/** Lo que GET ?id= devuelve al panel: null si el id no es una propuesta de alcance. */
export const leerVistaAlcance = (id: string, lugar: LugarAlcance = {}) => contextoAlcance(id, lugar).then((c) => c?.vista ?? null);

/* ── Operaciones del panel: editar · aprobar-texto · suprimir · marcar · enviar ── */
export async function editarAlcance(id: string, asunto: string, cuerpo: string, lugar: LugarAlcance = {}): Promise<{ ok: boolean; error?: string }> {
  const r = await buscarAlcance(id, lugar);
  if (!r || !r.esAlcance) return { ok: false, error: "No existe esa propuesta de alcance." };
  const limpioAsunto = `${asunto}`.trim().slice(0, 300);
  const limpioCuerpo = `${cuerpo}`.trim().slice(0, 8000);
  if (!limpioAsunto || !limpioCuerpo) return { ok: false, error: "El asunto y el cuerpo del mensaje no pueden quedar vacíos." };
  r.item.titulo = limpioAsunto;
  r.item.cuerpo = limpioCuerpo;
  if (esObj(r.item.destino) && "asunto" in r.item.destino) r.item.destino.asunto = limpioAsunto;
  // Editar el texto ANULA la aprobación (regla del panel): toca rehacer el camino desde el borrador.
  r.item.alcance = { ...normalizarAlcance(r.item.alcance), aprobadaPorHumano: false, huellaAprobada: "", estadoEnvio: "pendiente" } satisfies Crudo & EstadoAlcance;
  await r.guardar(r.lista);
  return { ok: true };
}
export async function aprobarTextoAlcance(id: string, lugar: LugarAlcance = {}): Promise<{ ok: boolean; error?: string }> {
  const r = await buscarAlcance(id, lugar);
  if (!r || !r.esAlcance) return { ok: false, error: "No existe esa propuesta de alcance." };
  const ahora = lugar.ahora ?? new Date();
  if (r.item.estado === "rechazada" || r.item.estado === "descartada") return { ok: false, error: "Una propuesta rechazada no se puede aprobar: reimagínala primero." };
  const { hash } = await destinoYHash(r.item, rutasAlcance(lugar));
  const huella = await huellaTexto(`${r.item.titulo ?? ""}`, `${r.item.cuerpo ?? ""}`, hash);
  // «Aprobar texto» sigue el MISMO camino que integrar en la imaginación (estado «aprobada», decidida)
  // y encima deja la huella SHA-256 del texto exacto aprovado: solo eso sale (R2).
  r.item.estado = "aprobada";
  r.item.motivo = "";
  r.item.decidida = ahora.toISOString();
  r.item.alcance = { ...normalizarAlcance(r.item.alcance), aprobadaPorHumano: true, huellaAprobada: huella, estadoEnvio: "aprobada" } satisfies Crudo & EstadoAlcance;
  await r.guardar(r.lista);
  return { ok: true };
}
export async function suprimirAlcance(id: string, lugar: LugarAlcance = {}): Promise<{ ok: boolean; error?: string }> {
  const r = await buscarAlcance(id, lugar);
  if (!r || !r.esAlcance) return { ok: false, error: "No existe esa propuesta de alcance." };
  const ahora = lugar.ahora ?? new Date();
  const rutas = rutasAlcance(lugar);
  const { destino, hash } = await destinoYHash(r.item, rutas);
  if (!destino.id) return { ok: false, error: "Esa propuesta no trae su objetivo del alcance." };
  // Supresión (R5): en `~/.starseed/alcance/supresion.json` SOLO queda el hash del canal.
  const lista = new Set(await leerSuprimidos(rutas.supresion));
  const antes = lista.size;
  lista.add(hash);
  lista.add(await hashPlano(destino.id));
  if (lista.size !== antes) await escribirAtomico(rutas.supresion, [...lista].sort());
  r.item.alcance = { ...normalizarAlcance(r.item.alcance), estadoEnvio: "no-contactar" } satisfies Crudo & EstadoAlcance;
  await r.guardar(r.lista);
  await anotar(rutas.registro, { destinoId: hash, fecha: ahora.toISOString(), estado: "no-contactar", recordatorio: false, medio: destino.medio });
  return { ok: true };
}
export async function marcarAlcance(id: string, estado: string, lugar: LugarAlcance = {}): Promise<{ ok: boolean; error?: string }> {
  const r = await buscarAlcance(id, lugar);
  if (!r || !r.esAlcance) return { ok: false, error: "No existe esa propuesta de alcance." };
  if (!MARCABLES.includes(estado as EstadoEnvio)) return { ok: false, error: "Estado de seguimiento desconocido: respondida, sin-respuesta, rebotada o no-contactar." };
  const ahora = lugar.ahora ?? new Date();
  const rutas = rutasAlcance(lugar);
  const { destino, hash } = await destinoYHash(r.item, rutas);
  r.item.alcance = { ...normalizarAlcance(r.item.alcance), estadoEnvio: estado as EstadoEnvio } satisfies Crudo & EstadoAlcance;
  await r.guardar(r.lista);
  await anotar(rutas.registro, { destinoId: hash, fecha: ahora.toISOString(), estado: estado as EstadoEnvio, recordatorio: false, medio: destino.medio });
  return { ok: true };
}

/**
 * La última puerta (R2·R3): exige aprobación humana con la huella del texto exacto
 * aprobado y la confirmación escrita ENVIAR de una persona; `correo-propio` sale por
 * el proveedor del OS, `correo-usuario` devuelve el `mailto:` (lo envía la persona) y
 * formulario/github/red dan el canal para copiar y abrir (el OS NUNCA lo automatiza).
 */
export async function enviarAlcance(id: string, medio: string, confirmacion: string, lugar: LugarAlcance = {}): Promise<ResultadoAlcance> {
  const c = await contextoAlcance(id, lugar);
  if (!c) return { ok: false, error: "No existe esa propuesta de alcance." };
  const veredicto = await evaluarEnvio({
    propuesta: c.propuesta,
    destino: { ...c.destino, id: c.hash },
    registro: c.registro,
    suprimidos: c.suprimidos,
    ahora: lugar.ahora ?? new Date(),
    enlaces: c.vista.enlaces,
    confirmacion: { texto: confirmacion, porPersona: true },
  });
  if (!veredicto.puede) return { ok: false, motivos: veredicto.motivos };
  const firma = `\n\n—\n${c.vista.remitente}\n${pieDe(c.vista.remitente).baja}`;
  const salida: { mailto?: string; abrir?: string; copiar?: string } = {};
  if (medio === "correo-propio") {
    const desde = tuEnv("STARSEED_CORREO_PUBLICO");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(desde)) return { ok: false, error: "El envío por correo propio no está configurado: falta STARSEED_CORREO_PUBLICO. No salió nada." };
    if (!c.correo) return { ok: false, error: "Sin correo del destinatario en su ficha: no hay a quién escribir (R1)." };
    const nube = await enviarPorProveedor({ from: desde, fromName: c.vista.remitente, to: [c.correo], subject: c.vista.asunto, text: `${c.vista.cuerpo}${firma}` });
    if (!nube.ok) return { ok: false, error: `El proveedor de correo no aceptó el envío: ${nube.error ?? "sin motivo"}. No salió nada.` };
  } else if (medio === "correo-usuario") {
    if (!c.correo) return { ok: false, error: "Sin correo del destinatario en su ficha: no hay a quién escribir (R1)." };
    salida.mailto = mailtoDe(c.correo, c.vista.asunto, `${c.vista.cuerpo}${firma}`);
  } else {
    if (!c.vista.destinoUrl) return { ok: false, error: "Sin canal público del destino: no se puede copiar ni abrir nada (R1)." };
    salida.abrir = c.vista.destinoUrl;
    salida.copiar = c.vista.destinoUrl;
  }
  // Envío hecho: registro con solo hash del destinatario (R5) y estado del alcance en la propuesta.
  const rutas = rutasAlcance(lugar);
  const ahora = lugar.ahora ?? new Date();
  await anotar(rutas.registro, { destinoId: c.hash, fecha: ahora.toISOString(), estado: "enviada", recordatorio: false, medio: c.propuesta.medio });
  const buscado = await buscarAlcance(id, lugar);
  if (buscado) buscado.item.alcance = { ...normalizarAlcance(buscado.item.alcance), estadoEnvio: "enviada" };
  if (buscado) await buscado.guardar(buscado.lista);
  return { ok: true, ...salida, vista: { ...c.vista, envio: "enviada", seguimiento: "esperando" } };
}
