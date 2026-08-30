"use client";

/**
 * StarSeed OS — Conectar carpeta + DETECTAR configs de cerebros/cuentas (Adenda 180).
 * ----------------------------------------------------------------------------
 * El permiso de «archivos» de la Bienvenida abría el picker y descartaba el
 * resultado (o ni existía en Safari) → «no funciona». Este flujo lo hace REAL:
 *   1. Elige carpeta: File System Access (Chromium) o respaldo universal
 *      `<input webkitdirectory>` (Safari/Firefox — funciona en todos los SO).
 *   2. DETECTA dentro las configuraciones StarSeed: memory root portable,
 *      registro de cerebros, recuerdos/cuenta, personalidades, voz.
 *   3. Dispara la auto-detección/enlace/escaneo del backend soberano de la
 *      neurona (si está vivo), que ve TODOS los volúmenes montados.
 * Honesto siempre: dice qué encontró, qué no, y por qué vía.
 */

export interface CarpetaDetectada {
  nombre: string;
  via: "fsa" | "subida";
  totalArchivos: number;
  md: number;
  marcadores: string[];
}

const MARCADORES: Record<string, string> = {
  "memory.manifest.json": "memoria portable (memory root)",
  "cerebros_registry.json": "registro de CEREBROS",
  "recuerdos_core.json": "recuerdos/identidad de cuenta",
  "custom_personalities.json": "personalidades",
  "active_personality.json": "personalidad activa",
  "daemon_state.json": "estado de voz",
  "mem0_store.json": "memorias mem0",
};

function detectar(nombres: { rel: string; name: string }[]): { marcadores: string[]; md: number } {
  const hallados = new Set<string>();
  let md = 0;
  for (const f of nombres) {
    if (/\.md$/i.test(f.name)) md++;
    const m = MARCADORES[f.name];
    if (m) hallados.add(`${m} (${f.rel})`);
    if (f.rel.includes("starseed_memory_root")) hallados.add("carpeta starseed_memory_root");
  }
  return { marcadores: [...hallados].slice(0, 8), md };
}

type DirHandle = { name: string; values(): AsyncIterable<{ kind: string; name: string } & DirHandle> };

async function caminarFsa(dir: DirHandle, prefijo: string, out: { rel: string; name: string }[], prof: number): Promise<void> {
  if (prof > 4 || out.length > 600) return;
  for await (const e of dir.values()) {
    const rel = prefijo ? `${prefijo}/${e.name}` : e.name;
    if (e.kind === "directory") await caminarFsa(e, rel, out, prof + 1);
    else out.push({ rel, name: e.name });
    if (out.length > 600) return;
  }
}

/** Picker universal: FSA en Chromium; respaldo `webkitdirectory` en Safari/Firefox. */
async function elegirCarpeta(): Promise<{ nombre: string; via: "fsa" | "subida"; files: { rel: string; name: string }[] } | null> {
  if (typeof window === "undefined") return null;
  if ("showDirectoryPicker" in window) {
    try {
      const dir = await (window as unknown as { showDirectoryPicker: (o?: unknown) => Promise<DirHandle> }).showDirectoryPicker({ mode: "read" });
      const files: { rel: string; name: string }[] = [];
      await caminarFsa(dir, "", files, 0);
      return { nombre: dir.name, via: "fsa", files };
    } catch { return null; } // cancelado o denegado
  }
  // Respaldo universal (todos los navegadores/SO): subir carpeta.
  return await new Promise((res) => {
    const input = document.createElement("input");
    input.type = "file";
    (input as unknown as { webkitdirectory: boolean }).webkitdirectory = true;
    input.style.display = "none";
    const fin = (v: { nombre: string; via: "subida"; files: { rel: string; name: string }[] } | null) => { input.remove(); res(v); };
    input.onchange = () => {
      const list = Array.from(input.files ?? []).slice(0, 800);
      if (!list.length) return fin(null);
      const files = list.map((f) => ({ rel: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name, name: f.name }));
      const raiz = files[0].rel.split("/")[0] || "carpeta";
      fin({ nombre: raiz, via: "subida", files });
    };
    window.addEventListener("focus", () => setTimeout(() => { if (!input.files?.length) fin(null); }, 1200), { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

/** Flujo completo del permiso de archivos: elegir → detectar → auto-detección backend. */
export async function conectarCarpetaYDetectar(): Promise<{ resumen: string; backend?: string } | null> {
  const sel = await elegirCarpeta();
  if (!sel) return null;
  const d = detectar(sel.files);
  const via = sel.via === "fsa" ? "acceso directo" : "subida (este navegador no abre carpetas en vivo)";
  const resumen = d.marcadores.length
    ? `«${sel.nombre}» conectada (${via}): ${d.marcadores.join(" · ")}${d.md ? ` · ${d.md} .md` : ""}.`
    : `«${sel.nombre}» conectada (${via}): ${sel.files.length} archivos, sin configs StarSeed reconocibles dentro.`;
  // Auto-detección del backend soberano (ve TODOS los volúmenes del dispositivo).
  let backend: string | undefined;
  try {
    const c = await import("@/lib/astraura/astraura-158-client");
    const det = await c.autoDetectAstraura158Brains("local");
    if (det.ok) {
      await c.autoLinkAstraura158Brains("local").catch(() => null);
      await c.scanAstraura158StorageNow("local").catch(() => null);
      backend = "Backend de la neurona: auto-detección de cerebros + escaneo de almacenamientos disparados.";
    } else {
      backend = "Backend de la neurona sin conexión: la detección profunda de volúmenes queda para cuando esté vivo.";
    }
  } catch { /* sin backend: el resumen local ya es honesto */ }
  return { resumen, backend };
}
