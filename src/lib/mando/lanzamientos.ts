import type { LanzamientoEstado, MedioFila, PeticionLanzamiento } from "./lanzamientos-tipos";

export const MEDIOS_PANEL = [
  { id: "web", titulo: "Sitio web oficial", formatos: [{ nombre: "starseed-os.vercel.app", url: "https://starseed-os.vercel.app" }] },
  { id: "pwa", titulo: "App web instalable (PWA)", formatos: [{ nombre: "manifiesto", url: "https://starseed-os.vercel.app/manifest.json" }] },
  { id: "macos", titulo: "macOS", formatos: [{ nombre: ".dmg", url: "" }, { nombre: ".app.tar.gz", url: "" }] },
  { id: "windows", titulo: "Windows", formatos: [{ nombre: ".msi", url: "" }, { nombre: "-setup.exe", url: "" }] },
  { id: "linux", titulo: "Linux", formatos: [{ nombre: ".AppImage", url: "" }, { nombre: ".deb", url: "" }, { nombre: ".rpm", url: "" }] },
  { id: "android", titulo: "Android", formatos: [{ nombre: ".apk", url: "" }] },
  { id: "ios", titulo: "iOS", formatos: [{ nombre: ".ipa", url: "" }] },
  { id: "canales", titulo: "Canales del actualizador", formatos: [{ nombre: "latest.json", url: "" }, { nombre: "latest-nexus.json", url: "" }, { nombre: "latest-cafe.json", url: "" }] },
  { id: "libreria", titulo: "Librería de StarSeed OS", formatos: [{ nombre: "ficha", url: "/api/os/versiones" }] },
] as const;

/** Estado del panel cuando el director aún no ha escrito nada. */
export function estadoVacio(version: string): LanzamientoEstado {
  return {
    fase: "esperando-lista",
    detalle: "",
    version,
    pasos: [],
    jobs: [],
    medios: {},
    historial: [],
    pausado: false,
    tono: "normal",
  };
}

const CLAVES_DEL_CONTRATO = new Set([
  "fase", "detalle", "version", "pasos", "jobs", "medios", "historial", "pausado", "tono", "run_url", "release_url",
]);

function soloTextos(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/**
 * (SUP0611A, 05-11) El director de lanzamientos (`scripts/puente/director_lanzamientos.py`)
 * escribe `lanzamientos-estado.json` POR FASES: en «esperando-lista» solo trae
 * {fase, detalle, t, tono, pendientes}, sin `medios`, `version`, `pasos`, `jobs`, `historial`
 * ni `pausado`. La ruta lo daba por completo y `filasDeMedios` moría con «Cannot read
 * properties of undefined (reading 'web')» (42 veces en el registro de Genesis el 05-11: el
 * panel «Versiones» sin datos). Aquí cada campo del contrato toma su valor o, si falta o no
 * es de su tipo, el del estado vacío; lo que no es del contrato (`pendientes`, `t`…) se
 * conserva tal cual. Pura.
 */
export function normalizarEstado(crudo: unknown, versionPorDefecto: string): LanzamientoEstado {
  const base = estadoVacio(versionPorDefecto);
  if (typeof crudo !== "object" || crudo === null || Array.isArray(crudo)) return base;
  const o = crudo as Record<string, unknown>;
  const extra = Object.fromEntries(Object.entries(o).filter(([k]) => !CLAVES_DEL_CONTRATO.has(k)));
  const medios: LanzamientoEstado["medios"] = {};
  if (typeof o.medios === "object" && o.medios !== null && !Array.isArray(o.medios)) {
    for (const [id, v] of Object.entries(o.medios as Record<string, unknown>)) {
      const m = typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
      medios[id] = {
        estado: typeof m.estado === "string" ? m.estado : "no-disponible",
        faltan: soloTextos(m.faltan),
        pequenos: soloTextos(m.pequenos),
      };
    }
  }
  const texto = (v: unknown, defecto: string) => (typeof v === "string" ? v : defecto);
  return {
    ...extra,
    fase: texto(o.fase, base.fase),
    detalle: texto(o.detalle, base.detalle),
    version: texto(o.version, "") || base.version,
    pasos: Array.isArray(o.pasos) ? (o.pasos as LanzamientoEstado["pasos"]) : [],
    jobs: Array.isArray(o.jobs) ? (o.jobs as LanzamientoEstado["jobs"]) : [],
    medios,
    historial: Array.isArray(o.historial) ? (o.historial as LanzamientoEstado["historial"]) : [],
    pausado: o.pausado === true,
    tono: texto(o.tono, base.tono),
    ...(typeof o.run_url === "string" ? { run_url: o.run_url } : {}),
    ...(typeof o.release_url === "string" ? { release_url: o.release_url } : {}),
  };
}

export function filasDeMedios(estado: LanzamientoEstado, versionPublicada: string): MedioFila[] {
  // Defensa por si alguien pasa un estado sin normalizar (SUP0611A).
  const medios: Partial<LanzamientoEstado["medios"]> = estado.medios ?? {};
  return MEDIOS_PANEL.map((m) => {
    const guardado = medios[m.id];
    const info = {
      estado: typeof guardado?.estado === "string" ? guardado.estado : "no-disponible",
      faltan: soloTextos(guardado?.faltan),
      pequenos: soloTextos(guardado?.pequenos),
    };
    const version = estado.version || versionPublicada;
    const baseUrl = "https://github.com/StarSeedSystem/starseed-system/releases/download";
    
    return {
      id: m.id as string,
      titulo: m.titulo,
      formatos: m.formatos.map(f => {
        if (m.id === "web") {
          return { ...f, url: "https://starseed-os.vercel.app" };
        }
        if (m.id === "libreria") {
          return f;
        }
        if (m.id === "pwa") {
          return { ...f, url: "https://starseed-os.vercel.app/manifest.json" };
        }
        // Para medios de releases, construir URL con versión
        const archivo = `v${version}/StarSeed_${m.id}_${f.nombre.replace(/^\./, "")}`;
        return { ...f, url: `${baseUrl}/${archivo}` };
      }),
      version,
      estado: info.estado,
      detalle: info.faltan.length > 0 ? `Faltan: ${info.faltan.join(", ")}` : info.pequenos.length > 0 ? "Archivos demasiado pequeños" : "Al día",
      accion: m.id === "web" ? "Publicar ahora" : "Generar/Actualizar",
    };
  });
}

export function validarPeticion(body: unknown): PeticionLanzamiento | { error: string } {
  if (typeof body !== "object" || body === null) return { error: "Cuerpo inválido" };
  const p = body as PeticionLanzamiento;
  const accionesValidas = ["lanzar", "pausar", "reanudar", "reintentar", "regenerar", "auto"];
  if (!p.accion || !accionesValidas.includes(p.accion)) return { error: "Acción inválida" };
  if (p.accion === "regenerar" && !p.medio) return { error: "Medio requerido" };
  if (p.accion === "auto" && typeof p.activo !== "boolean") return { error: "Campo 'activo' requerido para 'auto'" };
  return p;
}
