/**
 * Cámaras de la llamada (VID1110A) — qué cámara es cada una, cuál se elige sola y qué se recuerda.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Motivo (prueba.32, 09-11): el Mac abrió el iPhone (Cámara de Continuidad) como webcam sin que nadie lo pidiera,
 * porque la llamada pedía `facingMode: "user"` y macOS prefiere la cámara de Continuidad si el teléfono está cerca.
 * Regla de Alex: por defecto, SIEMPRE las cámaras del propio aparato con todas sus opciones; el iPhone (o cualquier
 * otro aparato) como cámara es una opción configurable, nunca la elección automática.
 *
 * Puro (sin DOM salvo `localStorage`, protegido). Orden de preferencia al elegir sola:
 *   integrada (frontal primero) › externa USB › Continuidad › virtual.
 * Una elección que la persona hizo antes (guardada por neurona) manda sobre todo lo demás mientras siga disponible.
 */

export type TipoCamara = "integrada" | "continuidad" | "externa" | "virtual" | "remota";
export type OrientacionCamara = "frontal" | "trasera" | null;

export interface CamaraInfo {
  id: string;
  /** La etiqueta tal cual la da el navegador (vacía antes de dar permiso). */
  etiqueta: string;
  tipo: TipoCamara;
  orientacion: OrientacionCamara;
  /** Nombre claro para la persona («Cámara de esta Mac», «Cámara del iPhone (Continuidad)»…). */
  nombre: string;
  /** LLA1110C: el navegador aún no dijo su nombre (antes del permiso de cámara): no se sabe de qué tipo es. */
  sinEtiqueta?: boolean;
}

export type Plataforma = "mac" | "ios" | "android" | "windows" | "linux" | "otra";

