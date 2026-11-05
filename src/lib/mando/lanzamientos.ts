/**
 * Centro de Versiones — tipos y filas de medios (puro) para el panel y la API.
 * Contrato: architecture/centro-versiones-1105.md §1 y §4.
 * Lógica de referencia: scripts/puente/lanzamientos_logica.py (MEDIOS, archivos_esperados, FASES).
 */

export type FaseLanzamiento =
  | "esperando-lista"
  | "esperando-publicacion"
  | "preparando"
  | "etiquetando"
  | "compilando"
  | "verificando-archivos"
  | "publicando"
  | "verificando-medios"
  | "lanzado"
  | "atascado";

export type EstadoMedio =
  | "al-dia"
  | "generando"
  | "verificando"
  | "atascado"
  | "no-disponible";

export type AccionPeticion = "lanzar" | "pausar" | "reanudar" | "reintentar" | "regenerar" | "auto";

export interface MedioPanel {
  id: string;
  titulo: string;
  formatos: { nombre: string; url?: string }[];
}

export interface PasoLanzamiento {
  fase: string;
  t: number;
  detalle: string;
}

export interface JobLanzamiento {
  medio: string | null;
  job: string;
  estado: string;
  id?: number;
  url?: string;
  inicio?: string | null;
  fin?: string | null;
}

export interface EstadoMedioDetalle {
  estado: EstadoMedio;
  faltan: string[];
  pequenos: string[];
  problemas?: string[];
}

export interface EstadoLanzamiento {
  fase: FaseLanzamiento;
  detalle: string;
  version?: string;
  t: number;
  pasos: PasoLanzamiento[];
  jobs: JobLanzamiento[];
  medios: Record<string, EstadoMedioDetalle>;
  run_url?: string;
  release_url?: string;
  historial: { t: number; tipo: string; version: string }[];
  pausado: boolean;
  tono: "normal" | "aviso" | "peligro";
}

export interface FilaMedio {
  id: string;
  titulo: string;
  formatos: { nombre: string; url: string }[];
  version: string;
  estado: EstadoMedio;
  detalle: string;
  accion: string;
}

export interface PeticionLanzamiento {
  accion: AccionPeticion;
  medio?: string;
  activo?: boolean;
}

export type ResultadoValidacion<T> =
  | { ok: true; peticion: T }
  | { ok: false; error: string };

const REPO = "StarSeedSystem/starseed-system";
const BASE_DOWNLOAD = `https://github.com/${REPO}/releases/download/`;
const WEB_URL = "https://starseed-os.vercel.app";

export const MEDIOS_PANEL: MedioPanel[] = [
  {
    id: "web",
    titulo: "Sitio web oficial",
    formatos: [{ nombre: "sitio", url: WEB_URL }],
  },
  {
    id: "pwa",
    titulo: "App web instalable (PWA)",
    formatos: [{ nombre: "manifiesto + SW", url: WEB_URL }],
  },
  {
    id: "macos",
    titulo: "macOS",
    formatos: [
      { nombre: ".dmg universal" },
      { nombre: ".app.tar.gz" },
    ],
  },
  {
    id: "windows",
    titulo: "Windows",
    formatos: [
      { nombre: ".msi" },
      { nombre: "-setup.exe" },
    ],
  },
  {
    id: "linux",
    titulo: "Linux",
    formatos: [
      { nombre: ".AppImage" },
      { nombre: ".deb" },
      { nombre: ".rpm" },
    ],
  },
  {
    id: "android",
    titulo: "Android",
    formatos: [{ nombre: ".apk" }],
  },
  {
    id: "ios",
    titulo: "iOS",
    formatos: [{ nombre: ".ipa" }],
  },
  {
    id: "canales",
    titulo: "Canales del actualizador",
    formatos: [
      { nombre: "latest.json" },
      { nombre: "latest-nexus.json" },
      { nombre: "latest-cafe.json" },
    ],
  },
  {
    id: "libreria",
    titulo: "Librería de StarSeed OS",
    formatos: [{ nombre: "ficha de versión" }],
  },
];

const MEDIOS_IDS = new Set(MEDIOS_PANEL.map((m) => m.id));

function archivoBase(medio: string, version: string): string {
  switch (medio) {
    case "macos":
      return `StarSeed.OS_${version}_universal.dmg`;
    case "windows":
      return `StarSeed.OS_${version}_x64_en-US.msi`;
    case "linux":
      return `StarSeed.OS_${version}_amd64.AppImage`;
    case "android":
      return `StarSeed.OS-${version}.apk`;
    case "ios":
      return `StarSeed-os-${version}-unsigned.ipa`;
    case "canales":
      return "latest.json";
    default:
      return "";
  }
}

