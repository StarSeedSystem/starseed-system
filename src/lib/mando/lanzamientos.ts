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

export function filasDeMedios(estado: LanzamientoEstado, versionPublicada: string): MedioFila[] {
  return MEDIOS_PANEL.map((m) => {
    const info = estado.medios[m.id] || { estado: "no-disponible", faltan: [], pequenos: [] };
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
