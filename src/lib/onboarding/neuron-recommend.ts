"use client";

/**
 * Recomendador de neurona — detección REAL de hardware + mejores opciones.
 * ============================================================================
 * Fuente única compartida por: la página /instalar, el wizard de iniciación
 * (paso "Astraura local") y el alta de neurona nueva en cuenta existente.
 * Nada simulado: lo que el navegador no expone se declara honestamente.
 */

export type HW = {
  so: string;
  arch: string;
  nucleos: number | null;
  ramGB: number | null;
  gpu: string | null;
  movil: boolean;
};

// (Ola 226) url/es estado lean el manifiesto config/astraura-models.json: solo se
// recomiendan y descargan los modelos con url publicada; el resto son «Próximamente».
export const MODELOS: { id: string; nombre: string; params: string; arq: string; disco: string; ramMin: number; url: string | null }[] = [
  { id: "needle2", nombre: "Needle 2", params: "45 M", arq: "CQ2-bit (Cactus)", disco: "~14 MB", ramMin: 1, url: null },
  { id: "bitnet-2b", nombre: "BitNet b1.58 (Microsoft)", params: "2 B", arq: "1.58-bit ternario", disco: "~400-500 MB", ramMin: 2, url: "https://huggingface.co/microsoft/BitNet-b1.58-2B-4T-gguf/resolve/main/ggml-model-i2_s.gguf" },
  { id: "bonsai-1.7b", nombre: "Ternary Bonsai (mini)", params: "1.7 B", arq: "1.58-bit ternario", disco: "~462 MB", ramMin: 2, url: null },
  { id: "bonsai-8b-1bit", nombre: "Bonsai 8B (1-bit puro)", params: "8 B", arq: "1-bit puro", disco: "~1.15 GB", ramMin: 6, url: null },
  { id: "bonsai-8b", nombre: "Ternary Bonsai (estándar)", params: "8 B", arq: "1.58-bit ternario", disco: "~1.75 GB", ramMin: 8, url: null },
];

export const CONCIENCIAS: { id: string; nombre: string; desc: string; extra: string }[] = [
  { id: "semilla", nombre: "Semilla", desc: "Solo conexión mesh remota; sin réplica local.", extra: "0 MB" },
  { id: "brote", nombre: "Brote", desc: "Caché local ligera del estado colectivo.", extra: "~256-512 MB" },
  { id: "bosque", nombre: "Bosque", desc: "Réplica amplia para operar sin conexión y servir a otras neuronas.", extra: "2 GB+" },
];

export async function detectar(): Promise<HW> {
  const n: any = typeof navigator !== "undefined" ? navigator : {};
  const plat: string = (n.userAgentData && n.userAgentData.platform) || n.platform || "";
  const ua: string = n.userAgent || "";
  let so = "Desconocido";
  if (/Android/i.test(ua)) so = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua + " " + plat)) so = "iOS / iPadOS";
  else if (/Mac/i.test(plat)) so = "macOS";
  else if (/Win/i.test(plat)) so = "Windows";
  else if (/Linux|X11/i.test(plat)) so = "Linux";
  const movil = /Android|iPhone|iPad|Mobile/i.test(ua);
  let arch = "desconocida";
  try {
    if (n.userAgentData && n.userAgentData.getHighEntropyValues) {
      const h = await n.userAgentData.getHighEntropyValues(["architecture", "bitness"]);
      if (h && h.architecture) arch = h.architecture + (h.bitness ? " " + h.bitness + "-bit" : "");
    }
  } catch { /* honesto: se queda desconocida */ }
  let gpu: string | null = null;
  try {
    const c = document.createElement("canvas");
    const gl: any = c.getContext("webgl2") || c.getContext("webgl");
    const ext = gl ? gl.getExtension("WEBGL_debug_renderer_info") : null;
    if (gl && ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
  } catch { /* sin GPU visible */ }
  if (arch === "desconocida" && so === "macOS" && gpu && /Apple/i.test(gpu)) arch = "arm 64-bit (Apple Silicon)";
  const ramGB = typeof n.deviceMemory === "number" ? n.deviceMemory : null;
  const nucleos = typeof n.hardwareConcurrency === "number" ? n.hardwareConcurrency : null;
  return { so, arch, nucleos, ramGB, gpu, movil };
}

