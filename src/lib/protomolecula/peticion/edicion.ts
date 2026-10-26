/**
 * Petición a la Protomolécula · EDITAR e INSERTAR de verdad (Ola 1026P · P3).
 * Cada tipo de entidad se mueve por lo que YA existe en el OS, y lo que no tiene camino todavía se dice con su motivo:
 *   · archivo de la Biblioteca  → rama (`replicateItem`: cita al original) o versión nueva con historial (`updateItemContent`);
 *   · publicación               → en rama = sugerencia de cambio al autor (`suggestChange`); directa, no (se edita en su editor);
 *   · pizarra propia            → un bloque de texto nuevo;
 *   · mensaje (hilo)            → la molécula activa como bloque vivo (```protomolecula).
 * Un texto reescrito por una IA entra por `reescribir` (con tope y solo modelos gratuitos); sin IA, el cambio pedido
 * queda ANOTADO en la rama y no se finge una reescritura. Todas las dependencias se cargan a demanda.
 */
import type { ContextoProto, EntidadProto, OperacionPedida } from "./contrato";
import type { ResultadoPaso } from "./ejecutar";
import { hayMarcasDeCodigo } from "./esquema";

type Editar = Extract<OperacionPedida, { tipo: "editar-entidad" }>;
type Insertar = Extract<OperacionPedida, { tipo: "insertar-en" }>;

export const MAX_TEXTO_REESCRITO = 20_000;

/** Reescribe `original` aplicando SOLO `cambio`. null = no hay IA gratuita, se pasó del tope o la salida no es de fiar. */
export type Reescribir = (original: string, cambio: string) => Promise<string | null>;

export interface DependenciasEdicion {
  reescribir?: Reescribir;
  abrirRuta?: (ruta: string) => void;
}

const nombreDe = (e: EntidadProto): string => (e.nombre ? `«${e.nombre}»` : `${e.tipo} ${e.id}`);
const pendiente = (texto: string): ResultadoPaso => ({ estado: "pendiente", texto });
const fallo = (texto: string): ResultadoPaso => ({ estado: "fallo", texto });

/** El texto que devolvió la IA solo entra si es razonable: no vacío, acotado y sin marcas de código. */
export function textoReescritoValido(nuevo: string | null, original: string): string | null {
  if (typeof nuevo !== "string") return null;
  const t = nuevo.replace(/\r\n/g, "\n").trim();
  if (!t || t.length > MAX_TEXTO_REESCRITO || t.length > Math.max(400, original.length * 4)) return null;
  return hayMarcasDeCodigo(t) ? null : t;
}

async function usuario(): Promise<string | null> {
  const { currentUserRef } = await import("@/lib/sync/entity-state");
  return (await currentUserRef())?.id ?? null;
}

