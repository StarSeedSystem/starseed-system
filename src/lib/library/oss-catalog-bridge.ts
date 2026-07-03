"use client";

// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — PUENTE Catálogo OSS → Librería (servicios como instalables)
// ----------------------------------------------------------------------------
// Proyecta el REGISTRO UNIFICADO de servicios open-source (`oss-services.ts`)
// hacia el modelo de fichas de la LIBRERÍA (`LibraryDetailItem` de
// `app-file-page.tsx`), para que cada servicio (Ollama, Whisper, n8n, Cal.com,
// Penpot…) aparezca como un ITEM instalable/integrable, con:
//   • categoría "Servicios / Integraciones" + subcategoría por función
//     (IA · Voz · Imagen · Vídeo · Workflows · Calendarios · Documentos ·
//      Diseño · Web),
//   • propósito, enlace al repositorio, tipo de conexión,
//   • "instalar" = registrar/conectar (crea una conexión por defecto en
//     `oss-connections.ts` Y guarda un recurso 'servicio' en `library-store`).
//
// "Instalado" = tiene AL MENOS UNA conexión en oss-connections, O es
// `enabledByDefault` (predeterminado integrado por StarSeed).
//
// Este módulo NO renderiza UI: sólo transforma datos y ofrece helpers puros +
// acciones. Todo SSR-safe (las acciones tocan localStorage tras guardas del
// propio store) y defensivo (nunca lanza; degrada en silencio).
// ════════════════════════════════════════════════════════════════════════════

import {
  OSS_SERVICES,
  OSS_SERVICE_CATEGORY_META,
  OSS_SERVICE_CATEGORY_ORDER,
  findOssService,
  type OssService,
  type OssServiceCategory,
  type OssConnectionKind,
} from "@/lib/services/oss-services";
import {
  addConnection,
  readConnections,
  setDefaultFor,
  connectionsForService,
  type OssConnection,
} from "@/lib/services/oss-connections";
import { saveResource } from "@/lib/library-store";
import type { LibraryDetailItem, ListingLink } from "@/components/library/app-file-page";

// ── Constantes de presentación (categoría de librería) ───────────────────────

/** Etiqueta de la categoría "familia" con la que estos items entran a la Librería. */
export const OSS_LIBRARY_CATEGORY = "servicios";
/** Etiqueta legible de la familia (chip de la Librería). */
export const OSS_LIBRARY_CATEGORY_LABEL = "Servicios / Integraciones";
/** `kind` con el que se guardan en `library-store` (Mi Biblioteca). */
export const OSS_SAVED_KIND = "servicio";

/**
 * Nombre corto y humano de cada función (subcategoría) para agrupar en la
 * Librería. Deriva de `OSS_SERVICE_CATEGORY_META` pero con etiquetas
 * orientadas al usuario (IA, Voz, Imagen…), como pidió la misión.
 */
export const OSS_FUNCTION_LABEL: Record<OssServiceCategory, string> = {
  llm: "IA",
  stt: "Voz",
  tts: "Voz",
  image: "Imagen",
  video: "Vídeo",
  workflow: "Workflows",
  calendar: "Calendarios",
  docs: "Documentos",
  design: "Diseño",
  website: "Web",
};

/** Frase humana del tipo de conexión (para la ficha). */
export const OSS_CONNECTION_KIND_LABEL: Record<OssConnectionKind, string> = {
  "http-endpoint": "Conexión por endpoint (URL)",
  "api-key": "Conexión por endpoint + clave de API",
  webhook: "Conexión por webhook",
  "app-embed": "Integración embebida (instancia)",
  "browser-local": "Corre en el navegador (sin servidor)",
};

// ── Tipo de item de servicio de la Librería (extiende la ficha) ──────────────

/** Estado de instalación de un servicio en la Librería/Biblioteca. */
export type OssInstallStatus =
  | "connected" // el usuario tiene al menos una conexión
  | "default" // predeterminado integrado (enabledByDefault) sin conexión propia
  | "available"; // ni conexión ni predeterminado (disponible para conectar)

/**
 * Item de librería de un servicio OSS: es un `LibraryDetailItem` (compatible con
 * las fichas de la librería) enriquecido con metadatos del servicio para las
 * tarjetas instalables (función, tipo de conexión, estado, id del servicio).
 */
