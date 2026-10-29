/* Protomolécula · ACCIÓN DE AGENTE (PM1010F0M, contrato §5.1): `[[ACCION: protomolecula {json}]]` pasa por la MISMA puerta
 * que la mano (controlador activo, `decidirOperacion`, deshacer por autor). Sin React, red ni `node:*`: todo se inyecta. */
import { controladorActivo } from "./controlador-activo";
import type { Controlador, EstadoControl } from "./controlador";
import { candidatosDe } from "./registro-atomos";
import { claveDe, describirCambio, formatearValor, normalizar, valorActual } from "./parametros";
import { metricaDeFuente } from "./permisos";
import { PROTO_ORB_ABRIR_EVENT, PROTO_ORB_CERRAR_EVENT, leerActivada, fijarOrbeActivada, alternarOrbe } from "./orbe-bus";
import { METRICAS_SALUD, type Accion, type Autor, type CandidatoParametro, type ModoRelativo, type Parametro } from "./tipos";
import { alcanceVisiblePara, type ActorMemoria } from "@/lib/nucleo/alcance-memoria";
import { etiquetaFormato, formatoDe } from "@/lib/conversion/formatos";
import { componerVideo, DURACION_DEFECTO, type EntradaPedido } from "@/lib/video-html/herramienta-componer";
import { pedidoDiagrama, recibirDiagrama, type TamanoDiagrama } from "@/lib/diagramas/herramienta-diagrama";
import { contextoDisenoIA, type EntidadDiseno } from "@/lib/design/principios-referencia";
import { buscarReferencias, type AdnDiseno, type DepsBuscarReferencias, type Personalidad, type TipoContexto } from "@/lib/library/referencias/buscar-referencias";
import type { Catalogo } from "@/lib/library/referencias/catalogo";
import catalogoReferencias from "../../../config/referencias-inspiracion.json";
/** Misma forma que `AuroraActionResult` de `src/lib/aurora/actions.ts`; `datos` lleva el resultado de herramientas como `video.componer`. */
export interface ResultadoAccionProto { ok: boolean; message: string; status?: string; datos?: Record<string, unknown> }
/** `avisarOrbe` devuelve `true` solo si la orbe atendió el aviso; `actor` por defecto: el agente personal. */
export interface ContextoAccionProto { abrirRuta?: (ruta: string) => void; avisarOrbe?: (moleculaId?: string) => boolean;
  actor?: ActorMemoria; ahora?: () => number; nuevoId?: () => string; fijarOrbe?: (activada: boolean) => boolean; cerrarOrbe?: () => void;
  referencias?: Pick<DepsBuscarReferencias, "conectado" | "consultar" | "laya"> }
export const TOPE_LINEAS_ESTADO = 40, TOPE_BYTES_ESTADO = 4096;
export const MENSAJE_PROPONER_CODIGO = "próximamente: las propuestas de código llegan con la fase F7; hoy no se ejecuta ni se guarda nada.";
const PENDIENTE = "queda pendiente de que la persona la confirme en el panel", SALUD = new Set<string>(METRICAS_SALUD);
const ACCIONES = ["abrir", "estado", "mover", "dictar", "deshacer", "proponer-codigo", "convertir", "pedir", "video.componer", "diagrama.crear", "referencias.buscar", "activar", "desactivar", "alternar", "cerrar"];
const MODOS: ModoRelativo[] = ["delta", "porcentaje-valor", "porcentaje-rango", "pasos"];
let secuencia = 0;
const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : ""), num = (n: number): string => String(n).replace(".", ",");
const bytes = (s: string): number => new TextEncoder().encode(s).length;
const no = (message: string): ResultadoAccionProto => ({ ok: false, message, status: "Protomolécula" }), si = (message: string, status = "Protomolécula"): ResultadoAccionProto => ({ ok: true, message, status });
/** Registro en vivo de la entidad (DAN1024G): `data-ss-movimiento` en el documento; sin DOM o valor raro, `contextoDisenoIA` cae a «sobrio». */
const registroVivo = (): unknown => {
  try { return document.documentElement.dataset.ssMovimiento; } catch { return undefined; }
};
/** Título de la pieza pedida (para el contexto de diseño); vacío si el pedido no lo trae. */
const tituloPedido = (p: EntradaPedido): string =>
  typeof p === "string" ? p.trim().slice(0, 80)
  : (texto(p.titulo) || texto(p.texto) || texto(p.narracion) || texto(p.guion)).slice(0, 80);