/** Archivo de la Biblioteca de la persona: rama o versión nueva. */
async function editarArchivoDeBiblioteca(op: Editar, deps: DependenciasEdicion): Promise<ResultadoPaso | null> {
  const uid = await usuario();
  if (!uid) return pendiente("Para editar un archivo de tu Biblioteca hace falta tener la sesión iniciada.");
  const lib = await import("@/lib/library/entity-library");
  const ref = lib.libraryRef("user", uid);
  const doc = await lib.listLibrary(ref);
  const item = doc.items.find((it) => it.id === op.objetivo.id);
  if (!item) return null;
  const nombre = item.title || nombreDe(op.objetivo);
  const texto = typeof item.content === "string" && item.content.trim() && item.content.length <= MAX_TEXTO_REESCRITO ? item.content : "";
  const nuevo = texto && deps.reescribir ? textoReescritoValido(await deps.reescribir(texto, op.cambio).catch(() => null), texto) : null;
  const notaCambio = `Cambio pedido a Astraura: ${op.cambio}`.slice(0, 500);

  if (op.modo === "rama") {
    const rama = await lib.replicateItem(ref, item.id);
    if (!rama.ok) return fallo(`No pude crear la rama de «${nombre}».`);
    const parche = nuevo ? { content: nuevo, note: notaCambio } : { note: notaCambio };
    const r = await lib.updateItemContent(ref, rama.id, parche, { label: "Cambio pedido a Astraura" });
    if (!r.ok) return fallo(`Creé la rama de «${nombre}», pero no pude guardarle el cambio.`);
    return nuevo
      ? { estado: "hecho", texto: `Creé una rama de «${nombre}» con el cambio aplicado; el original no se tocó.`, ruta: "/library" }
      : {
          estado: "hecho",
          texto: `Creé una rama de «${nombre}» y dejé anotado el cambio pedido; el original no se tocó.`,
          pendiente: texto ? "El texto de la rama no se reescribió: no hay una IA gratuita disponible ahora (o se alcanzó el tope por hora). Edítala a mano desde la Biblioteca." : "Este archivo no tiene texto que Astraura pueda reescribir: la rama lleva el cambio como nota.",
          ruta: "/library",
        };
  }
  if (!nuevo) {
    return pendiente(`No edité «${nombre}» directamente: ${texto ? "no hay una IA gratuita disponible ahora para reescribirlo (o se alcanzó el tope por hora)" : "no tiene texto que Astraura pueda reescribir"}. Pídelo «en una rama» para dejar el cambio anotado sin tocar el original.`);
  }
  const r = await lib.updateItemContent(ref, item.id, { content: nuevo }, { label: "Cambio pedido a Astraura" });
  return r.ok
    ? { estado: "hecho", texto: `Edité «${nombre}» directamente; la versión anterior queda en su historial y se puede restaurar.`, ruta: "/library" }
    : fallo(`No pude guardar el cambio en «${nombre}».`);
}

export async function editarEntidad(op: Editar, _ctx: ContextoProto, deps: DependenciasEdicion = {}): Promise<ResultadoPaso> {
  const { objetivo } = op;
  const nombre = nombreDe(objetivo);
  if (objetivo.tipo === "publicacion") {
    if (op.modo !== "rama") return pendiente(`No edité ${nombre} directamente: una publicación se edita en su propio editor. Pídelo «en una rama» y se lo dejo a su autoría como sugerencia.`);
    const { suggestChange } = await import("@/lib/posts/post-entity");
    const s = await suggestChange(objetivo.id, op.cambio).catch(() => null);
    return s && s.text
      ? { estado: "hecho", texto: `Dejé tu cambio como sugerencia en ${nombre}; la publicación original no se tocó.`, ruta: `/post/${encodeURIComponent(objetivo.id)}` }
      : fallo(`No pude dejar la sugerencia en ${nombre}.`);
  }
  if (objetivo.tipo === "archivo") {
    const r = await editarArchivoDeBiblioteca(op, deps).catch(() => null);
    if (r) return r;
    return pendiente(`${nombre} no es un archivo de tu Biblioteca. Los documentos, tablas y presentaciones se cambian desde su propio editor (todavía no se editan a distancia).`);
  }
  if (objetivo.tipo === "mensaje") return pendiente(`No edité ${nombre}: un mensaje solo lo edita su autoría desde el chat, y para reescribirlo hace falta su texto completo.`);
  if (objetivo.tipo === "molecula") return pendiente(`${nombre} se cambia dictándole la orden (por ejemplo «sube el brillo un 10 %»), no con una edición libre.`);
  if (objetivo.tipo === "pizarra") return pendiente(`${nombre}: sé añadir un bloque de texto a una pizarra tuya («inserta … en la pizarra»); cambiar su contenido existente aún no tiene camino.`);
  return pendiente(`Aplicar este cambio a ${nombre} desde aquí aún no tiene camino: hazlo en sus ajustes. Si el gobierno de la entidad pide propuesta o votación, ya te dejé el borrador.`);
}