export interface OssLibraryItem extends LibraryDetailItem {
  /** Id del servicio del catálogo (`OssService.id`). */
  serviceId: string;
  /** Función que cubre (category del catálogo OSS). */
  serviceCategory: OssServiceCategory;
  /** Etiqueta humana de la función (IA · Voz · …). */
  functionLabel: string;
  /** Cómo se conecta. */
  connectionKind: OssConnectionKind;
  /** ¿Preintegrado por defecto por StarSeed? */
  enabledByDefault: boolean;
  /** ¿Corre en el navegador (no requiere endpoint)? */
  runsInBrowser: boolean;
  /** Estado de instalación resuelto (según conexiones + predeterminados). */
  installStatus: OssInstallStatus;
  /** Nº de conexiones del usuario para este servicio. */
  connectionCount: number;
}

// ── Helpers puros de estado (aceptan las conexiones como argumento) ──────────

/**
 * ¿Está "instalado" un servicio? Instalado = tiene al menos una conexión del
 * usuario O es `enabledByDefault` (predeterminado integrado).
 *
 * `connections` es opcional: si no se pasa, se leen del store (SSR-safe: en el
 * servidor `readConnections()` devuelve []).
 */
export function isServiceInstalled(
  serviceId: string,
  connections?: OssConnection[],
): boolean {
  const svc = findOssService(serviceId);
  if (!svc) return false;
  const list = connections ?? readConnections();
  const hasConnection = list.some((c) => c.serviceId === serviceId);
  return hasConnection || svc.enabledByDefault;
}

/** Nº de conexiones del usuario para un servicio (defensivo). */
export function connectionCountFor(
  serviceId: string,
  connections?: OssConnection[],
): number {
  const list = connections ?? readConnections();
  return list.filter((c) => c.serviceId === serviceId).length;
}

/**
 * Resuelve el estado de instalación de un servicio:
 *  • "connected" → el usuario tiene ≥1 conexión (prevalece sobre default).
 *  • "default"   → sin conexión propia pero `enabledByDefault`.
 *  • "available" → ni conexión ni predeterminado.
 */
export function serviceInstallStatus(
  service: OssService,
  connections?: OssConnection[],
): OssInstallStatus {
  const list = connections ?? readConnections();
  if (list.some((c) => c.serviceId === service.id)) return "connected";
  if (service.enabledByDefault) return "default";
  return "available";
}

// ── Proyección servicio → ficha de Librería ──────────────────────────────────

/** Construye los enlaces de la ficha (repo + docs) de forma defensiva. */
function buildServiceLinks(service: OssService): ListingLink[] {
  const links: ListingLink[] = [];
  if (service.repoUrl) {
    links.push({ label: "Repositorio (código abierto)", url: service.repoUrl });
  }
  if (service.docsUrl && service.docsUrl !== service.repoUrl) {
    links.push({ label: "Documentación", url: service.docsUrl });
  }
  return links;
}

/**
 * Proyecta UN servicio del catálogo OSS a un `OssLibraryItem` (ficha de
 * librería + metadatos de servicio). `connections` opcional para resolver el
 * estado sin releer el store en bucle.
 */
export function ossServiceToLibraryItem(
  service: OssService,
  connections?: OssConnection[],
): OssLibraryItem {
  const status = serviceInstallStatus(service, connections);
  const functionLabel = OSS_FUNCTION_LABEL[service.category] ?? OSS_SERVICE_CATEGORY_META[service.category]?.label ?? service.category;
  const count = connectionCountFor(service.id, connections);

  const selfHost =
    service.selfHostHint && service.selfHostHint.trim()
      ? `\n\nAuto-hospedaje: ${service.selfHostHint}`
      : "";
  const connHint = `\n\nConexión: ${OSS_CONNECTION_KIND_LABEL[service.connectionKind]}.`;

  return {
    // ── LibraryDetailItem (compatible con las fichas) ──
    id: `oss-svc-${service.id}`,
    title: service.name,
    description: `${service.purpose}${connHint}${selfHost}`,
    category: OSS_LIBRARY_CATEGORY,
    categoryLabel: `${OSS_LIBRARY_CATEGORY_LABEL} · ${functionLabel}`,
    author: "Servicio open-source",
    verified: service.enabledByDefault,
    tags: service.tags ?? [],
    sourceLabel: "Servicios OSS · StarSeed",
    sourceUrl: service.repoUrl || service.docsUrl || undefined,
    fileKind: `servicio · ${functionLabel.toLowerCase()}`,
    license: "Código abierto",
    origin: "oss",
    links: buildServiceLinks(service),
    // ── Extensión de servicio ──
    serviceId: service.id,
    serviceCategory: service.category,
    functionLabel,
    connectionKind: service.connectionKind,
    enabledByDefault: service.enabledByDefault,
    runsInBrowser: !!service.runsInBrowser,
    installStatus: status,
    connectionCount: count,
  };
}