/** El contexto de diseño (ADN, movimiento y símbolo) que acompaña a una CREACIÓN con IA; el agente lo recibe en el propio resultado. */
const conContextoDiseno = (m: string, entidad: EntidadDiseno): string => `${m.trimEnd()}\n\n${contextoDisenoIA(entidad)}`;
const numeroDe = (v: unknown): number | null => { const x = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.trim().replace(",", ".")) : NaN; return Number.isFinite(x) ? x : null; };
/** Orbe encendida → se le avisa y ella lo atiende con `preventDefault()`; si nadie lo atiende, la página. */
const avisarEnNavegador = (id?: string): boolean => {
  try { return typeof window !== "undefined" && leerActivada(window.localStorage) && !window.dispatchEvent(new CustomEvent(PROTO_ORB_ABRIR_EVENT, { detail: { molecula: id }, cancelable: true })); } catch { return false; }
};
function abrir(ctx: ContextoAccionProto, moleculaId?: string): { ok: boolean; texto: string } {
  try { if (ctx.fijarOrbe) ctx.fijarOrbe(true); } catch {}
  if ((ctx.avisarOrbe ?? avisarEnNavegador)(moleculaId)) return { ok: true, texto: "Abrí la Protomolécula en su orbe." };
  if (!ctx.abrirRuta) return { ok: false, texto: "Desde aquí no puedo abrir la Protomolécula." };
  ctx.abrirRuta(moleculaId ? `/protomolecula?molecula=${encodeURIComponent(moleculaId)}` : "/protomolecula");
  return { ok: true, texto: "Abrí la Protomolécula en su página." };
}
/** Salud: por nombre de métrica o porque un wearable lo movió. Su valor nunca entra al prompt de un agente (ni al mover ni al deshacer). */
function esSalud(e: EstadoControl, c: CandidatoParametro): boolean {
  if ([c.parametro.id, c.parametro.nombre].some((s) => SALUD.has(normalizar(s).replace(/\s+/g, "-")))) return true;
  return [...e.historial.hechos, ...e.historial.rehacer].some((h) => claveDe(h.operacion.objetivo) === claveDe(c.ref) && metricaDeFuente(h.operacion.fuente) !== undefined);
}
function linea(e: EstadoControl, c: CandidatoParametro): string {
  const p = c.parametro, cabeza = `${p.nombre} (${c.atomo ?? c.ref.atomoId})`;
  if (esSalud(e, c)) return `${cabeza}: oculto, posible dato de salud (no se comparte con agentes)`;
  const rango = p.tipo === "opcion" ? ` [${(p.opciones ?? []).join(" | ")}]`
    : p.min !== undefined && p.max !== undefined ? ` [${num(p.min)}–${num(p.max)}]` : "";
  return `${cabeza}: ${p.tipo === "disparo" ? "botón" : formatearValor(p, valorActual(e.molecula.valores, c.ref, p))}${rango}`;
}
const delAtomo = (cs: CandidatoParametro[], atomo: string): CandidatoParametro[] => atomo ? cs.filter((c) => c.ref.atomoId === atomo || normalizar(c.atomo ?? "") === normalizar(atomo)) : cs;
/** Resumen COMPACTO para el prompt: una línea por control, como mucho 40 líneas y 4 KB. */
function estado(c: Controlador, atomo: string): string {
  const e = c.obtener(), m = e.molecula, cs = delAtomo(candidatosDe(m), atomo);
  const pend = e.pendientes.length ? `, ${e.pendientes.length} pendientes de confirmar` : "";
  const l = [`Molécula «${m.titulo.slice(0, 80)}» (${m.ambito}): ${cs.length} controles${pend}.`, ...cs.map((x) => linea(e, x))];
  if (l.length <= TOPE_LINEAS_ESTADO && bytes(l.join("\n")) <= TOPE_BYTES_ESTADO) return l.join("\n");
  const corte = (n: number) => [...l.slice(0, n), `… y ${l.length - n} controles más: pide {"accion":"estado","atomo":"<átomo>"}.`].join("\n");
  let n = TOPE_LINEAS_ESTADO - 1;
  while (n > 1 && bytes(corte(n)) > TOPE_BYTES_ESTADO) n--;
  return corte(n);
}
/** Por nombre, id o sinónimo; con dos iguales NO adivina y dice cuáles son. */
function resolver(cs: CandidatoParametro[], nombre: string, atomo: string): CandidatoParametro | string {
  const n = normalizar(nombre), nombres = (c: CandidatoParametro) => [c.parametro.nombre, c.parametro.id, ...(c.parametro.sinonimos ?? [])];
  const hits = delAtomo(cs.filter((c) => nombres(c).some((s) => normalizar(s) === n)), atomo);
  if (hits.length === 1) return hits[0];
  const cuales = hits.map((c) => `«${c.atomo ?? c.ref.atomoId}» (átomo ${c.ref.atomoId})`).join(" y ");
  if (hits.length > 1) return `Hay ${hits.length} controles llamados «${nombre}»: ${cuales}. No adivino: repite con {"atomo":"<átomo>"}.`;
  return `No encontré el control «${nombre}». Controles: ${[...new Set(cs.map((c) => c.parametro.nombre))].slice(0, 8).join(", ") || "ninguno abierto"}.`;
}
function accionDe(p: Parametro, a: Record<string, unknown>): Accion | string {
  if (p.tipo === "disparo") return { tipo: "disparo" };
  if (p.tipo === "booleano" && a.valor === "alternar") return { tipo: "alternar" };
  const cantidad = numeroDe(a.cambio), modo = (texto(a.modo) || "delta") as ModoRelativo, x = p.tipo === "numero" || p.tipo === "entero" ? numeroDe(a.valor) : null;
  if (a.cambio !== undefined) return cantidad === null ? "«cambio» tiene que ser un número." : MODOS.includes(modo) ? { tipo: "relativa", cantidad, modo } : `Modo desconocido «${modo}». Usa: ${MODOS.join(", ")}.`;
  if (x !== null) return { tipo: "exacta", valor: x };
  return typeof a.valor === "boolean" || typeof a.valor === "string" ? { tipo: "exacta", valor: a.valor } : "Falta «valor» (exacto) o «cambio» con su «modo».";
}
/** Cada frase de un dictado: aplicada, pendiente de la persona o no entendida (con la sugerencia del núcleo). */
function dictar(c: Controlador, frase: string, autor: Autor): ResultadoAccionProto {
  if (!frase) return no("Falta «frase»: por ejemplo «sube el brillo un 10 %».");
  const r = c.dictar(frase, autor, "agente"), pend = new Set(r.pendientes.map((p) => p.operacion.id));
  const hechos = new Set(c.obtener().historial.hechos.map((h) => h.operacion.id));
  const partes = r.resultados.map((x) => (!x.ok ? `No aplicado: ${x.razon} ${x.sugerencia}` : pend.has(x.operacion.id) ? `${x.resumen}: ${PENDIENTE}`
    : hechos.has(x.operacion.id) || (x.operacion.accion.tipo === "disparo" && r.aplicados > 0) ? `Aplicado: ${x.resumen}` : `No cambió: ${x.resumen} (ya tenía ese valor o tu rol no permite moverlo)`));
  return { ok: r.aplicados > 0, message: partes.join(" · "), status: "Dictando a la Protomolécula…" };
}
/** «convertir» (Filee, 2026-10-23): no necesita molécula; abre el conversor del OS con el archivo y el formato. */
function convertir(ctx: ContextoAccionProto, a: Record<string, unknown>): ResultadoAccionProto {
  const destino = formatoDe(texto(a.a) || texto(a.formato)), url = texto(a.url), nombre = texto(a.archivo) || texto(a.nombre);
  if (!ctx.abrirRuta) return no("Desde aquí no puedo abrir el conversor.");
  const q = new URLSearchParams();
  if (url) q.set("url", url);
  if (nombre) q.set("nombre", nombre);
  if (destino) q.set("a", destino);
  ctx.abrirRuta(q.toString() ? `/convertir?${q}` : "/convertir");
  if (!url) return si(`Abrí el conversor${destino ? ` para pasar a ${etiquetaFormato(destino)}` : ""}: suelta ahí el archivo (o pídemelo con «convertir_archivo» y su nombre).`, "Abriendo el conversor…");
  return si(destino ? `Convirtiendo «${nombre || "el archivo"}» a ${etiquetaFormato(destino)} con Filee.` : `Abrí «${nombre || "el archivo"}» en el conversor.`, "Convirtiendo con Filee…");
}
/** «video.componer» (HFR1018M): prepara la composición y devuelve el html y la petición de voz; no renderiza. */
function componer(args: Record<string, unknown>): ResultadoAccionProto {
  const crudo = args.pedido;
  const pedido: EntradaPedido = typeof crudo === "string" ? crudo
    : crudo && typeof crudo === "object" ? (() => { const o = crudo as Record<string, unknown>; return { titulo: texto(o.titulo), texto: texto(o.texto), narracion: texto(o.narracion), guion: texto(o.guion) }; })()
    : texto(args.titulo) || texto(args.texto);
  const r = componerVideo({ pedido, duracion: numeroDe(args.duracion) ?? DURACION_DEFECTO, formato: texto(args.formato) || "mp4", voz: texto(args.voz) || undefined });
  const resumen = r.avisos.length ? `Composición lista con ${r.avisos.length} aviso(s): ${r.avisos.join(" ")}` : "Composición lista, sin avisos.";
  const voz = r.peticionVoz ? " La voz queda pedida a la puerta única." : "";
  return { ok: true, message: conContextoDiseno(`${resumen}${voz} Siguiente: ${r.siguiente}.\n${r.html}`, { nombre: tituloPedido(pedido), registroMovimiento: registroVivo() }), status: "Componiendo el vídeo…", datos: { ...r } };
}
/** «diagrama.crear» (DGM1018F · skill diagram-design, MIT): sin «respuesta» arma el contexto y pide el HTML; con él lo valida y devuelve los datos del iframe aislado. */
function diagramaCrear(args: Record<string, unknown>): ResultadoAccionProto {
  const animado = args.animado === true, tipo = texto(args.tipo) || undefined;
  if (typeof args.respuesta === "string" && args.respuesta.trim()) {
    const r = recibirDiagrama(args.respuesta, { animado, tipo });
    if (!r.ok) return no(`No mostré el diagrama: ${r.motivos.join("; ") || "no pasó la validación"}. Corrige el HTML y repite con «respuesta».`);
    return { ok: true, message: "Diagrama listo dentro de su iframe aislado: sin red ni acceso al origen del OS.", status: "Mostrando el diagrama…", datos: { ...r } };
  }
  const tamano = texto(args.tamano), c = pedidoDiagrama({
    peticion: texto(args.peticion), tipo, animado,
    tamano: tamano === "tarjeta" || tamano === "resumen" ? (tamano as TamanoDiagrama) : undefined,
  });
  const avisos = c.avisos.length ? ` ${c.avisos.join(" ")}` : "";
  return { ok: true, status: "Pidiendo el diagrama…",
    message: `Pedido del diagrama listo: tipo «${c.tipo}», tamaño ${c.tamano}.${avisos}\n${c.instruccion}`,
    datos: { tipo: c.tipo, tamano: c.tamano, animado: c.animado, avisos: c.avisos, instruccion: c.instruccion } };
}
/** «referencias.buscar» (RFI1018F): tema/subtema, orden por personalidad y ADN, y solo canales oficiales conectados; lo privado no sale. */
const TIPOS_CONTEXTO: readonly TipoContexto[] = ["perfil", "pagina", "grupo", "mensaje", "publicacion", "pizarra", "escritorio"];
async function referenciasBuscar(args: Record<string, unknown>, ctx: ContextoAccionProto): Promise<ResultadoAccionProto> {
  const peticion = texto(args.peticion) || texto(args.consulta) || texto(args.frase);
  if (!peticion) return no("Falta «peticion»: dime qué inspiración o referencia buscas.");
  const crudo = args.contexto, c = crudo && typeof crudo === "object" ? crudo as Record<string, unknown> : {};
  const tipoCrudo = texto(c.tipo) as TipoContexto, tipo = TIPOS_CONTEXTO.includes(tipoCrudo) ? tipoCrudo : "escritorio";
  const privado = c.privado !== false;
  const tarjetas = await buscarReferencias({
    peticion, contexto: { tipo, privado }, personalidad: args.personalidad as Personalidad | undefined,
    adnDiseno: args.adnDiseno as AdnDiseno | undefined,
  }, {
    catalogo: catalogoReferencias as unknown as Catalogo, ...ctx.referencias, ahora: ctx.ahora,
  });
  const lista = tarjetas.map((t) => `· ${t.entradaId} (${t.canalUsado}): ${t.porque}`).join("\n");
  return { ok: true, status: "Buscando referencias…", datos: { tarjetas },
    message: `Referencias para ${tipo}${privado ? " (privado: solo en tus neuronas)" : ""}:\n${lista || "ninguna encaja"}` };
}
export function manejarAccionProtomolecula(args: Record<string, unknown>, ctx: ContextoAccionProto = {}): ResultadoAccionProto {
  const accion = texto(args.accion), moleculaId = texto(args.molecula) || undefined, atomo = texto(args.atomo);
  const autor: Autor = { tipo: "agente", id: texto(args.agente) || "astraura" }, herramienta = texto(args.herramienta);
  if (accion === "proponer-codigo") return no(MENSAJE_PROPONER_CODIGO);
  if (accion === "pedir") return no("«pedir» espera a la IA para planificar: usa manejarAccionProtomoleculaAsync.");
  if (accion === "referencias.buscar") return no("«referencias.buscar» consulta canales: usa manejarAccionProtomoleculaAsync.");
  if (!ACCIONES.includes(accion)) return no(`No conozco la acción «${accion}». Usa: ${ACCIONES.join(", ")}.`);
  if (accion === "convertir") return convertir(ctx, args);
  if (accion === "video.componer") return componer(args);
  if (accion === "diagrama.crear") return diagramaCrear(args);
  if (accion === "activar") {
    const fijar = ctx.fijarOrbe ?? ((a: boolean) => fijarOrbeActivada(a));
    fijar(true);
    return si("Activé la orbe de la Protomolécula en todas tus neuronas.", "Protomolécula");
  }
  if (accion === "desactivar") {
    const fijar = ctx.fijarOrbe ?? ((a: boolean) => fijarOrbeActivada(a));
    fijar(false);
    return si("Desactivé la orbe de la Protomolécula en todas tus neuronas.", "Protomolécula");
  }
  if (accion === "alternar") {
    const nuevo = alternarOrbe();
    return si(nuevo ? "Activé la orbe de la Protomolécula en todas tus neuronas." : "Desactivé la orbe de la Protomolécula en todas tus neuronas.", "Protomolécula");
  }
  if (accion === "cerrar") {
    try { ctx.cerrarOrbe?.(); } catch {}
    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(PROTO_ORB_CERRAR_EVENT));
      }
    } catch {}
    return si("Cerré el panel de la Protomolécula.", "Protomolécula");
  }
  const c = controladorActivo(moleculaId);
  if (accion === "abrir" && !herramienta) { const a = abrir(ctx, moleculaId); return { ok: a.ok, message: a.texto, status: "Abriendo la Protomolécula…" }; }
  if (!c) return no(`Abre una molécula primero. ${abrir(ctx, moleculaId).texto}`);
  const m = c.obtener().molecula;
  if (!alcanceVisiblePara(ctx.actor ?? { tipo: "agente-personal" }).includes(m.ambito)) return no(`Esta molécula es de ámbito «${m.ambito}» y este agente no lo alcanza.`);
  if (accion === "estado") return si(estado(c, atomo));
  if (accion === "dictar") return dictar(c, texto(args.frase), autor);
  if (accion === "abrir") {
    const abierto = abrir(ctx, moleculaId).texto, antes = c.obtener().pendientes.length;
    const r = c.anadirAtomo(herramienta, texto(args.titulo) || undefined, "agente");
    if (r.ok) return si(`${abierto} Añadí «${r.atomo.titulo ?? herramienta}».`);
    return no(`${abierto} ${c.obtener().pendientes.length > antes ? `Añadir «${herramienta}» ${PENDIENTE}.` : `No añadí «${herramienta}»: ${r.motivo}`}`);
  }
  if (accion === "deshacer") {
    const e = c.obtener(), ultimo = [...e.historial.hechos].reverse().find((h) => h.operacion.autor.id === autor.id);
    if (ultimo && ultimo.operacion.autor.tipo !== "agente") return no(`No deshice nada: lo último de «${autor.id}» lo hizo una persona, y un agente solo deshace lo suyo.`);
    const r = c.deshacer(autor.id), x = r.ok ? candidatosDe(m).find((k) => claveDe(k.ref) === claveDe(r.cambio.operacion.objetivo)) : undefined;
    return !r.ok ? no(`No deshice nada: ${r.motivo} (solo deshago lo de «${autor.id}»).`) : si(`Deshecho lo último de «${autor.id}»: ${!x ? "listo"
      : esSalud(e, x) ? `«${x.parametro.nombre}» vuelve a su valor anterior (posible dato de salud: no te lo digo)` : `${x.parametro.nombre} vuelve a ${formatearValor(x.parametro, r.cambio.antes)}`}.`);
  }
  const nombre = texto(args.parametro), hit = nombre ? resolver(candidatosDe(m), nombre, atomo) : "Falta «parametro»: pide antes el estado.";
  if (typeof hit === "string") return no(hit);
  const a = accionDe(hit.parametro, args);
  if (typeof a === "string") return no(a);
  const id = ctx.nuevoId ? ctx.nuevoId() : `agente-${Date.now().toString(36)}-${++secuencia}`, salud = esSalud(c.obtener(), hit), nom = hit.parametro.nombre;
  const r = c.mover({ id, objetivo: hit.ref, accion: a, autor, origen: "agente", t: (ctx.ahora ?? Date.now)(), texto: `mover ${nombre}` });
  if (r.ok) return si(salud ? `Hecho: moví «${nom}»; es un posible dato de salud y no te digo su valor.` : hit.parametro.tipo === "disparo" ? `Hecho: disparé «${nom}».`
    : `Hecho: ${describirCambio(hit.parametro, r.cambio)}.${r.cambio.nota ? ` ${r.cambio.nota}` : ""}`, "Moviendo un control…");
  return no(r.pendiente ? `«${nom}» ${PENDIENTE} (${r.motivo})` : `No se movió «${nom}»: ${r.motivo}`);
}

/**
 * Igual que `manejarAccionProtomolecula`, y además atiende `pedir` (Ola 1026P · P3): convierte una petición en un PLAN
 * y lo deja pendiente de que la persona lo confirme en la ventana. Un agente nunca ejecuta directamente.
 */
export async function manejarAccionProtomoleculaAsync(args: Record<string, unknown>, ctx: ContextoAccionProto = {}): Promise<ResultadoAccionProto> {
  if (texto(args.accion) === "referencias.buscar") return referenciasBuscar(args, ctx);
  if (texto(args.accion) !== "pedir") return manejarAccionProtomolecula(args, ctx);
  const { pedirComoAgente } = await import("./peticion/pedir");
  const r = await pedirComoAgente(args, { actor: ctx.actor });
  // La creación con IA viaja con el contexto de diseño del ADN: el agente lo recibe junto al plan, sin cambiar su contrato.
  return r.ok ? { ...r, message: conContextoDiseno(r.message, { registroMovimiento: registroVivo() }) } : r;
}