function normalizar(t: string): string {
  return String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const VIRTUALES = /\b(obs|snap camera|virtual|manycam|droidcam|epoccam|camo|xsplit|streamlabs|nvidia broadcast|mmhmm|splitcam|vcam|ndi video|iriun|irium|elgato.*(virtual|screen link)|logi capture|chromacam|youcam|cyberlink|immersed)\b/;
const CONTINUIDAD = /(iphone|ipad|continuity|continuidad|desk view)/;
const INTEGRADA = /(facetime|built-?in|integrated|integrad[ao]|internal|interna\b|isight|macbook|imac\b.*camera|surface (front|back)|(front|back|rear) .*camera|camara (frontal|trasera)|camera2 \d+, facing (front|back)|camera \d+, facing (front|back)|truevision|webcam integrada|hp wide vision|hp hd camera|thinkpad|ideapad|chicony|realtek.*camera|sunplus|azurewave|ov\d{3,4}|laptop)/;
const EXTERNA = /(logitech|c9\d\d|c270|brio|razer|kiyo|elgato|facecam|insta360|obsbot|poly\b|jabra|anker|aukey|hd pro webcam|studio display|usb camera|usb2\.0|usb video|uvc|external|externa|facing external|webcam c\d)/;

/** Cómo mira la cámara: Android la dice en la etiqueta, iOS en «Front/Back Camera»; el resto, sin dato. */
export function orientacionDe(etiqueta: string): OrientacionCamara {
  const t = normalizar(etiqueta);
  if (/(facing front|front|frontal|user\b|selfie|facetime hd)/.test(t)) return "frontal";
  if (/(facing back|back|rear|trasera|environment|ultra wide|telephoto|dual camera|triple camera)/.test(t)) return "trasera";
  return null;
}

/**
 * Qué tipo de cámara es, por su etiqueta. Orden de las reglas importa:
 *  1. virtual (OBS, Snap, DroidCam, Camo…) › 2. Continuidad (iPhone/iPad/Desk View) › 3. integrada › 4. externa › 5. externa por defecto.
 * Una etiqueta vacía (aún sin permiso) se toma por integrada: es lo que hay que probar primero.
 */
export function clasificarCamara(etiqueta: string): TipoCamara {
  const t = normalizar(etiqueta).trim();
  if (!t || esEtiquetaProvisional(etiqueta)) return "integrada";
  if (VIRTUALES.test(t)) return "virtual";
  if (CONTINUIDAD.test(t)) return "continuidad";
  if (INTEGRADA.test(t)) return "integrada";
  if (EXTERNA.test(t)) return "externa";
  return "externa";
}

/**
 * LLA1110C: «Cámara 1», «Camera 2»… es el nombre provisional que pone `listarDispositivos` cuando el navegador aún
 * no da la etiqueta (WebKit antes del permiso de cámara). Antes se clasificaba como «externa»; no se sabe qué es.
 */
export function esEtiquetaProvisional(etiqueta: string): boolean {
  const t = normalizar(etiqueta).trim();
  return !t || /^(camara|camera|video|videoinput)\s*\d*$/.test(t);
}

export function plataformaDe(ua: string | undefined | null): Plataforma {
  const t = String(ua ?? "").toLowerCase();
  if (/android/.test(t)) return "android";
  if (/iphone|ipad|ipod/.test(t)) return "ios";
  if (/mac os x|macintosh/.test(t)) return "mac";
  if (/windows/.test(t)) return "windows";
  if (/linux|x11/.test(t)) return "linux";
  return "otra";
}

const ESTE_APARATO: Record<Plataforma, string> = {
  mac: "esta Mac",
  ios: "este aparato",
  android: "este aparato",
  windows: "este equipo",
  linux: "este equipo",
  otra: "este aparato",
};

/** El nombre del teléfono de Continuidad cuando la etiqueta lo trae («Cámara de Alex (iPhone)»), si no, «iPhone». */
function aparatoDeContinuidad(etiqueta: string): string {
  const t = etiqueta.toLowerCase();
  if (/ipad/.test(t)) return "iPad";
  if (/desk view/.test(t)) return "iPhone";
  return "iPhone";
}

/** Nombre claro y estable para el selector. */
export function nombreCamara(etiqueta: string, tipo: TipoCamara, orientacion: OrientacionCamara, plataforma: Plataforma = "otra", indice = 0): string {
  const crudo = etiqueta.trim();
  const sufijoNum = indice > 0 ? ` ${indice + 1}` : "";
  if (tipo === "integrada") {
    if (orientacion === "trasera") return `Cámara trasera${sufijoNum}`;
    if (orientacion === "frontal" && (plataforma === "android" || plataforma === "ios")) return `Cámara frontal${sufijoNum}`;
    return `Cámara de ${ESTE_APARATO[plataforma]}${sufijoNum}`;
  }
  if (tipo === "continuidad") {
    const base = /desk view/i.test(crudo) ? `Vista de escritorio del ${aparatoDeContinuidad(crudo)} (Continuidad)` : `Cámara del ${aparatoDeContinuidad(crudo)} (Continuidad)`;
    return base;
  }
  if (tipo === "virtual") return `Cámara virtual${crudo ? ` · ${recortar(crudo)}` : ""}`;
  if (tipo === "remota") return crudo || "Cámara de otra neurona";
  return `Cámara externa${crudo ? ` · ${recortar(crudo)}` : ""}`;
}

function recortar(t: string): string {
  return t.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, "").slice(0, 40);
}

export function describirCamaras(lista: ReadonlyArray<{ id: string; nombre: string }>, plataforma: Plataforma = "otra"): CamaraInfo[] {
  const vistos: Partial<Record<TipoCamara, number>> = {};
  return lista.map((c) => {
    const provisional = esEtiquetaProvisional(c.nombre);
    const tipo = clasificarCamara(c.nombre);
    const orientacion = provisional ? null : orientacionDe(c.nombre);
    const i = vistos[tipo] ?? 0;
    vistos[tipo] = i + 1;
    // Dos integradas distintas solo se numeran si miran igual (frontal/trasera ya las distingue).
    const num = orientacion ? 0 : i;
    if (provisional) return { id: c.id, etiqueta: "", tipo, orientacion, nombre: `${c.nombre.trim() || "Cámara"} (sin nombre hasta dar permiso)`, sinEtiqueta: true };
    return { id: c.id, etiqueta: c.nombre, tipo, orientacion, nombre: nombreCamara(c.nombre, tipo, orientacion, plataforma, num) };
  });
}

