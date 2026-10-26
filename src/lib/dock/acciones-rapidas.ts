// src/lib/dock/acciones-rapidas.ts
/**
 * ACCIONES RÁPIDAS DEL DOCK — qué ofrece cada icono al mantenerlo presionado (Ola 1025U · V1a).
 * ════════════════════════════════════════════════════════════════════════════
 * QUÉ: el catálogo (puro, sin React) de 2–5 acciones útiles por cada app, sección o
 * página del dock, más unas genéricas para las que no tienen catálogo propio.
 * POR QUÉ: Alex pidió que el menú de un icono enseñe «sus funciones básicas nativas».
 * Una acción que no hace nada es peor que no tenerla (regla de la ola: nada promete
 * lo que no hace), así que CADA acción tiene un destino que existe de verdad:
 *   · `ruta`    → una página de `src/app/**` (y, si lleva query, la página la lee: el
 *                 campo `lee` nombra el archivo y el parámetro que lo demuestra);
 *   · `evento`  → un `CustomEvent` de `window` que alguien escucha;
 *   · `funcion` → una función real del OS, resuelta en `components/layout/dock/acciones-internas.ts`.
 * La prueba `__tests__/acciones-rapidas.test.ts` lo comprueba contra el árbol real.
 *
 * Para añadir una app: una entrada en `CATALOGO` con su `id` del dock. Para una acción
 * nueva con query, añade `lee` y la prueba te dirá si la página de verdad la entiende.
 */

/** Iconos de Lucide que usan las acciones (el menú los traduce a componentes). */
export type IconoAccion =
  | "Plus" | "Search" | "Upload" | "Library" | "RefreshCw" | "Download" | "Palette" | "ShieldCheck"
  | "Bell" | "CheckCheck" | "Calendar" | "Users" | "Map" | "MessageSquarePlus" | "Settings" | "Mail"
  | "Radio" | "Antenna" | "Camera" | "Images" | "Brain" | "Network" | "PenLine" | "Sparkles" | "Cast"
  | "LayoutGrid" | "Wrench" | "Mic" | "FlaskConical" | "Gauge" | "Smile" | "Bot" | "Replace" | "BookOpen"
  | "BookUser" | "User" | "Award" | "Activity" | "Lightbulb" | "Compass" | "Boxes" | "Rss" | "Pencil"
  | "Atom" | "Eye" | "RotateCw";

/** Funciones reales del OS que el dock puede ejecutar (ver `acciones-internas.ts`). */
export type FuncionDock = "escritorio-nuevo" | "notificaciones-marcar-leidas";

export type DestinoAccion =
  | {
      tipo: "ruta";
      ruta: string;
      /** Prueba de que la página entiende el parámetro de la query (archivo + parámetro [+ valor]). */
      lee?: { archivo: string; param: string; valor?: string };
    }
  | { tipo: "evento"; evento: string; detalle?: Record<string, unknown> }
  | { tipo: "funcion"; funcion: FuncionDock };

export interface AccionRapida {
  /** Único en todo el catálogo: «<app>.<accion>». */
  id: string;
  etiqueta: string;
  icono: IconoAccion;
  destino: DestinoAccion;
  /** Solo se ofrece estando en una ruta que empiece por alguno de estos prefijos
   *  (para eventos cuyo oyente solo existe en esa página). */
  soloEnRutas?: string[];
}

// ── Eventos globales reales (cada uno tiene su oyente; la prueba lo comprueba) ──
export const EVENTO_FRAGUA = "starseed:open-forge";
export const EVENTO_EDITOR = "starseed:open-editor";
export const EVENTO_GUIA = "starseed:open-onboarding";
export const EVENTO_AURORA = "starseed:open-aurora-exocortex";
export const EVENTO_EDITAR_TABLERO = "starseed:dashboard:editar";

