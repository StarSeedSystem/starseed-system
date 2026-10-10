/**
 * estacion — `estacion.publicar()` y `estacion.seguir()`: transmitir y seguir EN DIRECTO una sesión
 * de la app en una estación pública o privada de StarSeed OS, con el MISMO enlace y el mismo reloj
 * común que el OS (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════
 * Contrato: `architecture/vinculo-apps-starseed-link.md` · SOP de estaciones:
 * `architecture/estaciones-en-vivo-parametricas.md`.
 *
 * Dos modos, la misma interfaz (`EstacionViva`):
 *   · «os»     → la app está abierta DENTRO del OS: se lo pide al OS por `puenteOS()` (el OS crea,
 *                firma, publica en Transmisiones y mide el reloj; la app ve el estado y manda).
 *   · «propia» → web suelta, PWA o app nativa: la app es un medio más de la estación. Crea las
 *                llaves (el id ES la huella de la pública), firma, habla por Supabase Realtime y por
 *                los enlaces locales sin internet, y si es pública la anuncia en el directorio del OS
 *                (`os_estaciones`, fuente «starseed», enlace `/estaciones/vivo/<id>?f=…`). El enlace
 *                que devuelve es una URL del OS: quien lo abra en el OS o en otra app con el kit entra
 *                en la MISMA sesión.
 *
 * Lo que viaja no es audio ni vídeo: es la ficha (parámetros) y una línea de tiempo con instantes
 * en el reloj común; cada medio lo genera en local. `aLocal(t)` da la hora local de un instante
 * común para programarlo (audio con `AudioContext`, imagen con `requestAnimationFrame`).
 * Nunca lanza.
 */

import { almacenPorDefecto, OS_PUBLICO, type Almacen } from "./config";
import { canalInternet, engancharEnlacesLocales } from "./canales";
import { crearLlaves, crearToken, exportarPrivada, idDeLlave, importarPrivada, publicaDePrivada } from "./cripto";
import {
  enlaceAceptable,
  enlaceDeSesion,
  leerEnlaceSesion,
  sanearFicha,
  type AccionLinea,
  type FaseSesion,
  type FichaSesion,
  type FuenteTransmision,
  type ParametrosSesion,
  type TipoAccion,
} from "./modelo";
import { puenteOS, type EstacionDelOS, type PuenteOS } from "./puente-os";
import { SesionEnVivo, type FotoSesion } from "./sesion";
import { usuarioDe, type ClienteSupabase } from "./supabase";

export type AccionEstacion = Exclude<TipoAccion, "base">;

export interface FotoEstacion {
  id: string;
  titulo: string;
  fuente: string;
  privada: boolean;
  fase: FaseSesion;
  /** Instante común en que la reproducción valdría 0 (solo mientras suena). */
  ancla: number | null;
  posicionMs: number;
  params: ParametrosSesion;
  volumen: number;
  /** Próxima acción programada (solo en modo «propia»). */
  proxima: AccionLinea | null;
  /** Este medio puede cambiarla para todos. */
  control: boolean;
  reloj: { modo: string; precisionMs: number | null; cotaMs: number | null };
  conectados: number | null;
  canales: { tipo: string; etiqueta: string; abierto: boolean }[];
  ahoraComun: number;
  /** Mensajes descartados por firma o datos no válidos. */
  descartados: number;
}

export interface EstacionViva {
  readonly modo: "propia" | "os";
  readonly id: string;
  /** Enlace para escuchar/ver (el de la invitación si es privada): una URL del OS. */
  readonly enlace: string;
  /** Enlace para controlarla desde OTRO aparato tuyo (lleva la llave: no se comparte). */
  readonly enlaceControl: string | null;
  /** «publicada», «privada», «siguiendo» o el motivo por el que no salió en el directorio. */
  readonly directorio: string;
  foto(): FotoEstacion | null;
  suscribir(cb: (f: FotoEstacion | null) => void): () => void;
  accion(tipo: AccionEstacion, extra?: { params?: ParametrosSesion; volumen?: number; enMs?: number }): Promise<{ ok: boolean; motivo?: string }>;
  ahoraComun(): number;
  /** Hora LOCAL de un instante común (para programar el sonido o la imagen). */
  aLocal(tComun: number): number;
  cerrar(): void;
}