const RANGO: Record<TipoCamara, number> = { integrada: 0, externa: 1, continuidad: 2, virtual: 3, remota: 4 };

export interface EleccionCamara {
  camara: CamaraInfo | null;
  /** Por qué se eligió esa (queda en el registro). `sin-etiquetas`: sin permiso aún no se sabe cuál es cuál. */
  motivo: "guardada" | "integrada" | "sin-integrada" | "ninguna" | "sin-etiquetas";
}

/**
 * La cámara que se usa SIN que nadie la elija ahora. `guardada`: lo que la persona escogió antes (por id, o por
 * etiqueta si el navegador cambió los ids). Si no, la del propio aparato (la frontal si hay varias), y solo si no
 * hay ninguna, la externa › Continuidad › virtual. Nunca Continuidad ni virtual teniendo una integrada.
 */
export function elegirCamaraPorDefecto(lista: readonly CamaraInfo[], guardada?: { id: string; etiqueta?: string } | null): EleccionCamara {
  if (!lista.length) return { camara: null, motivo: "ninguna" };
  if (guardada) {
    const porId = lista.find((c) => c.id === guardada.id);
    const porEtiqueta = guardada.etiqueta ? lista.find((c) => c.etiqueta && c.etiqueta === guardada.etiqueta) : undefined;
    const g = porId ?? porEtiqueta;
    if (g) return { camara: g, motivo: "guardada" };
  }
  // LLA1110C: sin etiquetas no se adivina (antes todas pasaban por «integradas» y se tomaba la primera, que en la
  // Mac puede ser la Desk View del iPhone). Se deja decidir al sistema y se corrige al tener las etiquetas.
  if (lista.every((c) => c.sinEtiqueta || !c.etiqueta)) return { camara: null, motivo: "sin-etiquetas" };
  const ordenadas = [...lista].sort((a, b) => {
    const r = RANGO[a.tipo] - RANGO[b.tipo];
    if (r) return r;
    // Dentro de las integradas, la frontal (o sin dato) antes que la trasera.
    const fa = a.orientacion === "trasera" ? 1 : 0;
    const fb = b.orientacion === "trasera" ? 1 : 0;
    return fa - fb;
  });
  const c = ordenadas[0];
  return { camara: c, motivo: c.tipo === "integrada" ? "integrada" : "sin-integrada" };
}

/** LLA1110C: el tipo dicho para la persona (chip del selector). */
export const ETIQUETA_TIPO_CAMARA: Record<TipoCamara, string> = {
  integrada: "de este aparato",
  continuidad: "Continuidad",
  externa: "externa",
  virtual: "virtual",
  remota: "otra neurona",
};

/**
 * LLA1110C · qué cámara pedir AL ENCENDERLA, antes de abrir nada. `seleccionId`: la que ya está elegida en la llamada
 * (la persona la escogió en el selector). Si no hay, la de `elegirCamaraPorDefecto` (guardada › integrada…), pero solo
 * con etiquetas: sin ellas devuelve null y se deja al sistema (y se corrige después con `correccionTrasAbrir`).
 */
export function camaraParaEncender(lista: readonly CamaraInfo[], seleccionId: string | null | undefined, guardada?: { id: string; etiqueta?: string } | null): { id: string | null; motivo: EleccionCamara["motivo"] | "seleccionada" } {
  if (seleccionId && lista.some((c) => c.id === seleccionId)) return { id: seleccionId, motivo: "seleccionada" };
  const e = elegirCamaraPorDefecto(lista, guardada);
  return { id: e.camara?.id ?? null, motivo: e.motivo };
}

/**
 * LLA1110C · tras abrir la cámara SIN elegirla (lo decidió el sistema): si lo abierto es Continuidad o virtual y hay
 * una integrada, la integrada a la que hay que cambiar. null: lo abierto vale (o no se sabe).
 */