// ── Archivos que demuestran que una página lee su parámetro ──
const CUENTA = "src/app/(app)/cuenta/page.tsx";
const MENSAJES = "src/app/(main)/messages/page.tsx";
const HUB = "src/app/(app)/hub/page.tsx";
const BIBLIOTECA = "src/app/(app)/library/page.tsx";
const AGENTE = "src/app/(app)/agent/page.tsx";
const PIZARRA = "src/app/(app)/pizarra/page.tsx";
const ESTACIONES = "src/app/(app)/estaciones/page.tsx";
const NIVEL_GENESIS = "src/components/genesis/selector-nivel.tsx";
const PESTANA_GENESIS = "src/components/mando/centro-mando.tsx";

function ruta(id: string, etiqueta: string, icono: IconoAccion, destino: string, lee?: { archivo: string; param: string; valor?: string }): AccionRapida {
  return { id, etiqueta, icono, destino: { tipo: "ruta", ruta: destino, ...(lee ? { lee } : {}) } };
}
function evento(id: string, etiqueta: string, icono: IconoAccion, nombre: string, extra: Partial<AccionRapida> = {}): AccionRapida {
  return { id, etiqueta, icono, destino: { tipo: "evento", evento: nombre }, ...extra };
}
function funcion(id: string, etiqueta: string, icono: IconoAccion, f: FuncionDock): AccionRapida {
  return { id, etiqueta, icono, destino: { tipo: "funcion", funcion: f } };
}

const cuenta = (id: string, etiqueta: string, icono: IconoAccion, seccion: string) =>
  ruta(id, etiqueta, icono, `/cuenta?section=${seccion}`, { archivo: CUENTA, param: "section", valor: seccion });
const biblioteca = (id: string, etiqueta: string, icono: IconoAccion, query: string, param: string, valor: string) =>
  ruta(id, etiqueta, icono, `/library?${query}`, { archivo: BIBLIOTECA, param, valor });
const hub = (id: string, etiqueta: string, icono: IconoAccion, pestana: string) =>
  ruta(id, etiqueta, icono, `/hub?tab=${pestana}`, { archivo: HUB, param: "tab", valor: pestana });
const agente = (id: string, etiqueta: string, icono: IconoAccion, pestana: string) =>
  ruta(id, etiqueta, icono, `/agent?tab=${pestana}`, { archivo: AGENTE, param: "tab", valor: pestana });
const estacion = (id: string, etiqueta: string, icono: IconoAccion, modo: string) =>
  ruta(id, etiqueta, icono, `/estaciones?nueva=${modo}`, { archivo: ESTACIONES, param: "nueva", valor: modo });
const nivelGenesis = (id: string, etiqueta: string, icono: IconoAccion, nivel: string) =>
  ruta(id, etiqueta, icono, `/genesis?nivel=${nivel}`, { archivo: NIVEL_GENESIS, param: "nivel", valor: nivel });
const pestanaGenesis = (id: string, etiqueta: string, icono: IconoAccion, pestana: string) =>
  ruta(id, etiqueta, icono, `/genesis?pestana=${pestana}`, { archivo: PESTANA_GENESIS, param: "pestana", valor: pestana });
const mensajes = (id: string, etiqueta: string, icono: IconoAccion, query: string, param: string, valor?: string) =>
  ruta(id, etiqueta, icono, `/messages?${query}`, { archivo: MENSAJES, param, ...(valor ? { valor } : {}) });