/**
 * Devuelve TODOS los servicios OSS como items de librería (para la categoría
 * "Servicios / Integraciones"). Lee las conexiones una sola vez y resuelve el
 * estado de cada uno. Orden estable por función (`OSS_SERVICE_CATEGORY_ORDER`).
 */
export function listOssLibraryItems(connections?: OssConnection[]): OssLibraryItem[] {
  const list = connections ?? readConnections();
  const orderIndex = new Map<OssServiceCategory, number>();
  OSS_SERVICE_CATEGORY_ORDER.forEach((c, i) => orderIndex.set(c, i));
  return [...OSS_SERVICES]
    .sort(
      (a, b) =>
        (orderIndex.get(a.category) ?? 99) - (orderIndex.get(b.category) ?? 99),
    )
    .map((s) => ossServiceToLibraryItem(s, list));
}

/** Un grupo de servicios de una misma función (para renderizar por secciones). */
export interface OssLibraryGroup {
  category: OssServiceCategory;
  /** Etiqueta humana (IA · Voz · …). */
  label: string;
  /** Descripción breve de la función. */
  blurb: string;
  items: OssLibraryItem[];
}

/**
 * Igual que `listOssLibraryItems`, pero agrupado por función (subcategoría),
 * en el orden estable del catálogo. Grupos vacíos se omiten.
 */
export function listOssLibraryGroups(connections?: OssConnection[]): OssLibraryGroup[] {
  const items = listOssLibraryItems(connections);
  const groups: OssLibraryGroup[] = [];
  for (const category of OSS_SERVICE_CATEGORY_ORDER) {
    const groupItems = items.filter((it) => it.serviceCategory === category);
    if (!groupItems.length) continue;
    groups.push({
      category,
      label: OSS_FUNCTION_LABEL[category] ?? OSS_SERVICE_CATEGORY_META[category]?.label ?? category,
      blurb: OSS_SERVICE_CATEGORY_META[category]?.blurb ?? "",
      items: groupItems,
    });
  }
  return groups;
}

// ── Biblioteca personal: servicios instalados + predeterminados ──────────────

/** Vista de un servicio "instalado" para la Biblioteca personal. */
export interface InstalledServiceView {
  serviceId: string;
  name: string;
  functionLabel: string;
  serviceCategory: OssServiceCategory;
  connectionKind: OssConnectionKind;
  repoUrl: string;
  /** true si viene preintegrado por defecto por StarSeed. */
  enabledByDefault: boolean;
  /** true si el usuario ha creado al menos una conexión propia. */
  userInstalled: boolean;
  /** Estado resuelto (connected/default). Nunca "available" aquí. */
  installStatus: Extract<OssInstallStatus, "connected" | "default">;
  /** Nº de conexiones del usuario. */
  connectionCount: number;
}

/**
 * Lista los servicios que deben verse en "Mi Biblioteca":
 *   • los que el usuario CONECTÓ (tiene ≥1 conexión), y
 *   • los PREDETERMINADOS integrados (`enabledByDefault`),
 * con su estado (conectado por el usuario vs. preintegrado) y datos para
 * configurarlos. Orden: primero los conectados por el usuario, luego los
 * predeterminados; dentro, por orden de función.
 *
 * SSR-safe: si no se pasan `connections`, se leen del store (vacío en SSR).
 */
export function listInstalledServices(connections?: OssConnection[]): InstalledServiceView[] {
  const list = connections ?? readConnections();
  const orderIndex = new Map<OssServiceCategory, number>();
  OSS_SERVICE_CATEGORY_ORDER.forEach((c, i) => orderIndex.set(c, i));

  const views: InstalledServiceView[] = [];
  for (const service of OSS_SERVICES) {
    const count = list.filter((c) => c.serviceId === service.id).length;
    const userInstalled = count > 0;
    // Sólo entran los instalados: conexión propia O predeterminado.
    if (!userInstalled && !service.enabledByDefault) continue;
    views.push({
      serviceId: service.id,
      name: service.name,
      functionLabel:
        OSS_FUNCTION_LABEL[service.category] ??
        OSS_SERVICE_CATEGORY_META[service.category]?.label ??
        service.category,
      serviceCategory: service.category,
      connectionKind: service.connectionKind,
      repoUrl: service.repoUrl,
      enabledByDefault: service.enabledByDefault,
      userInstalled,
      installStatus: userInstalled ? "connected" : "default",
      connectionCount: count,
    });
  }

  return views.sort((a, b) => {
    // Conectados por el usuario primero.
    if (a.userInstalled !== b.userInstalled) return a.userInstalled ? -1 : 1;
    return (
      (orderIndex.get(a.serviceCategory) ?? 99) -
      (orderIndex.get(b.serviceCategory) ?? 99)
    );
  });
}