function construirUrlDescarga(medio: string, formato: string, version: string): string {
  const base = `v${version}/`;
  switch (medio) {
    case "macos":
      if (formato === ".dmg universal") return `${BASE_DOWNLOAD}${base}StarSeed.OS_${version}_universal.dmg`;
      if (formato === ".app.tar.gz") return `${BASE_DOWNLOAD}${base}StarSeed.OS_universal.app.tar.gz`;
      break;
    case "windows":
      if (formato === ".msi") return `${BASE_DOWNLOAD}${base}StarSeed.OS_${version}_x64_en-US.msi`;
      if (formato === "-setup.exe") return `${BASE_DOWNLOAD}${base}StarSeed.OS_${version}_x64-setup.exe`;
      break;
    case "linux":
      if (formato === ".AppImage") return `${BASE_DOWNLOAD}${base}StarSeed.OS_${version}_amd64.AppImage`;
      if (formato === ".deb") return `${BASE_DOWNLOAD}${base}StarSeed.OS_${version}_amd64.deb`;
      if (formato === ".rpm") return `${BASE_DOWNLOAD}${base}StarSeed-OS-${version}-1.x86_64.rpm`;
      break;
    case "android":
      if (formato === ".apk") return `${BASE_DOWNLOAD}${base}StarSeed.OS-${version}.apk`;
      break;
    case "ios":
      if (formato === ".ipa") return `${BASE_DOWNLOAD}${base}StarSeed-os-${version}-unsigned.ipa`;
      break;
    case "canales":
      if (formato === "latest.json") return `${BASE_DOWNLOAD}${base}latest.json`;
      if (formato === "latest-nexus.json") return `${BASE_DOWNLOAD}${base}latest-nexus.json`;
      if (formato === "latest-cafe.json") return `${BASE_DOWNLOAD}${base}latest-cafe.json`;
      break;
  }
  return "";
}

function obtenerVersionParaMedio(estado: EstadoLanzamiento, medio: MedioPanel, versionPublicada: string): string {
  const detalle = estado.medios[medio.id];
  if (!detalle || detalle.estado === "al-dia") {
    return versionPublicada;
  }
  // Para medios en proceso (generando, verificando, atascado), usar la versión en curso
  return estado.version ?? versionPublicada;
}

function obtenerDetalleYAccion(estado: EstadoLanzamiento, medio: MedioPanel, versionPublicada: string): { estado: EstadoMedio; detalle: string; accion: string } {
  const detalle = estado.medios[medio.id];
  if (!detalle) {
    return { estado: "no-disponible", detalle: "sin información", accion: "" };
  }
  if (medio.id === "ios") {
    return { estado: "no-disponible", detalle: "sin cuenta de Apple Developer; se usa la PWA", accion: "" };
  }
  switch (detalle.estado) {
    case "al-dia":
      return { estado: "al-dia", detalle: `v${versionPublicada} servida`, accion: "Al día" };
    case "generando":
      return { estado: "generando", detalle: "generando archivos…", accion: "Generar/Actualizar" };
    case "verificando":
      return { estado: "verificando", detalle: "verificando archivos…", accion: "Generar/Actualizar" };
    case "atascado":
      const que = [...detalle.faltan, ...detalle.pequenos].slice(0, 3).join(", ");
      return { estado: "atascado", detalle: que ? `falta: ${que}` : "atascado", accion: "Generar/Actualizar" };
    case "no-disponible":
      return { estado: "no-disponible", detalle: "no disponible", accion: "" };
    default:
      return { estado: "no-disponible", detalle: "estado desconocido", accion: "" };
  }
}

export function filasDeMedios(estado: EstadoLanzamiento, versionPublicada: string): FilaMedio[] {
  return MEDIOS_PANEL.map((medio) => {
    const version = obtenerVersionParaMedio(estado, medio, versionPublicada);
    const { estado: estadoMedio, detalle, accion } = obtenerDetalleYAccion(estado, medio, versionPublicada);
    const formatos = medio.formatos.map((f) => ({
      nombre: f.nombre,
      url: f.url ?? (medio.id === "web" || medio.id === "pwa" ? WEB_URL : construirUrlDescarga(medio.id, f.nombre, version)),
    }));
    return {
      id: medio.id,
      titulo: medio.titulo,
      formatos,
      version,
      estado: estadoMedio,
      detalle,
      accion,
    };
  });
}

export function validarPeticion(body: unknown): ResultadoValidacion<PeticionLanzamiento> {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Cuerpo inválido: debe ser un objeto" };
  }
  const b = body as Record<string, unknown>;
  const accion = typeof b.accion === "string" ? b.accion : "";
  const accionesValidas: AccionPeticion[] = ["lanzar", "pausar", "reanudar", "reintentar", "regenerar", "auto"];
  if (!accionesValidas.includes(accion as AccionPeticion)) {
    return { ok: false, error: `acción no válida: ${accion || "(vacía)"}. Permitidas: ${accionesValidas.join(", ")}` };
  }
  if (accion === "regenerar") {
    const medio = typeof b.medio === "string" ? b.medio : "";
    if (!medio) {
      return { ok: false, error: "Acción 'regenerar' requiere 'medio'" };
    }
    if (!MEDIOS_IDS.has(medio)) {
      return { ok: false, error: `Medio no válido: ${medio}` };
    }
    return { ok: true, peticion: { accion: "regenerar", medio } };
  }
  if (accion === "auto") {
    const activo = typeof b.activo === "boolean" ? b.activo : undefined;
    if (activo === undefined) {
      return { ok: false, error: "Acción 'auto' requiere 'activo' (boolean)" };
    }
    return { ok: true, peticion: { accion: "auto", activo } };
  }
  return { ok: true, peticion: { accion: accion as AccionPeticion } };
}