export interface OpcionesEstacion {
  /** Id de la app («omnifrecuencias», «audiomorphic»…). */
  app: string;
  /** Cliente de Supabase de la app (el de `config()`). Sin él, solo enlaces locales. */
  cliente?: ClienteSupabase | null;
  /** Origen del OS para los enlaces (por defecto el público). */
  os?: string;
  /** «auto» (por defecto): si la app está en un marco y el OS contesta, se usa el OS. */
  puente?: PuenteOS | null | "auto";
  almacen?: Almacen | null;
  /** Enganchar los enlaces locales sin internet (por defecto sí). */
  locales?: boolean;
  /** No anunciar en el directorio aunque sea pública. */
  sinDirectorio?: boolean;
}

export interface DatosPublicar {
  fuente: FuenteTransmision;
  titulo: string;
  /** Enlace de la entonación o espiral en la app (https) o ruta del OS. */
  enlace: string;
  params: ParametrosSesion;
  privada: boolean;
  descripcion?: string;
  categorias?: string[];
}

export type ResultadoEstacion = { ok: true; estacion: EstacionViva } | { ok: false; motivo: string };

/* ═══════════════════════ llaves de ESTE medio ═══════════════════════ */

export const CLAVE_LLAVES = "starseed.link.estaciones.v1";

export interface RegistroLlave {
  control: string;
  token?: string;
  fila?: string;
  enlace: string;
  titulo: string;
  referencia: boolean;
  creada: number;
}

function leerLlaves(almacen: Almacen | null): Record<string, RegistroLlave> {
  try {
    const o = JSON.parse(almacen?.getItem(CLAVE_LLAVES) || "{}") as unknown;
    return o && typeof o === "object" ? (o as Record<string, RegistroLlave>) : {};
  } catch {
    return {};
  }
}

function guardarLlave(almacen: Almacen | null, id: string, r: RegistroLlave): void {
  if (!almacen) return;
  try {
    const todo = leerLlaves(almacen);
    todo[id] = r;
    // Como mucho 40: las más viejas salen (una estación de hace meses ya no se controla desde aquí).
    const ids = Object.keys(todo).sort((a, b) => (todo[b].creada ?? 0) - (todo[a].creada ?? 0)).slice(0, 40);
    almacen.setItem(CLAVE_LLAVES, JSON.stringify(Object.fromEntries(ids.map((k) => [k, todo[k]]))));
  } catch {
    /* sin almacenamiento: se controla mientras dure la pestaña */
  }
}

/** Estaciones que ESTE medio controla (sin las llaves). */
export function misEstaciones(almacen: Almacen | null = almacenPorDefecto()): { id: string; titulo: string; enlace: string; creada: number }[] {
  return Object.entries(leerLlaves(almacen))
    .map(([id, r]) => ({ id, titulo: r.titulo, enlace: r.enlace, creada: r.creada }))
    .sort((a, b) => b.creada - a.creada);
}

/* ═══════════════════════ modo «propia» ═══════════════════════ */

function absoluto(os: string, ruta: string): string {
  try {
    return new URL(ruta, os).toString();
  } catch {
    return ruta;
  }
}

function fotoDeSesion(f: FotoSesion): FotoEstacion {
  return {
    id: f.ficha.id,
    titulo: f.ficha.titulo,
    fuente: f.ficha.fuente,
    privada: f.ficha.privada,
    fase: f.posicion.fase,
    ancla: f.posicion.ancla,
    posicionMs: f.posicion.posicionMs,
    params: f.posicion.params,
    volumen: f.posicion.volumen,
    proxima: f.posicion.proxima,
    control: f.control,
    reloj: { modo: f.reloj.modo, precisionMs: f.reloj.precisionMs, cotaMs: f.reloj.cotaMs },
    conectados: f.oyentes,
    canales: f.canales,
    ahoraComun: 0,
    descartados: f.descartados,
  };
}