/** Acciones propias, por el `id` del botón del dock (`DOCK_PRESETS`). */
export const CATALOGO: Record<string, AccionRapida[]> = {
  escritorios: [
    funcion("escritorios.nuevo", "Nuevo escritorio", "Plus", "escritorio-nuevo"),
    evento("escritorios.fragua", "Fragua de widgets", "Wrench", EVENTO_FRAGUA),
    evento("escritorios.editor", "Editor universal", "Pencil", EVENTO_EDITOR),
    ruta("escritorios.crear", "Centro de creación", "Sparkles", "/crear"),
  ],
  dashboard: [
    evento("dashboard.editar", "Editar el tablero", "Pencil", EVENTO_EDITAR_TABLERO, { soloEnRutas: ["/dashboard"] }),
    evento("dashboard.fragua", "Fragua de widgets", "Wrench", EVENTO_FRAGUA),
    ruta("dashboard.compartidos", "Paneles compartidos", "LayoutGrid", "/dashboard-compartido"),
  ],
  profile: [
    cuenta("profile.editar", "Editar mi perfil", "User", "info-personal"),
    ruta("profile.actividad", "Mi actividad", "Activity", "/mi-actividad"),
    ruta("profile.insignias", "Insignias", "Award", "/insignias"),
    cuenta("profile.privacidad", "Privacidad y datos", "ShieldCheck", "datos-privacidad"),
  ],
  messages: [
    mensajes("messages.nuevo", "Nuevo mensaje", "MessageSquarePlus", "nuevo=1", "nuevo"),
    ruta("messages.contactos", "Contactos", "BookUser", "/contactos"),
    mensajes("messages.ajustes", "Ajustes de mensajería", "Settings", "ajustes=chats", "ajustes", "chats"),
    mensajes("messages.privacidad", "Privacidad de los mensajes", "ShieldCheck", "ajustes=privacidad", "ajustes", "privacidad"),
    ruta("messages.correos", "Correos", "Mail", "/correos"),
  ],
  contactos: [
    mensajes("contactos.escribir", "Escribir un mensaje", "MessageSquarePlus", "nuevo=1", "nuevo"),
    ruta("contactos.correos", "Correos", "Mail", "/correos"),
  ],
  notifications: [
    funcion("notifications.leidas", "Marcar todas como leídas", "CheckCheck", "notificaciones-marcar-leidas"),
    cuenta("notifications.ajustes", "Ajustes de notificaciones", "Bell", "notificaciones"),
  ],
  hub: [
    hub("hub.buscar", "Buscar en la red", "Search", "buscador"),
    hub("hub.grupos", "Mis grupos", "Users", "groups"),
    hub("hub.calendario", "Calendario", "Calendar", "calendar"),
    ruta("hub.mapa", "Mapa de la red", "Map", "/hub/mapa"),
    hub("hub.paginas", "Mis páginas", "BookOpen", "my-pages"),
  ],
  mylib: [
    biblioteca("mylib.explorar", "Explorar la Biblioteca", "Search", "tab=explorar", "tab", "explorar"),
    biblioteca("mylib.subir", "Subir archivos", "Upload", "area=biblioteca", "area", "biblioteca"),
    biblioteca("mylib.coleccion", "Mi colección", "Library", "tab=personal", "tab", "personal"),
    biblioteca("mylib.actualizaciones", "Actualizaciones", "RefreshCw", "tab=updates", "tab", "updates"),
    biblioteca("mylib.instalar", "Instalar StarSeed", "Download", "tab=instalar", "tab", "instalar"),
  ],
  "ai-studio": [
    agente("ai-studio.chat", "Chat con Astraura", "MessageSquarePlus", "chat"),
    agente("ai-studio.multiagente", "Chat multiagente", "Users", "chat-158"),
    agente("ai-studio.skills", "Skills", "Wrench", "skills"),
    agente("ai-studio.memorias", "Memorias", "Brain", "memorias"),
    agente("ai-studio.voz", "Estudio de voz", "Mic", "aurora"),
  ],
  imaginacion: [
    ruta("imaginacion.laboratorio", "Laboratorio de Astraura", "FlaskConical", "/laboratorio"),
    ruta("imaginacion.cerebros", "Cerebros", "Brain", "/cerebro"),
    ruta("imaginacion.memorias", "Memorias", "BookOpen", "/memorias"),
  ],
  settings: [
    cuenta("settings.apariencia", "Apariencia", "Palette", "personalizacion"),
    cuenta("settings.seguridad", "Seguridad", "ShieldCheck", "seguridad"),
    cuenta("settings.notificaciones", "Notificaciones", "Bell", "notificaciones"),
    cuenta("settings.sincronizacion", "Sincronización", "RefreshCw", "sincronizacion"),
    cuenta("settings.privacidad", "Privacidad y datos", "Eye", "datos-privacidad"),
  ],
  pizarra: [
    ruta("pizarra.starseed", "Pizarra StarSeed", "PenLine", "/pizarra?engine=starseed", { archivo: PIZARRA, param: "engine", valor: "starseed" }),
    ruta("pizarra.tldraw", "Pizarra de dibujo (tldraw)", "Pencil", "/pizarra?engine=tldraw", { archivo: PIZARRA, param: "engine", valor: "tldraw" }),
    ruta("pizarra.todas", "Mis pizarras", "LayoutGrid", "/pizarras"),
  ],
  funciones: [
    ruta("funciones.crear", "Centro de creación", "Sparkles", "/crear"),
    ruta("funciones.biblioteca", "Biblioteca", "Library", "/library"),
    evento("funciones.guia", "Guía de StarSeed", "Lightbulb", EVENTO_GUIA),
  ],
  recordatorios: [
    ruta("recordatorios.lista", "Recordatorios", "Calendar", "/recordatorios"),
    ruta("recordatorios.clima", "Clima", "Compass", "/clima"),
    cuenta("recordatorios.avisos", "Ajustes de avisos", "Bell", "notificaciones"),
  ],
  cerebro: [
    ruta("cerebro.cerebros", "Todos los cerebros", "Brain", "/cerebros"),
    ruta("cerebro.mapa", "Mapa de la memoria", "Network", "/cerebro/mapa"),
    ruta("cerebro.memorias", "Memorias", "BookOpen", "/memorias"),
    ruta("cerebro.conocimiento", "Conocimiento", "Lightbulb", "/conocimiento"),
  ],
  camara: [
    ruta("camara.galeria", "Abrir la Galería", "Images", "/galeria"),
    biblioteca("camara.biblioteca", "Mi biblioteca", "Library", "area=biblioteca", "area", "biblioteca"),
  ],
  galeria: [
    ruta("galeria.camara", "Abrir la Cámara", "Camera", "/camara"),
    biblioteca("galeria.subir", "Subir a la Biblioteca", "Upload", "area=biblioteca", "area", "biblioteca"),
  ],
  senales: [
    ruta("senales.mesh", "Red Mesh", "Antenna", "/red-mesh"),
    ruta("senales.feed", "Feed de red", "Radio", "/red-feed"),
    ruta("senales.sincronizacion", "Sincronización de archivos", "RefreshCw", "/sincronizacion"),
    ruta("senales.red3d", "Red en 3D", "Network", "/red-3d"),
  ],
  "red-feed": [
    ruta("red-feed.senales", "Señales", "Antenna", "/senales"),
    ruta("red-feed.mesh", "Red Mesh", "Network", "/red-mesh"),
    ruta("red-feed.red3d", "Red en 3D", "Eye", "/red-3d"),
  ],
  canales: [
    estacion("canales.publicar", "Publicar una estación", "Cast", "enlace"),
    ruta("canales.estaciones", "Ver las estaciones", "Radio", "/estaciones"),
  ],
  estaciones: [
    estacion("estaciones.enlace", "Publicar un enlace en directo", "Plus", "enlace"),
    estacion("estaciones.omnifrecuencias", "Emitir Omnifrecuencias", "Antenna", "omnifrecuencias"),
    estacion("estaciones.audiomorphic", "Emitir Audiomorphic", "Mic", "audiomorphic"),
    ruta("estaciones.estudio", "Estudio de estaciones", "Cast", "/estaciones/estudio"),
    ruta("estaciones.canales", "Canales", "Rss", "/canales"),
  ],
  protomolecula: [
    nivelGenesis("protomolecula.protogenesis", "ProtoGenesis de mis moléculas", "Atom", "mi"),
    ruta("protomolecula.convertir", "Convertir archivos", "Replace", "/convertir"),
  ],
  voces: [
    pestanaGenesis("voces.genesis", "Abrir en Genesis", "Gauge", "voces"),
    agente("voces.astraura", "Voz de Astraura", "Mic", "aurora"),
  ],
  mando: [
    nivelGenesis("mando.mi", "Mi Genesis", "Gauge", "mi"),
    nivelGenesis("mando.poli", "PoliGenesis (mis grupos)", "Users", "poli"),
    pestanaGenesis("mando.procesos", "MetaGenesis · Procesos (desarrolladores)", "Activity", "procesos"),
  ],
  "mundo-avatares": [
    nivelGenesis("mundo-avatares.bots", "Mis bots", "Bot", "mi"),
    ruta("mundo-avatares.cerebros", "Cerebros", "Brain", "/cerebro"),
    ruta("mundo-avatares.laboratorio", "Laboratorio de Astraura", "FlaskConical", "/laboratorio"),
  ],
  laboratorio: [
    ruta("laboratorio.imaginacion", "Imaginación", "Sparkles", "/imaginacion"),
    ruta("laboratorio.mundo", "Mundo de los avatares", "Smile", "/mundo-avatares"),
    ruta("laboratorio.cerebros", "Cerebros", "Brain", "/cerebro"),
  ],
  seguridad: [
    ruta("seguridad.registro", "Registro de auditoría", "Eye", "/settings-audit"),
    cuenta("seguridad.privacidad", "Privacidad y datos", "ShieldCheck", "datos-privacidad"),
  ],
};