// ── Acción: "instalar" un servicio (registrar/conectar) ──────────────────────

/** Resultado de instalar/registrar un servicio. */
export interface InstallServiceResult {
  ok: boolean;
  /** La conexión creada (si se creó una). */
  connection: OssConnection | null;
  /** true si además ya se marcó como conexión por defecto para su función. */
  madeDefault: boolean;
  /** Mensaje legible del resultado (para toasts). */
  message: string;
}

/**
 * "Instala" un servicio del catálogo: crea una CONEXIÓN por defecto (registro)
 * usando el `defaultEndpoint` del servicio (o vacío para browser-local) Y guarda
 * un recurso 'servicio' en `library-store` para que aparezca en Mi Biblioteca.
 *
 * Es un ARRANQUE rápido: la conexión creada usa valores por defecto sensatos;
 * el usuario puede editar endpoint/clave luego en /servicios o en la ficha.
 * Si ya existía una conexión para este servicio, NO duplica: sólo asegura el
 * recurso en la Biblioteca (idempotente) y reporta "ya conectado".
 *
 * Nunca lanza: ante fallo devuelve `ok:false` con mensaje. Sólo tiene efecto
 * real en el cliente (los stores son SSR-safe y no escriben en el servidor).
 */
export function installService(
  serviceId: string,
  opts?: {
    /** Etiqueta para la conexión creada (por defecto, el nombre del servicio). */
    label?: string;
    /** Marcar la conexión como la por defecto de su función. Por defecto true. */
    makeDefault?: boolean;
  },
): InstallServiceResult {
  const service = findOssService(serviceId);
  if (!service) {
    return {
      ok: false,
      connection: null,
      madeDefault: false,
      message: "Servicio desconocido en el catálogo.",
    };
  }

  // Siempre asegura el recurso en Mi Biblioteca (idempotente: dedup por url+título).
  const saveToLibrary = () =>
    saveResource({
      id: `oss-svc-${service.id}`,
      kind: OSS_SAVED_KIND,
      title: service.name,
      url: service.repoUrl || service.docsUrl || `starseed://servicio/${service.id}`,
      origin: "Librería · Servicios OSS",
    });

  // Si ya hay conexión, no creamos otra: sólo aseguramos presencia en Biblioteca.
  const existing = connectionsForService(service.id);
  if (existing.length > 0) {
    saveToLibrary();
    return {
      ok: true,
      connection: existing[0],
      madeDefault: false,
      message: `${service.name} ya estaba conectado. Añadido a Mi Biblioteca.`,
    };
  }

  // Endpoint inicial: el por defecto del servicio (vacío si corre en navegador).
  const endpoint = service.runsInBrowser ? "" : service.defaultEndpoint || "";

  const created = addConnection({
    serviceId: service.id,
    label: opts?.label?.trim() || service.name,
    endpoint: endpoint || undefined,
    scope: "user",
    enabled: true,
  });

  if (!created) {
    // Aun sin conexión (caso raro), lo dejamos en la Biblioteca como referencia.
    saveToLibrary();
    return {
      ok: false,
      connection: null,
      madeDefault: false,
      message: `No se pudo crear la conexión para ${service.name}, pero se guardó en Mi Biblioteca.`,
    };
  }

  // Marca por defecto para su función (opt-in, por defecto sí).
  let madeDefault = false;
  if (opts?.makeDefault !== false) {
    try {
      madeDefault = setDefaultFor(service.category, created.id, "user");
    } catch {
      madeDefault = false;
    }
  }

  saveToLibrary();

  return {
    ok: true,
    connection: created,
    madeDefault,
    message: service.runsInBrowser
      ? `${service.name} integrado (corre en el navegador). Listo para usar.`
      : `${service.name} conectado con su endpoint por defecto. Edítalo en Servicios si hace falta.`,
  };
}