const LATIDO_FILA_MS = 60_000;

/** Mantiene la fila del directorio fiel a la sesión (como el OS): latido, pausa y fin. */
function latirFila(sesion: SesionEnVivo, cliente: ClienteSupabase, fila: string): () => void {
  let parado = false;
  let ultima: FaseSesion | null = null;
  const actualizar = async (cambios: Record<string, unknown>) => {
    try {
      await cliente.from("os_estaciones").update(cambios).eq("id", fila);
    } catch {
      /* sin red: el siguiente latido lo intenta */
    }
  };
  const vuelta = async () => {
    if (parado) return;
    const f = sesion.foto();
    if (f.posicion.fase === "sonando") {
      const cambios: Record<string, unknown> = { ultimo_latido: new Date().toISOString() };
      if (typeof f.oyentes === "number") cambios.espectadores = f.oyentes;
      await actualizar(cambios);
    }
    if (!parado) h = setTimeout(() => void vuelta(), LATIDO_FILA_MS);
  };
  const alCambiar = async () => {
    if (parado) return;
    const fase = sesion.foto().posicion.fase;
    if (fase === ultima) return;
    const antes = ultima;
    ultima = fase;
    if (fase === "pausada") await actualizar({ pausada: true });
    else if (fase === "terminada") await actualizar({ termina_en: new Date().toISOString() });
    else if (fase === "sonando") {
      const cambios: Record<string, unknown> = { ultimo_latido: new Date().toISOString() };
      if (antes === "pausada") cambios.pausada = false;
      if (antes === "terminada") cambios.termina_en = null;
      await actualizar(cambios);
    }
  };
  const baja = sesion.suscribir(() => void alCambiar());
  const mirar = setInterval(() => void alCambiar(), 2_000);
  let h = setTimeout(() => void vuelta(), 5_000);
  return () => {
    parado = true;
    baja();
    clearInterval(mirar);
    clearTimeout(h);
  };
}

async function montarPropia(
  sesion: SesionEnVivo,
  op: OpcionesEstacion,
  datos: { enlace: string; enlaceControl: string | null; directorio: string; token: string | null; fila?: string },
): Promise<EstacionViva> {
  const bajas: (() => void)[] = [];
  const internet = await canalInternet(op.cliente, sesion.ficha.id, sesion.ficha.privada ? datos.token : null).catch(() => null);
  if (internet) sesion.agregarCanal(internet);
  if (op.locales !== false) {
    bajas.push(engancharEnlacesLocales((c) => sesion.agregarCanal(c), (c) => sesion.quitarCanal(c)));
  }
  sesion.arrancar();
  if (datos.fila && op.cliente) bajas.push(latirFila(sesion, op.cliente, datos.fila));
  const foto = () => ({ ...fotoDeSesion(sesion.foto()), ahoraComun: sesion.ahora() });
  return {
    modo: "propia",
    id: sesion.ficha.id,
    enlace: datos.enlace,
    enlaceControl: datos.enlaceControl,
    directorio: datos.directorio,
    foto,
    suscribir: (cb) => avisarEnCadaInstante(sesion, () => cb(foto())),
    accion: async (tipo, extra = {}) => {
      const r = await sesion.accion(tipo, extra);
      return { ok: r.ok, motivo: r.motivo };
    },
    ahoraComun: () => sesion.ahora(),
    aLocal: (t) => sesion.reloj.aLocal(t),
    cerrar: () => {
      for (const b of bajas.splice(0)) {
        try {
          b();
        } catch {
          /* nada */
        }
      }
      sesion.cerrar();
    },
  };
}

/**
 * Avisa en cada cambio de la sesión Y en el instante común de la próxima acción programada
 * (iniciar, pausar, reanudar…). Las acciones se programan 600 ms en el futuro para que lleguen a
 * todos a tiempo; sin este aviso, quien pinta la foto la seguía viendo «esperando» aunque ya
 * sonara, hasta el siguiente mensaje (medido en Omnifrecuencias con dos aparatos, 2026-10-10).
 */