/** El bloque ```protomolecula con la molécula activa: átomos y valores, sin nada que parezca un dato de salud. */
export async function bloqueDeMoleculaActiva(): Promise<{ titulo: string; fence: string } | null> {
  const { controladorActivo } = await import("../controlador-activo");
  const c = controladorActivo();
  if (!c) return null;
  const { candidatosDe } = await import("../registro-atomos");
  const { METRICAS_SALUD } = await import("../tipos");
  const { claveDe, normalizar } = await import("../parametros");
  const { metricaDeFuente } = await import("../permisos");
  const e = c.obtener(), m = e.molecula;
  const salud = new Set<string>(METRICAS_SALUD);
  const movidoPorWearable = (clave: string): boolean => [...e.historial.hechos, ...e.historial.rehacer].some((h) => claveDe(h.operacion.objetivo) === clave && metricaDeFuente(h.operacion.fuente) !== undefined);
  const valores: Array<{ atomo: number; parametro: string; valor: number | string | boolean }> = [];
  for (const cand of candidatosDe(m)) {
    const p = cand.parametro, clave = claveDe(cand.ref);
    if ([p.id, p.nombre].some((s) => salud.has(normalizar(s).replace(/\s+/g, "-"))) || movidoPorWearable(clave)) continue;
    const indice = m.atomos.findIndex((a) => a.id === cand.ref.atomoId);
    const v = m.valores[clave];
    if (indice >= 0 && (typeof v === "number" || typeof v === "string" || typeof v === "boolean")) valores.push({ atomo: indice, parametro: p.id, valor: v });
  }
  const cuerpo = { titulo: m.titulo.slice(0, 80), atomos: m.atomos.map((a) => ({ herramienta: a.herramientaId, titulo: a.titulo ?? a.herramientaId })), valores };
  const json = JSON.stringify(cuerpo);
  const { MAX_BYTES_FENCE } = await import("../fence-mensaje");
  if (new TextEncoder().encode(json).length > MAX_BYTES_FENCE) return null;
  return { titulo: m.titulo, fence: "```protomolecula\n" + json + "\n```" };
}

export async function insertarEn(op: Insertar, _ctx: ContextoProto, _deps: DependenciasEdicion = {}): Promise<ResultadoPaso> {
  const { destino } = op;
  const nombre = nombreDe(destino);
  if (destino.tipo === "mensaje") {
    const bloque = await bloqueDeMoleculaActiva().catch(() => null);
    if (!bloque) return pendiente(`No inserté nada en ${nombre}: solo sé poner en un mensaje la molécula que tengas abierta, y no hay ninguna (o es demasiado grande para un mensaje). Para texto, escríbelo en el chat.`);
    const { sendMessage } = await import("@/lib/messages/dm");
    const enviado = await sendMessage(destino.id, { body: `${op.que}\n\n${bloque.fence}`.slice(0, 4000) }).catch(() => null);
    return enviado
      ? { estado: "hecho", texto: `Envié a ${nombre} la molécula «${bloque.titulo}» como bloque vivo (una instantánea: quien la reciba tendrá su copia).`, ruta: "/messages" }
      : fallo(`No pude enviar el mensaje a ${nombre} (¿sesión iniciada y miembro del hilo?).`);
  }
  if (destino.tipo === "pizarra") {
    const { getCanvas, saveCanvas, defaultBlock } = await import("@/lib/canvas/canvas");
    const uid = await usuario();
    const lienzo = uid ? await getCanvas(destino.id) : null;
    if (!uid || !lienzo) return pendiente(`No encontré ${nombre} entre tus pizarras (¿sesión iniciada?).`);
    if (lienzo.owner !== uid) return pendiente(`${nombre} no es tuya: los cambios en pizarras ajenas pasan por su propio gobierno (propuesta), no por aquí.`);
    const bloque = { ...defaultBlock("text", lienzo.blocks.length), data: { text: op.que }, title: "Nota de Astraura" };
    const guardado = await saveCanvas({ ...lienzo, blocks: [...lienzo.blocks, bloque] });
    return guardado
      ? { estado: "hecho", texto: `Añadí una nota a ${nombre}.`, ruta: `/pizarra?canvas=${encodeURIComponent(guardado.id)}` }
      : fallo(`No pude guardar la nota en ${nombre}.`);
  }
  if (destino.tipo === "publicacion") return pendiente(`No inserté nada en ${nombre}: una publicación ya publicada no admite bloques nuevos desde aquí. Propón el cambio «en una rama» (sugerencia) o edítala en su editor.`);
  return pendiente(`Insertar en ${nombre} aún no tiene camino real: lo dejo anotado como pendiente.`);
}
