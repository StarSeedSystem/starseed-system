"use client";

// ════════════════════════════════════════════════════════════════════════════
// Aurora · GENERAR y USAR contenido — acciones locales (ejecución en navegador)
// ----------------------------------------------------------------------------
// Este módulo da a Aurora la capacidad de GENERAR y COLOCAR contenido libremente
// en cualquier contexto/chat, a petición del usuario ("crea una nota…",
// "publícalo", "abre una pizarra", "busca en la web…", "búscalo en la
// librería"). No llama a ninguna integración: opera sobre los stores/rutas que
// el OS ya usa (Biblioteca, Publicar, Pizarras, Navegador, tablero/escritorio) y
// sobre el DOM/eventos del navegador.
//
// CONTRATO: cada función devuelve un `ContentOutcome` = { ok, message, data? }
//   • message → frase corta en ESPAÑOL, decible en voz alta.
// aurora-tools.ts adapta ese contrato a IntegrationResult (data.text = message),
// exactamente como hace con las tools de control de pantalla.
//
// PRINCIPIOS del proyecto respetados:
//   • Identidad Soberana: lo generado se guarda en el dispositivo (Biblioteca
//     local) o en las rutas del OS del usuario; nada sale a terceros.
//   • Singularidad del contenido: la Biblioteca deduplica por (url + título).
//   • SSR-safe: TODO acceso a window/document/localStorage está guardado; en
//     servidor devolvemos un ContentOutcome honesto sin tocar el navegador.
//   • Defensivo: NADA lanza. Si un destino no existe, degradamos con un mensaje
//     hablado útil (y, cuando aplica, disparamos un evento que un futuro
//     listener puede recoger, sin romper nada si nadie escucha).
//
// COMPLEMENTO: la generación que SÍ llama a SERVICIOS externos configurados por
// función (imagen con Fooocus-API / AUTOMATIC1111, workflows con n8n, sitios
// web, vídeo) vive en el módulo hermano `service-generation.ts`, que resuelve el
// endpoint con `resolveServiceFor()` y guarda el resultado en la Biblioteca. La
// sección de prompt que describe TODAS estas capacidades (locales + con
// servicios) se construye en `aurora-tools.ts::auroraGeneratePromptSection`.
// ════════════════════════════════════════════════════════════════════════════

import { saveResource } from "@/lib/library-store";

/** Resultado decible de una acción de generación de contenido. */
export interface ContentOutcome {
  ok: boolean;
  /** Frase corta en español para leer en voz alta / registrar. */
  message: string;
  /** Datos opcionales (id, url, ruta…) — forma libre y defensiva. */
  data?: Record<string, unknown>;
}

// ── Utilidades base (todas defensivas / SSR-safe) ───────────────────────────

/** ¿Estamos en el navegador (con window)? */
function isClient(): boolean {
  return typeof window !== "undefined";
}

/** ¿Hay localStorage utilizable? */
function hasLocalStorage(): boolean {
  return isClient() && typeof localStorage !== "undefined";
}