function avisarEnCadaInstante(sesion: SesionEnVivo, avisar: () => void): () => void {
  let h: ReturnType<typeof setTimeout> | null = null;
  let parado = false;
  const programar = () => {
    if (h) clearTimeout(h);
    h = null;
    if (parado) return;
    const p = sesion.foto().posicion.proxima;
    if (!p) return;
    const enMs = Math.min(Math.max(0, p.t - sesion.ahora()) + 2, 2_000_000_000);
    h = setTimeout(() => {
      h = null;
      if (parado) return;
      avisar();
      programar();
    }, enMs);
  };
  const baja = sesion.suscribir(() => {
    avisar();
    programar();
  });
  programar();
  return () => {
    parado = true;
    baja();
    if (h) clearTimeout(h);
  };
}

/* ═══════════════════════ modo «os» ═══════════════════════ */

function fotoDelOS(e: EstacionDelOS | null, puente: PuenteOS): FotoEstacion | null {
  if (!e) return null;
  return {
    id: e.id,
    titulo: e.titulo,
    fuente: e.fuente,
    privada: e.privada,
    fase: e.fase,
    ancla: e.ancla,
    posicionMs: e.posicionMs,
    params: e.params,
    volumen: e.volumen,
    proxima: null,
    control: e.control,
    reloj: e.reloj,
    conectados: e.conectados,
    canales: [{ tipo: "os", etiqueta: "StarSeed OS (esta ventana)", abierto: puente.conectado() }],
    ahoraComun: puente.ahoraComun(),
    descartados: 0,
  };
}

function estacionPorOS(puente: PuenteOS, d: { id: string; enlace: string; enlaceControl: string | null; directorio: string }): EstacionViva {
  return {
    modo: "os",
    id: d.id,
    enlace: d.enlace,
    enlaceControl: d.enlaceControl,
    directorio: d.directorio,
    foto: () => fotoDelOS(puente.estadoActual(), puente),
    suscribir: (cb) => puente.alEstado((e) => cb(fotoDelOS(e, puente))),
    accion: (tipo, extra = {}) => puente.accion(tipo, { params: extra.params, volumen: extra.volumen }),
    ahoraComun: () => puente.ahoraComun(),
    aLocal: (t) => puente.aLocal(t),
    cerrar: () => {
      puente.salir();
      puente.desconectar();
    },
  };
}

async function resolverPuente(op: OpcionesEstacion): Promise<PuenteOS | null> {
  if (op.puente === null) return null;
  if (op.puente && op.puente !== "auto") return op.puente;
  return puenteOS({ app: op.app }).catch(() => null);
}

/* ═══════════════════════ API ═══════════════════════ */