export function recomendar(hw: HW): { modelo: string; conciencia: string; motor: "auto" | "bitnet-158"; razones: string[] } {
  const razones: string[] = [];
  let modelo = "bitnet-2b";
  let conciencia = "semilla";
  const ram = hw.ramGB;
  if (ram === null) {
    modelo = hw.movil ? "needle2" : "bitnet-2b";
    razones.push("Tu navegador no expone la RAM, así que elijo una opción conservadora que corre bien en casi cualquier equipo. Puedes subir de modelo cuando quieras en Ajustes → Neurona.");
  } else if (ram >= 8) {
    modelo = "bonsai-8b";
    conciencia = "brote";
    razones.push(`Detecté ${ram} GB de RAM (o más): tu equipo puede con el modelo estándar de 8B ternario, el más capaz de la familia 1.58-bit, y con una caché local de conciencia colectiva (Brote).`);
  } else if (ram >= 6) {
    modelo = "bonsai-8b-1bit";
    razones.push(`Con ${ram} GB de RAM cabe el Bonsai 8B en 1-bit puro (~1.15 GB): máxima capacidad sin arriesgar la fluidez.`);
  } else if (ram >= 4) {
    modelo = "bonsai-1.7b";
    razones.push(`Con ${ram} GB de RAM, el Ternary Bonsai mini (1.7B, ~462 MB) da el mejor equilibrio entre inteligencia local y memoria libre.`);
  } else {
    modelo = hw.movil ? "needle2" : "bitnet-2b";
    razones.push(`Con ${ram} GB de RAM conviene la opción más ligera; el razonamiento pesado puede apoyarse en la conciencia colectiva remota.`);
  }
  const motor: "auto" | "bitnet-158" = "auto";
  razones.push("Motor en modo auto: usa tu BitNet 1.58 local cuando está disponible y releva a la red cuando conviene.");
  // (Ola 226) Nunca recomendar un modelo sin url publicada: cae al primer descargable.
  const elegido = MODELOS.find((m) => m.id === modelo);
  if (elegido && !elegido.url) {
    const descargable = [...MODELOS].filter((m) => m.url).sort((a, b) => a.ramMin - b.ramMin)[0];
    if (descargable) {
      razones.push(`El modelo ${elegido.nombre} está «por publicar»: aún no tiene descarga. De momento recomiendo ${descargable.nombre}, el único que puedes instalar hoy.`);
      modelo = descargable.id;
    }
  }
  if (hw.movil) razones.push("Dispositivo móvil: mientras las apps nativas móviles están en diseño, la web instalable (PWA) es la vía recomendada.");
  if (hw.nucleos) razones.push(`${hw.nucleos} núcleos de CPU disponibles para la inferencia ternaria local.`);
  if (hw.gpu) razones.push(`GPU detectada: ${hw.gpu}.`);
  return { modelo, conciencia, motor, razones };
}

// ── Descarga directa del instalador según el equipo detectado ───────────────
export const DESKTOP_VERSION = "0.1.0";
const BASE = `https://github.com/StarSeedSystem/starseed-system/releases/download/desktop-v${DESKTOP_VERSION}`;

export function assetDirecto(hw: HW): { href: string; etiqueta: string } | null {
  const arm = /arm|aarch/i.test(hw.arch) || (hw.so === "macOS" && /Apple/i.test(hw.gpu || ""));
  if (hw.so === "macOS") {
    return arm
      ? { href: `${BASE}/StarSeed.OS_${DESKTOP_VERSION}_aarch64.dmg`, etiqueta: `macOS Apple Silicon — .dmg (v${DESKTOP_VERSION})` }
      : { href: `${BASE}/StarSeed.OS_${DESKTOP_VERSION}_x64.dmg`, etiqueta: `macOS Intel — .dmg (v${DESKTOP_VERSION})` };
  }
  if (hw.so === "Windows") {
    return { href: `${BASE}/StarSeed.OS_${DESKTOP_VERSION}_x64-setup.exe`, etiqueta: `Windows x64 — instalador .exe (v${DESKTOP_VERSION})` };
  }
  if (hw.so === "Linux") {
    return arm
      ? { href: `${BASE}/StarSeed.OS_${DESKTOP_VERSION}_aarch64.AppImage`, etiqueta: `Linux ARM64 — .AppImage (v${DESKTOP_VERSION})` }
      : { href: `${BASE}/StarSeed.OS_${DESKTOP_VERSION}_amd64.AppImage`, etiqueta: `Linux x64 — .AppImage (v${DESKTOP_VERSION})` };
  }
  return null;
}