/** Otros botones del dock que comparten las acciones de uno de arriba. */
const COMPARTEN: Record<string, string> = {
  netlib: "mylib",
  nodes: "hub",
  sincrometro: "hub",
  cerebros: "cerebro",
  "paneles-compartidos": "dashboard",
  "hermes-skills": "ai-studio",
  "hermes-tools": "ai-studio",
  "hermes-mcp": "ai-studio",
  "hermes-setup": "ai-studio",
  "hermes-senses": "ai-studio",
};

/** Para las apps sin catálogo propio: tres acciones que valen en cualquier sitio. */
export const ACCIONES_GENERICAS: AccionRapida[] = [
  evento("generica.aurora", "Preguntar a Aurora", "Sparkles", EVENTO_AURORA),
  ruta("generica.crear", "Centro de creación", "Wrench", "/crear"),
  evento("generica.guia", "Guía de StarSeed", "Lightbulb", EVENTO_GUIA),
];

export interface ContextoAcciones {
  /** Ruta actual (para las acciones que solo existen en una página). */
  pathname?: string | null;
}

/** ¿El botón tiene catálogo propio (o comparte el de otro)? */
export function tieneAccionesPropias(itemId: string): boolean {
  return !!CATALOGO[COMPARTEN[itemId] ?? itemId];
}

/** Las acciones que se ofrecen para un botón del dock en este momento (siempre 2–5). */
export function accionesRapidasDe(itemId: string, ctx: ContextoAcciones = {}): AccionRapida[] {
  const propias = CATALOGO[COMPARTEN[itemId] ?? itemId];
  const base = propias ?? ACCIONES_GENERICAS;
  const ruta = ctx.pathname ?? "";
  return base.filter((a) => !a.soloEnRutas || a.soloEnRutas.some((p) => ruta === p || ruta.startsWith(p + "/")));
}

/** Todas las acciones del catálogo (para las pruebas y para quien quiera auditarlas). */
export function todasLasAcciones(): AccionRapida[] {
  return [...Object.values(CATALOGO).flat(), ...ACCIONES_GENERICAS];
}

/** Ruta de una acción de tipo `ruta` sin su query ni su ancla («/library?tab=x» → «/library»). */
export function rutaBase(destino: string): string {
  return destino.split("#")[0].split("?")[0];
}