export function correccionTrasAbrir(lista: readonly CamaraInfo[], abierta: { id?: string | null; etiqueta?: string | null }, guardada?: { id: string; etiqueta?: string } | null): CamaraInfo | null {
  const actual = lista.find((c) => (abierta.id && c.id === abierta.id) || (!!abierta.etiqueta && c.etiqueta === abierta.etiqueta)) ?? null;
  const tipo = actual?.tipo ?? (abierta.etiqueta ? clasificarCamara(abierta.etiqueta) : null);
  if (!tipo || tipo === "integrada" || tipo === "externa") return null;
  const e = elegirCamaraPorDefecto(lista, guardada);
  if (!e.camara || e.camara.tipo !== "integrada" || e.camara.id === actual?.id) return null;
  return e.camara;
}

/** `camara elegida="…" (integrada|continuidad|externa|virtual)` para el registro del enlace. */
export function lineaCamaraElegida(c: Pick<CamaraInfo, "etiqueta" | "nombre" | "tipo">, motivo?: string): string {
  const nombre = (c.etiqueta || c.nombre).replace(/["\u0000-\u001f]+/g, " ").trim().slice(0, 60);
  return `camara elegida="${nombre}" (${c.tipo === "remota" ? "virtual" : c.tipo})${motivo ? ` motivo=${motivo}` : ""}`;
}

/* ───────────────────────── Restricciones al abrir (LLA1111A) ───────────────────────── */

/** ¿Aparato con cámara frontal/trasera (teléfono o tableta)? Solo ahí tiene sentido pedir `facingMode`. */
export function esPlataformaMovil(plataforma: Plataforma): boolean {
  return plataforma === "android" || plataforma === "ios";
}

/**
 * La lista de deseos de vídeo, TODO como `ideal` (LLA1111A). Antes llevaba `frameRate: { max: 30 }` (obligatorio) y
 * `facingMode: "user"` también en el escritorio: en la Mac (prueba.35) toda petición a la «FaceTime HD Camera», a la
 * virtual y al sistema sin id acababa en OverconstrainedError en 2–40 ms, y solo abrían las del iPhone. El único
 * requisito obligatorio común a todas esas peticiones era ese `max`. Un `ideal` nunca hace fallar la apertura. Pura.
 */
export function restriccionesVideoDeseadas(camaraId: string | null | undefined, plataforma: Plataforma, eco: boolean): MediaTrackConstraints {
  return {
    width: { ideal: eco ? 640 : 1280 },
    height: { ideal: eco ? 360 : 720 },
    frameRate: { ideal: eco ? 15 : 24 },
    ...(camaraId ? { deviceId: { exact: camaraId } } : esPlataformaMovil(plataforma) ? { facingMode: { ideal: "user" } } : {}),
  };
}

/**
 * Las restricciones en corto para el registro: «ideal=1280x720@24,deviceId:exact» (sin el id: es largo y no aporta).
 * Lo que no es `ideal` sale con su modo («frameRate:max=30», «facingMode:bare=user»): es lo que puede hacer fallar.
 */
export function textoRestricciones(v: MediaTrackConstraints | boolean | undefined): string {
  if (v === true) return "ninguna";
  if (!v) return "no";
  const c = v as Record<string, unknown>;
  const ideal = (k: string) => (c[k] && typeof c[k] === "object" ? (c[k] as Record<string, unknown>).ideal : undefined);
  const partes: string[] = [];
  const w = ideal("width"), h = ideal("height"), f = ideal("frameRate");
  if (w !== undefined || h !== undefined || f !== undefined) partes.push(`ideal=${w ?? "?"}x${h ?? "?"}${f !== undefined ? `@${f}` : ""}`);
  for (const [k, val] of Object.entries(c)) {
    if (val === undefined) continue;
    if (k === "deviceId" || k === "groupId") {
      partes.push(`${k}:${val && typeof val === "object" ? Object.keys(val).join("+") : "bare"}`);
    } else if (val && typeof val === "object" && !Array.isArray(val)) {
      for (const [m, x] of Object.entries(val as Record<string, unknown>)) if (!(m === "ideal" && (k === "width" || k === "height" || k === "frameRate"))) partes.push(`${k}:${m}=${String(x)}`);
    } else {
      partes.push(`${k}:bare=${String(val)}`);
    }
  }
  return partes.join(",") || "vacia";
}

/* ───────────────────────── Opciones de la cámara (resolución, zoom, linterna…) ───────────────────────── */

export interface OpcionesCamara {
  /** Alto en píxeles pedido (480, 720, 1080); null: la que dé por defecto. */
  alto?: number | null;
  fps?: number | null;
  zoom?: number | null;
  linterna?: boolean | null;
  enfoque?: "continuous" | "manual" | "single-shot" | null;
  exposicion?: "continuous" | "manual" | null;
  /** Solo para mi propia vista: espejo (las videollamadas lo enseñan espejado a quien se mira). */
  espejo?: boolean | null;
}

export interface CapacidadesCamara {
  resoluciones: number[];
  fps: number[];
  zoom: { min: number; max: number; paso: number } | null;
  linterna: boolean;
  enfoque: string[];
  exposicion: string[];
  facing: string[];
}

type RangoCap = { min?: number; max?: number; step?: number } | undefined;

function rango(r: unknown): RangoCap {
  return r && typeof r === "object" ? (r as RangoCap) : undefined;
}

const ALTOS_COMUNES = [240, 360, 480, 720, 1080, 1440, 2160];
const FPS_COMUNES = [10, 15, 24, 30, 60];

/** Lo que esa cámara dice poder hacer (`track.getCapabilities()`); lo que no aparezca no se enseña. */
export function leerCapacidades(pista: { getCapabilities?: () => unknown } | null | undefined): CapacidadesCamara {
  const vacio: CapacidadesCamara = { resoluciones: [], fps: [], zoom: null, linterna: false, enfoque: [], exposicion: [], facing: [] };
  if (!pista || typeof pista.getCapabilities !== "function") return vacio;
  let c: Record<string, unknown>;
  try {
    c = (pista.getCapabilities() ?? {}) as Record<string, unknown>;
  } catch {
    return vacio;
  }
  const alto = rango(c.height);
  const fps = rango(c.frameRate);
  const zoom = rango(c.zoom);
  const lista = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return {
    resoluciones: alto?.max ? ALTOS_COMUNES.filter((h) => h >= (alto.min ?? 0) && h <= alto.max!) : [],
    fps: fps?.max ? FPS_COMUNES.filter((f) => f >= (fps.min ?? 0) && f <= fps.max!) : [],
    zoom: zoom && typeof zoom.min === "number" && typeof zoom.max === "number" && zoom.max > zoom.min ? { min: zoom.min, max: zoom.max, paso: zoom.step && zoom.step > 0 ? zoom.step : 0.1 } : null,
    linterna: c.torch === true,
    enfoque: lista(c.focusMode),
    exposicion: lista(c.exposureMode),
    facing: lista(c.facingMode),
  };
}

/** Las restricciones para `applyConstraints` de unas opciones (solo lo que la cámara admite). */
export function restriccionesDeOpciones(o: OpcionesCamara, cap: CapacidadesCamara): MediaTrackConstraints {
  const out: Record<string, unknown> = {};
  if (o.alto && cap.resoluciones.includes(o.alto)) out.height = { ideal: o.alto };
  if (o.fps && cap.fps.includes(o.fps)) out.frameRate = { ideal: o.fps, max: o.fps };
  const adv: Record<string, unknown>[] = [];
  if (o.zoom != null && cap.zoom) adv.push({ zoom: Math.min(cap.zoom.max, Math.max(cap.zoom.min, o.zoom)) });
  if (o.linterna != null && cap.linterna) adv.push({ torch: o.linterna });
  if (o.enfoque && cap.enfoque.includes(o.enfoque)) adv.push({ focusMode: o.enfoque });
  if (o.exposicion && cap.exposicion.includes(o.exposicion)) adv.push({ exposureMode: o.exposicion });
  if (adv.length) out.advanced = adv;
  return out as MediaTrackConstraints;
}

/* ───────────────────────── Lo que se recuerda, por neurona ───────────────────────── */

export const CLAVE_DISPOSITIVOS = "starseed.llamadas.dispositivos";
export const VERSION_DISPOSITIVOS = 2;

export interface DispositivoGuardado {
  id: string;
  etiqueta: string;
}

export interface PreferenciasNeurona {
  camara?: DispositivoGuardado;
  micro?: DispositivoGuardado;
  altavoz?: DispositivoGuardado;
  /** Opciones por cámara (clave: etiqueta, que sobrevive a los cambios de id). */
  opciones?: Record<string, OpcionesCamara>;
}

export interface AlmacenDispositivos {
  v: 2;
  neuronas: Record<string, PreferenciasNeurona>;
}

function esDispositivo(x: unknown): x is DispositivoGuardado {
  return !!x && typeof x === "object" && typeof (x as DispositivoGuardado).id === "string" && (x as DispositivoGuardado).id.length > 0 && (x as DispositivoGuardado).id.length < 400;
}

function limpiarOpciones(x: unknown): Record<string, OpcionesCamara> | undefined {
  if (!x || typeof x !== "object") return undefined;
  const out: Record<string, OpcionesCamara> = {};
  for (const [k, v] of Object.entries(x as Record<string, unknown>).slice(0, 12)) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const n = (z: unknown) => (typeof z === "number" && Number.isFinite(z) ? z : null);
    out[k.slice(0, 120)] = {
      alto: n(o.alto),
      fps: n(o.fps),
      zoom: n(o.zoom),
      linterna: typeof o.linterna === "boolean" ? o.linterna : null,
      enfoque: o.enfoque === "continuous" || o.enfoque === "manual" || o.enfoque === "single-shot" ? o.enfoque : null,
      exposicion: o.exposicion === "continuous" || o.exposicion === "manual" ? o.exposicion : null,
      espejo: typeof o.espejo === "boolean" ? o.espejo : null,
    };
  }
  return out;
}

/**
 * Lee lo guardado y lo lleva a la versión actual. Acepta:
 *  · v2 (por neurona);
 *  · v1 (global, sin neurona): `{ camara, micro, altavoz }` → se queda para la neurona que lo lee;
 *  · basura o nada → vacío. Nunca lanza.
 */
export function migrarDispositivos(raw: unknown, neuronaActual: string): AlmacenDispositivos {
  const vacio: AlmacenDispositivos = { v: 2, neuronas: {} };
  let o: unknown = raw;
  if (typeof raw === "string") {
    try {
      o = JSON.parse(raw);
    } catch {
      return vacio;
    }
  }
  if (!o || typeof o !== "object") return vacio;
  const r = o as Record<string, unknown>;
  if (r.v === 2 && r.neuronas && typeof r.neuronas === "object") {
    const out: AlmacenDispositivos = { v: 2, neuronas: {} };
    for (const [n, p] of Object.entries(r.neuronas as Record<string, unknown>).slice(0, 20)) {
      if (!p || typeof p !== "object") continue;
      const q = p as Record<string, unknown>;
      out.neuronas[n.slice(0, 120)] = {
        ...(esDispositivo(q.camara) ? { camara: { id: q.camara.id, etiqueta: String(q.camara.etiqueta ?? "").slice(0, 120) } } : {}),
        ...(esDispositivo(q.micro) ? { micro: { id: q.micro.id, etiqueta: String(q.micro.etiqueta ?? "").slice(0, 120) } } : {}),
        ...(esDispositivo(q.altavoz) ? { altavoz: { id: q.altavoz.id, etiqueta: String(q.altavoz.etiqueta ?? "").slice(0, 120) } } : {}),
        ...(limpiarOpciones(q.opciones) ? { opciones: limpiarOpciones(q.opciones) } : {}),
      };
    }
    return out;
  }
  // v1: una sola elección para todo el navegador.
  const p: PreferenciasNeurona = {};
  if (esDispositivo(r.camara)) p.camara = { id: r.camara.id, etiqueta: String(r.camara.etiqueta ?? "").slice(0, 120) };
  if (esDispositivo(r.micro)) p.micro = { id: r.micro.id, etiqueta: String(r.micro.etiqueta ?? "").slice(0, 120) };
  if (esDispositivo(r.altavoz)) p.altavoz = { id: r.altavoz.id, etiqueta: String(r.altavoz.etiqueta ?? "").slice(0, 120) };
  return Object.keys(p).length ? { v: 2, neuronas: { [neuronaActual]: p } } : vacio;
}

function almacen(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function leerPreferencias(neurona: string): PreferenciasNeurona {
  const s = almacen();
  if (!s) return {};
  try {
    const raw = s.getItem(CLAVE_DISPOSITIVOS);
    if (!raw) return {};
    const a = migrarDispositivos(raw, neurona);
    // Si venía en v1, se reescribe ya en v2 (la migración queda hecha).
    try {
      const parsed = JSON.parse(raw) as { v?: number };
      if (parsed?.v !== VERSION_DISPOSITIVOS) s.setItem(CLAVE_DISPOSITIVOS, JSON.stringify(a));
    } catch {
      /* ilegible: se queda vacío */
    }
    return a.neuronas[neurona] ?? {};
  } catch {
    return {};
  }
}

export function guardarPreferencia(neurona: string, cambio: Partial<PreferenciasNeurona>): void {
  const s = almacen();
  if (!s) return;
  try {
    const a = migrarDispositivos(s.getItem(CLAVE_DISPOSITIVOS), neurona);
    const actual = a.neuronas[neurona] ?? {};
    a.neuronas[neurona] = { ...actual, ...cambio, opciones: { ...(actual.opciones ?? {}), ...(cambio.opciones ?? {}) } };
    s.setItem(CLAVE_DISPOSITIVOS, JSON.stringify(a));
  } catch {
    /* sin almacenamiento: la elección vale solo para esta llamada */
  }
}

/* ───────────────────────── Cámara remota: otra neurona como cámara (diseño, primera rebanada) ───────────────────────── */

/**
 * Contrato de la «cámara remota» (ver `architecture/llamadas-telefonia.md`, «Cámaras y cámara remota»).
 * Una neurona de la MISMA cuenta publica su cámara como un flujo (`flujos-neurona`); esta neurona la ofrece en el
 * selector como «Cámara de <neurona>» y, al elegirla, usa ese flujo como su cámara en llamadas, grabaciones y
 * transmisiones. Aún NO se consume (hace falta el puente flujo → MediaStream/canvas): queda tipado para engancharlo.
 */
export interface OrigenCamaraRemota {
  /** Id de la neurona que tiene la cámara (la misma cuenta). */
  neurona: string;
  nombreNeurona: string;
  /** Id estable del flujo de cámara que publica. */
  flujo: string;
  /** Mejor ruta ahora: WebRTC por LAN/Wi-Fi directo, o vídeo ligero por Bluetooth. */
  ruta: "webrtc" | "video-ligero" | "ninguna";
}

export interface FuenteCamaraRemota {
  origen: OrigenCamaraRemota;
  /** La imagen como canvas (vídeo ligero) o como pista (WebRTC); quien llama usa la que venga. */
  lienzo: HTMLCanvasElement | null;
  pista: MediaStreamTrack | null;
  cerrar(): void;
}

/** La entrada del selector para una cámara remota (deshabilitada mientras no haya puente, con su motivo). */
export function camaraRemotaComoInfo(o: OrigenCamaraRemota): CamaraInfo {
  return { id: `remota:${o.neurona}:${o.flujo}`, etiqueta: `Cámara de ${o.nombreNeurona}`, tipo: "remota", orientacion: null, nombre: `Cámara de ${o.nombreNeurona}` };
}