/** Publica una estación EN VIVO con la sesión actual de la app. */
export async function publicar(d: DatosPublicar, op: OpcionesEstacion): Promise<ResultadoEstacion> {
  const os = op.os ?? OS_PUBLICO;
  if (!enlaceAceptable(d.enlace)) return { ok: false, motivo: "El enlace de la sesión en la app debe ser https." };

  const puente = await resolverPuente(op);
  if (puente) {
    try {
      const c = await puente.crear({ titulo: d.titulo, enlace: d.enlace, params: d.params, privada: d.privada });
      return { ok: true, estacion: estacionPorOS(puente, { id: c.id, enlace: c.enlace, enlaceControl: c.enlaceControl, directorio: c.directorio }) };
    } catch (e) {
      puente.desconectar();
      return { ok: false, motivo: e instanceof Error ? e.message : "StarSeed OS no pudo crear la estación." };
    }
  }

  let llaves;
  try {
    llaves = await crearLlaves();
  } catch {
    return { ok: false, motivo: "Este medio no puede crear las llaves de la estación (WebCrypto)." };
  }
  const id = await idDeLlave(llaves.publica);
  const ficha = sanearFicha({
    v: 1,
    id,
    fuente: d.fuente,
    titulo: d.titulo,
    enlace: d.enlace,
    pk: llaves.publica,
    privada: d.privada,
    params: d.params,
    creada: Date.now(),
  });
  if (!ficha) return { ok: false, motivo: "Revisa el título (2–100 letras), el enlace (https) y los parámetros." };
  const token = d.privada ? crearToken() : null;
  const control = await exportarPrivada(llaves.privada);
  const ruta = enlaceDeSesion(ficha, { token: token ?? undefined });
  const enlace = absoluto(os, ruta);
  const enlaceControl = absoluto(os, enlaceDeSesion(ficha, { token: token ?? undefined, control }));
  const almacen = op.almacen === undefined ? almacenPorDefecto() : op.almacen;

  let directorio = d.privada ? "privada" : "no publicada";
  let fila: string | undefined;
  if (!d.privada && !op.sinDirectorio) {
    const r = await anunciarEnDirectorio(op.cliente, ficha, ruta, d);
    // «in» y no «if (r.ok) … else»: así también estrecha el tipo en apps que compilan sin «strict».
    if ("fila" in r) {
      fila = r.fila;
      directorio = "publicada";
    } else if ("motivo" in r) directorio = r.motivo;
  }
  guardarLlave(almacen, id, { control, token: token ?? undefined, fila, enlace, titulo: ficha.titulo, referencia: true, creada: ficha.creada });
  const sesion = new SesionEnVivo({ ficha, token, llave: llaves.privada, referencia: true });
  return { ok: true, estacion: await montarPropia(sesion, op, { enlace, enlaceControl, directorio, token, fila }) };
}

async function anunciarEnDirectorio(
  cliente: ClienteSupabase | null | undefined,
  ficha: FichaSesion,
  ruta: string,
  d: DatosPublicar,
): Promise<{ ok: true; fila: string } | { ok: false; motivo: string }> {
  if (!cliente) return { ok: false, motivo: "sin conexión con StarSeed OS: solo por enlace" };
  const u = await usuarioDe(cliente);
  if (!u) return { ok: false, motivo: "entra con tu cuenta de StarSeed OS para salir en Transmisiones" };
  const categorias = Array.from(new Set([ficha.fuente, "en-vivo", ...(d.categorias ?? [])].map((c) => c.trim().toLowerCase()).filter((c) => c && c.length <= 24))).slice(0, 8);
  try {
    const { data, error } = await cliente
      .from("os_estaciones")
      .insert({
        owner_id: u.id,
        ambito_tipo: "persona",
        entidad_ref: null,
        titulo: ficha.titulo,
        descripcion: (d.descripcion ?? "").slice(0, 1000),
        tipo: ficha.fuente === "omnifrecuencias" ? "audio" : "mixto",
        fuente: "starseed",
        enlace: ruta,
        formato: "interno",
        imagen: null,
        idioma: "es",
        categorias,
        licencia: "cc-by",
        visibilidad: "publica",
        empieza_en: null,
        termina_en: null,
        en_malla: false,
        pausada: false,
        espectadores: 0,
      })
      .select("id")
      .single();
    if (error || !data?.id) return { ok: false, motivo: error?.message || "el directorio no la aceptó" };
    return { ok: true, fila: String(data.id) };
  } catch {
    return { ok: false, motivo: "el directorio no respondió" };
  }
}

/**
 * Sigue una estación por su enlace (el del OS, el de una invitación privada o el de control de
 * otro aparato tuyo). Con el de control, este medio también puede cambiarla para todos.
 */