/** Coacciona a texto limpio (nunca lanza). */
function toText(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** Genera un id razonablemente único (sin depender de nada). */
let _seq = 0;
function makeId(prefix: string): string {
  try {
    if (isClient() && typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `${prefix}-${crypto.randomUUID()}`;
    }
  } catch {
    /* noop */
  }
  return `${prefix}-${Date.now().toString(36)}-${(_seq++).toString(36)}`;
}

/**
 * Navega dentro del OS SIN acoplar next/navigation (estas acciones se ejecutan
 * fuera de React). Mismo patrón que screen-actions: avisa por evento
 * `starseed:navigate` y hace `window.location.assign` como respaldo real.
 */
function navigateTo(path: string): boolean {
  if (!isClient()) return false;
  try {
    window.dispatchEvent(
      new CustomEvent("starseed:navigate", {
        detail: { path, source: "aurora", at: Date.now() },
      }),
    );
  } catch {
    /* noop */
  }
  try {
    window.location.assign(path);
    return true;
  } catch {
    try {
      window.location.href = path;
      return true;
    } catch {
      return false;
    }
  }
}

/** Dispara un CustomEvent de forma segura (nadie escucha ⇒ no pasa nada). */
function emit(name: string, detail: Record<string, unknown>): void {
  if (!isClient()) return;
  try {
    window.dispatchEvent(new CustomEvent(name, { detail: { source: "aurora", at: Date.now(), ...detail } }));
  } catch {
    /* noop */
  }
}

/**
 * Construye una data URL a partir de texto + mime. Usa base64 cuando es posible
 * (soporta cualquier contenido/UTF-8); si algo falla, cae a URL-encoding. Así el
 * recurso guardado en Biblioteca es abrible/descargable sin backend.
 */
function toDataUrl(content: string, mime: string): string {
  const safeMime = (mime || "text/plain").trim() || "text/plain";
  try {
    if (isClient() && typeof btoa === "function") {
      // Codifica UTF-8 correctamente antes de base64.
      const b64 = btoa(unescape(encodeURIComponent(content)));
      return `data:${safeMime};charset=utf-8;base64,${b64}`;
    }
  } catch {
    /* cae al encoding de abajo */
  }
  try {
    return `data:${safeMime};charset=utf-8,${encodeURIComponent(content)}`;
  } catch {
    return `data:${safeMime};charset=utf-8,`;
  }
}

/** Mapa laxo de extensiones/alias comunes → mime (para crear_archivo). */
const MIME_BY_HINT: Record<string, string> = {
  md: "text/markdown",
  markdown: "text/markdown",
  txt: "text/plain",
  text: "text/plain",
  json: "application/json",
  csv: "text/csv",
  html: "text/html",
  htm: "text/html",
  xml: "application/xml",
  svg: "image/svg+xml",
  js: "text/javascript",
  ts: "text/typescript",
  css: "text/css",
  yaml: "text/yaml",
  yml: "text/yaml",
};

/** Deduce un mime desde un hint (tipo dado o extensión del nombre). */
function resolveMime(tipo: string, nombre: string): string {
  const t = (tipo || "").trim().toLowerCase();
  if (t.includes("/")) return t; // ya es un mime completo
  if (t && MIME_BY_HINT[t]) return MIME_BY_HINT[t];
  const ext = (nombre.split(".").pop() || "").trim().toLowerCase();
  if (ext && MIME_BY_HINT[ext]) return MIME_BY_HINT[ext];
  return "text/plain";
}

/** Normaliza una URL: si no trae esquema y no es ruta interna, asume https. */
function normalizeUrl(raw: string): string {
  const url = (raw || "").trim();
  if (!url) return "";
  if (url.startsWith("/")) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return url; // otros esquemas (mailto: no encaja pero se respeta abajo)
  if (/^mailto:|^tel:/i.test(url)) return url;
  return "https://" + url;
}

// ════════════════════════════════════════════════════════════════════════════
// GENERAR: notas, documentos y archivos → Biblioteca (persistencia soberana)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Guarda un recurso en la Biblioteca a partir de contenido (data URL) y avisa a
 * la UI (saveResource ya emite `starseed:library`). Devuelve el id nuevo.
 */
function saveToLibrary(args: {
  kind: string;
  title: string;
  url: string;
  origin?: string;
}): { ok: boolean; id: string } {
  if (!hasLocalStorage()) return { ok: false, id: "" };
  const id = makeId("aurora");
  try {
    saveResource({
      id,
      kind: args.kind,
      title: args.title,
      url: args.url,
      origin: args.origin ?? "Aurora",
    });
    return { ok: true, id };
  } catch {
    return { ok: false, id: "" };
  }
}

/**
 * crear_nota — genera una NOTA breve en markdown y la guarda en la Biblioteca.
 * Entrada: { titulo, texto }. Ofrece abrir la Biblioteca para verla.
 */
export function crearNota(titulo: unknown, texto: unknown): ContentOutcome {
  if (!isClient()) {
    return { ok: false, message: "Las notas se crean desde el navegador." };
  }
  const cuerpo = toText(texto).trim();
  const nombre = toText(titulo).trim() || (cuerpo ? cuerpo.slice(0, 48) : "Nota de Aurora");
  if (!cuerpo && !toText(titulo).trim()) {
    return { ok: false, message: "¿Qué quieres que anote en la nota?" };
  }
  const md = `# ${nombre}\n\n${cuerpo}\n`;
  const url = toDataUrl(md, "text/markdown");
  const saved = saveToLibrary({ kind: "nota", title: nombre, url, origin: "Aurora" });
  if (!saved.ok) {
    return { ok: false, message: "No pude guardar la nota en tu Biblioteca en este equipo." };
  }
  return {
    ok: true,
    message: `Creé la nota «${nombre}» y la guardé en tu Biblioteca. Dime «abre la biblioteca» para verla.`,
    data: { id: saved.id, titulo: nombre, kind: "nota", url },
  };
}

/**
 * crear_documento — genera un DOCUMENTO markdown (más largo que una nota) y lo
 * guarda en la Biblioteca. Entrada: { titulo, texto }.
 */
export function crearDocumento(titulo: unknown, texto: unknown): ContentOutcome {
  if (!isClient()) {
    return { ok: false, message: "Los documentos se crean desde el navegador." };
  }
  const cuerpo = toText(texto).trim();
  const nombre = toText(titulo).trim() || "Documento de Aurora";
  if (!cuerpo) {
    return { ok: false, message: "¿Qué contenido pongo en el documento?" };
  }
  // Si el cuerpo no empieza por un encabezado, anteponemos el título como H1.
  const md = /^\s*#/.test(cuerpo) ? `${cuerpo}\n` : `# ${nombre}\n\n${cuerpo}\n`;
  const url = toDataUrl(md, "text/markdown");
  const saved = saveToLibrary({ kind: "documento", title: nombre, url, origin: "Aurora" });
  if (!saved.ok) {
    return { ok: false, message: "No pude guardar el documento en tu Biblioteca en este equipo." };
  }
  return {
    ok: true,
    message: `Redacté el documento «${nombre}» y lo guardé en tu Biblioteca. Dime «abre la biblioteca» para abrirlo.`,
    data: { id: saved.id, titulo: nombre, kind: "documento", url },
  };
}

/**
 * crear_archivo — genera un ARCHIVO de cualquier formato (por su contenido de
 * texto o una data URL ya formada) y lo guarda en la Biblioteca.
 * Entrada: { nombre, contenido, tipo? }. `tipo` puede ser un mime
 * (application/json) o una extensión (json, csv, svg, html…).
 */
export function crearArchivo(nombre: unknown, contenido: unknown, tipo?: unknown): ContentOutcome {
  if (!isClient()) {
    return { ok: false, message: "Los archivos se crean desde el navegador." };
  }
  const contenidoStr = toText(contenido);
  const nombreStr = toText(nombre).trim() || "archivo-de-aurora.txt";
  if (!contenidoStr.trim()) {
    return { ok: false, message: "¿Qué contenido tiene el archivo?" };
  }
  // Si ya es una data URL o una URL http(s), la respetamos tal cual.
  let url: string;
  if (/^data:/i.test(contenidoStr.trim()) || /^https?:\/\//i.test(contenidoStr.trim())) {
    url = contenidoStr.trim();
  } else {
    const mime = resolveMime(toText(tipo), nombreStr);
    url = toDataUrl(contenidoStr, mime);
  }
  const saved = saveToLibrary({ kind: "archivo", title: nombreStr, url, origin: "Aurora" });
  if (!saved.ok) {
    return { ok: false, message: "No pude guardar el archivo en tu Biblioteca en este equipo." };
  }
  return {
    ok: true,
    message: `Generé el archivo «${nombreStr}» y lo guardé en tu Biblioteca.`,
    data: { id: saved.id, nombre: nombreStr, kind: "archivo", url },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// USAR: publicar, pizarras, widgets, navegador y búsqueda en la Biblioteca
// ════════════════════════════════════════════════════════════════════════════

const AREA_IDS = ["politica", "educacion", "cultura", "general"] as const;

/**
 * crear_publicacion — abre el Composer de Publicar con el texto prellenado.
 * El Composer lee `?intent=` como título inicial (y `?area=` / `?tipo=`).
 * Además emite `starseed:publicar-draft` con el texto completo, por si un
 * listener futuro quiere prellenar el cuerpo (degrada si nadie escucha).
 * Entrada: { texto, area?, tipo? }.
 */
export function crearPublicacion(texto: unknown, area?: unknown, tipo?: unknown): ContentOutcome {
  if (!isClient()) {
    return { ok: false, message: "Publicar se hace desde el navegador." };
  }
  const cuerpo = toText(texto).trim();
  if (!cuerpo) {
    // Sin texto: abrimos igualmente el Composer para que el usuario redacte.
    navigateTo("/publicar");
    return { ok: true, message: "Abrí el Composer de Publicar. ¿Qué quieres publicar?" };
  }
  // El intent (título) admite ~120 chars cómodos; el cuerpo va por evento.
  const intent = cuerpo.slice(0, 200);
  const params = new URLSearchParams();
  params.set("intent", intent);
  const areaStr = toText(area).trim().toLowerCase();
  if (areaStr && (AREA_IDS as readonly string[]).includes(areaStr)) params.set("area", areaStr);
  const tipoStr = toText(tipo).trim().toLowerCase();
  if (tipoStr) params.set("tipo", tipoStr);
  // Evento aditivo (futuro): cuerpo completo para prellenar el composer.
  emit("starseed:publicar-draft", { texto: cuerpo, area: areaStr, tipo: tipoStr });
  navigateTo(`/publicar?${params.toString()}`);
  return {
    ok: true,
    message: "Abrí el Composer de Publicar con tu texto listo. Confírmame el área y publicamos.",
    data: { intent, area: areaStr, tipo: tipoStr },
  };
}

/**
 * abrir_pizarra — abre las Pizarras (lienzos). Sin datos abre el hub /pizarras;
 * con { id } abre ese lienzo (/pizarra?canvas=id); con { titulo } pide crear uno
 * (emite `starseed:crear-pizarra` para un futuro creador y abre el lienzo).
 * Entrada: { id?, titulo? }.
 */
export function abrirPizarra(id?: unknown, titulo?: unknown): ContentOutcome {
  if (!isClient()) {
    return { ok: false, message: "Las pizarras se abren desde el navegador." };
  }
  const idStr = toText(id).trim();
  if (idStr) {
    navigateTo(`/pizarra?canvas=${encodeURIComponent(idStr)}`);
    return { ok: true, message: "Abriendo la pizarra.", data: { canvas: idStr } };
  }
  const tituloStr = toText(titulo).trim();
  if (tituloStr) {
    // No creamos en Supabase desde aquí (fuera de scope): avisamos y abrimos el
    // lienzo. Si hay un creador escuchando, tomará el relevo.
    emit("starseed:crear-pizarra", { titulo: tituloStr });
    navigateTo("/pizarra");
    return {
      ok: true,
      message: `Abrí el lienzo para tu pizarra «${tituloStr}».`,
      data: { titulo: tituloStr },
    };
  }
  navigateTo("/pizarras");
  return { ok: true, message: "Abriendo tus pizarras." };
}

/**
 * crear_en_pizarra — coloca un bloque de contenido en una pizarra/lienzo.
 * Emite `starseed:pizarra-add-block` con un bloque de texto (que un listener del
 * lienzo puede insertar) y abre la pizarra. Entrada: { texto, titulo? }.
 */
export function crearEnPizarra(texto: unknown, titulo?: unknown): ContentOutcome {
  if (!isClient()) {
    return { ok: false, message: "Las pizarras se editan desde el navegador." };
  }
  const cuerpo = toText(texto).trim();
  if (!cuerpo) {
    navigateTo("/pizarra");
    return { ok: true, message: "Abrí el lienzo. ¿Qué quieres poner en la pizarra?" };
  }
  const tituloStr = toText(titulo).trim();
  // Bloque de texto compatible con la forma de CanvasBlock (kind:"text").
  emit("starseed:pizarra-add-block", {
    block: { kind: "text", title: tituloStr || undefined, data: { text: cuerpo } },
  });
  navigateTo("/pizarra");
  return {
    ok: true,
    message: tituloStr
      ? `Puse «${tituloStr}» en tu pizarra.`
      : "Añadí tu texto a la pizarra.",
    data: { titulo: tituloStr, texto: cuerpo },
  };
}

// ── Widgets del tablero (misma persistencia que el dashboard real) ───────────
// Replica el mecanismo de src/lib/aurora/actions.ts (localStorage
// starseed_dashboards/starseed_widgets + BroadcastChannel) para NO acoplar ni
// importar de allí. Si no hay tablero, degradamos abriendo /dashboard.

const LS_DASHBOARDS = "starseed_dashboards";
const LS_WIDGETS = "starseed_widgets";
const DASH_CHANNEL = "starseed-dashboard";

type StoredWidgetLite = {
  id: string;
  dashboard_id: string;
  widget_type: string;
  layout: { x: number; y: number; w: number; h: number; i: string };
  settings: Record<string, unknown>;
  created_at: string;
};

function lsRead<T>(key: string, dflt: T): T {
  if (!hasLocalStorage()) return dflt;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : dflt;
  } catch {
    return dflt;
  }
}

function broadcastDashboard(): void {
  if (!isClient() || typeof BroadcastChannel === "undefined") return;
  try {
    const ch = new BroadcastChannel(DASH_CHANNEL);
    ch.postMessage({ type: "data:changed", scope: "widgets", at: Date.now() });
    ch.close();
  } catch {
    /* noop */
  }
}

/** Alias de voz → TIPO de widget del registro (subconjunto seguro y estable). */
const WIDGET_ALIASES: Record<string, string> = {
  reloj: "CALCULATOR",
  calculadora: "CALCULATOR",
  clima: "WEATHER_HOLISTIC",
  tiempo: "WEATHER_HOLISTIC",
  memorias: "MEMORIES",
  memoria: "MEMORIES",
  baules: "VAULTS",
  baul: "VAULTS",
  cerebros: "BRAINS",
  cerebro: "BRAINS",
  musica: "MUSIC_PLAYER",
  reproductor: "MUSIC_PLAYER",
  radio: "RADIO_LIVE",
  frecuencias: "OMNIFRECUENCIAS",
  omnifrecuencias: "OMNIFRECUENCIAS",
  mensajes: "MESSAGES",
  notificaciones: "NOTIFICATIONS",
  eventos: "MY_EVENTS",
  grupos: "MY_GROUPS",
  comunidades: "COMMUNITIES",
  documentos: "DOCUMENTS",
  economia: "ECONOMIC_OVERVIEW",
  cartera: "CARTERA_STARSEED",
  actividad: "RECENT_ACTIVITY",
  aprendizaje: "LEARNING_PATH",
  cultura: "CULTURAL_FEED",
  politica: "POLITICAL_SUMMARY",
  red: "EXPLORE_NETWORK",
  explorar: "EXPLORE_NETWORK",
  sistema: "SYSTEM_STATUS",
  estado: "SYSTEM_STATUS",
  tema: "THEME_SELECTOR",
  temas: "THEME_SELECTOR",
  apps: "APP_LAUNCHER",
  aplicaciones: "APP_LAUNCHER",
  mapa: "MAP_LOCATION",
  ubicacion: "MAP_LOCATION",
  astraura: "ASTRAURA_CORTEX",
};

function normLoose(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function resolveWidgetType(tipoRaw: string): string | null {
  const raw = (tipoRaw || "").trim();
  if (!raw) return null;
  if (/^[A-Z][A-Z0-9_]+$/.test(raw)) return raw; // ya es un TIPO válido
  const n = normLoose(raw);
  if (WIDGET_ALIASES[n]) return WIDGET_ALIASES[n];
  for (const [k, v] of Object.entries(WIDGET_ALIASES)) {
    if (n.includes(k) || k.includes(n)) return v;
  }
  return null;
}

/**
 * crear_widget — añade un widget al tablero activo (y avisa al escritorio por
 * evento, por si está montado). Entrada: { tipo? }. Sin tipo reconocido, abre
 * /dashboard para que el usuario lo añada a mano (degradación honesta).
 */
export function crearWidget(tipo?: unknown): ContentOutcome {
  if (!isClient()) {
    return { ok: false, message: "Los widgets se añaden desde el navegador." };
  }
  const tipoStr = toText(tipo).trim();
  const wt = resolveWidgetType(tipoStr);
  if (!wt) {
    navigateTo("/dashboard");
    return {
      ok: false,
      message: tipoStr
        ? `No reconozco el widget «${tipoStr}». Te abrí el tablero para añadirlo a mano.`
        : "Te abrí el tablero. ¿Qué widget quieres añadir? (clima, memorias, música, calculadora…)",
    };
  }
  // Aviso al escritorio (aditivo; si nadie escucha, no pasa nada).
  emit("starseed:desktop-add-widget", { widgetType: wt });
  // Persistencia en el tablero activo (mismo mecanismo que el dashboard real).
  try {
    const dashboards = lsRead<Array<{ id: string; name?: string; is_default?: boolean }>>(LS_DASHBOARDS, []);
    if (Array.isArray(dashboards) && dashboards.length > 0) {
      const active = dashboards.find((d) => d.is_default) || dashboards[0];
      const all = lsRead<Record<string, StoredWidgetLite[]>>(LS_WIDGETS, {});
      const list = Array.isArray(all[active.id]) ? all[active.id] : [];
      const y = list.length > 0 ? Math.max(...list.map((w) => (w.layout?.y ?? 0) + (w.layout?.h ?? 0))) : 0;
      const widget: StoredWidgetLite = {
        id: makeId("w"),
        dashboard_id: active.id,
        widget_type: wt,
        layout: { x: 0, y, w: 4, h: 4, i: makeId("i") },
        settings: {},
        created_at: new Date().toISOString(),
      };
      all[active.id] = [...list, widget];
      if (hasLocalStorage()) {
        localStorage.setItem(LS_WIDGETS, JSON.stringify(all));
      }
      broadcastDashboard();
      navigateTo("/dashboard");
      return {
        ok: true,
        message: `Añadí el widget ${tipoStr || wt} a tu tablero${active.name ? ` «${active.name}»` : ""}.`,
        data: { widgetType: wt, dashboard: active.id },
      };
    }
  } catch {
    /* cae a la degradación de abajo */
  }
  // No hay tablero persistido: abrimos /dashboard (el evento ya se emitió).
  navigateTo("/dashboard");
  return {
    ok: true,
    message: `Pedí añadir el widget ${tipoStr || wt} y te abrí el tablero.`,
    data: { widgetType: wt },
  };
}

// ── Navegador interno / web ──────────────────────────────────────────────────

/**
 * buscar_web — abre el Navegador interno con una búsqueda (DuckDuckGo). Mantiene
 * la web DENTRO del OS. Entrada: { consulta }.
 */
export function buscarWeb(consulta: unknown): ContentOutcome {
  if (!isClient()) {
    return { ok: false, message: "La búsqueda web se hace desde el navegador." };
  }
  const q = toText(consulta).trim();
  if (!q) {
    navigateTo("/navegador");
    return { ok: true, message: "Abrí el navegador. ¿Qué quieres que busque?" };
  }
  const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;
  navigateTo(`/navegador?url=${encodeURIComponent(searchUrl)}`);
  return {
    ok: true,
    message: `Busqué «${q}» en la web dentro de tu navegador.`,
    data: { consulta: q, url: searchUrl },
  };
}

/**
 * abrir_enlace — abre una URL en el Navegador interno del OS (sin abandonar
 * Aurora). Normaliza el esquema. Entrada: { url }.
 */
export function abrirEnlace(url: unknown): ContentOutcome {
  if (!isClient()) {
    return { ok: false, message: "Los enlaces se abren desde el navegador." };
  }
  const raw = toText(url).trim();
  if (!raw) {
    return { ok: false, message: "¿Qué enlace quieres que abra?" };
  }
  const finalUrl = normalizeUrl(raw);
  // Enlace interno del OS → navegación directa; externo → navegador interno.
  if (finalUrl.startsWith("/")) {
    navigateTo(finalUrl);
    return { ok: true, message: `Abriendo ${finalUrl}.`, data: { url: finalUrl } };
  }
  navigateTo(`/navegador?url=${encodeURIComponent(finalUrl)}`);
  return {
    ok: true,
    message: `Abrí ${finalUrl} en tu navegador.`,
    data: { url: finalUrl },
  };
}

// ── Búsqueda en la Biblioteca ────────────────────────────────────────────────

/**
 * buscar_en_libreria / buscar_en_biblioteca — lleva a la Biblioteca con la
 * consulta. La página no lee un `?q=` hoy, así que navegamos a /library y
 * emitimos `starseed:library-search` (futuro filtro) + decimos la consulta.
 * Entrada: { consulta }.
 */
export function buscarEnBiblioteca(consulta: unknown): ContentOutcome {
  if (!isClient()) {
    return { ok: false, message: "La Biblioteca se consulta desde el navegador." };
  }
  const q = toText(consulta).trim();
  // Emitimos el término (aditivo, para un futuro buscador) y abrimos la pestaña
  // personal de la Biblioteca.
  if (q) emit("starseed:library-search", { consulta: q });
  navigateTo(q ? `/library?tab=personal` : "/library");
  return {
    ok: true,
    message: q
      ? `Abrí tu Biblioteca buscando «${q}».`
      : "Abrí tu Biblioteca.",
    data: { consulta: q },
  };
}