export async function seguir(enlace: string, op: OpcionesEstacion): Promise<ResultadoEstacion> {
  const leido = leerEnlaceSesion(enlace);
  if (!leido) return { ok: false, motivo: "Ese enlace no es de una estación en vivo de StarSeed OS." };

  const puente = await resolverPuente(op);
  if (puente) {
    puente.sintonizar(enlace);
    return { ok: true, estacion: estacionPorOS(puente, { id: leido.id, enlace, enlaceControl: null, directorio: "siguiendo" }) };
  }

  if (!leido.ficha) return { ok: false, motivo: "Al enlace le falta la ficha de la estación (cópialo entero)." };
  if (leido.ficha.privada && !leido.token) return { ok: false, motivo: "Es una estación privada: hace falta el enlace de invitación completo." };
  let llave: CryptoKey | null = null;
  if (leido.control) {
    const k = await importarPrivada(leido.control);
    if (k && (await publicaDePrivada(k)) === leido.ficha.pk) llave = k;
  }
  const almacen = op.almacen === undefined ? almacenPorDefecto() : op.almacen;
  // Si este medio ya la controlaba (la creó aquí), recupera su llave y su papel de referencia.
  const propia = leerLlaves(almacen)[leido.id];
  let referencia = false;
  if (!llave && propia) {
    const k = await importarPrivada(propia.control);
    if (k && (await publicaDePrivada(k)) === leido.ficha.pk) {
      llave = k;
      referencia = propia.referencia;
    }
  }
  const sesion = new SesionEnVivo({ ficha: leido.ficha, token: leido.token, llave, referencia });
  const os = op.os ?? OS_PUBLICO;
  const limpio = absoluto(os, enlaceDeSesion(leido.ficha, { token: leido.token ?? undefined }));
  return {
    ok: true,
    estacion: await montarPropia(sesion, op, {
      enlace: limpio,
      enlaceControl: llave ? absoluto(os, enlaceDeSesion(leido.ficha, { token: leido.token ?? undefined, control: await exportarPrivada(llave) })) : null,
      directorio: "siguiendo",
      token: leido.token,
      fila: referencia ? propia?.fila : undefined,
    }),
  };
}

/** Retoma una estación que creó ESTE medio (tras recargar la app). */
export async function retomar(id: string, op: OpcionesEstacion): Promise<ResultadoEstacion> {
  const almacen = op.almacen === undefined ? almacenPorDefecto() : op.almacen;
  const r = leerLlaves(almacen)[id];
  if (!r) return { ok: false, motivo: "Este aparato no tiene la llave de esa estación." };
  return seguir(r.enlace, { ...op, almacen, puente: null });
}

export interface FilaDirectorio {
  id: string;
  titulo: string;
  descripcion: string;
  /** URL del OS de la sesión en vivo. */
  enlace: string;
  categorias: string[];
  pausada: boolean;
  espectadores: number;
  ultimoLatido: string | null;
}

/**
 * Estaciones EN VIVO públicas del directorio del OS para esta app (las de fuente «starseed» con
 * enlace de sesión y la categoría de la app). «En directo» = latido de los últimos 3 minutos.
 */
export async function directorio(
  cliente: ClienteSupabase | null | undefined,
  op: { app: string; os?: string; limite?: number; soloEnDirecto?: boolean },
): Promise<FilaDirectorio[]> {
  if (!cliente) return [];
  try {
    const { data, error } = await cliente
      .from("os_estaciones")
      .select("id,titulo,descripcion,enlace,categorias,pausada,espectadores,ultimo_latido,termina_en")
      .eq("fuente", "starseed")
      .like("enlace", "/estaciones/vivo/%")
      .contains("categorias", [op.app])
      .is("termina_en", null)
      .order("updated_at", { ascending: false })
      .limit(Math.min(Math.max(op.limite ?? 30, 1), 100));
    if (error || !Array.isArray(data)) return [];
    const os = op.os ?? OS_PUBLICO;
    const ahora = Date.now();
    return (data as Record<string, unknown>[])
      .map((f) => ({
        id: String(f.id),
        titulo: String(f.titulo ?? ""),
        descripcion: String(f.descripcion ?? ""),
        enlace: absoluto(os, String(f.enlace ?? "")),
        categorias: Array.isArray(f.categorias) ? (f.categorias as unknown[]).map(String) : [],
        pausada: f.pausada === true,
        espectadores: typeof f.espectadores === "number" ? f.espectadores : 0,
        ultimoLatido: typeof f.ultimo_latido === "string" ? f.ultimo_latido : null,
      }))
      .filter((f) => !op.soloEnDirecto || (f.ultimoLatido !== null && ahora - Date.parse(f.ultimoLatido) < 180_000));
  } catch {
    return [];
  }
}
