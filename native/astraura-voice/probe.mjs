#!/usr/bin/env node
// @ts-nocheck
/**
 * StarSeed OS — MOTOR DE VOZ ASTRAURA (paquete NATIVO) · probe.mjs
 * ============================================================================
 * SONDEO DE HARDWARE multiplataforma + SELECCIÓN AUTOMÁTICA DE VARIANTE.
 *
 * Es la CAPA DE DECISIÓN del instalador: mira la máquina (CPU, RAM, GPU y qué
 * aceleración de GGML puede usar) y decide QUÉ cuantización del modelo OmniVoice
 * conviene descargar y con QUÉ script de compilación de `omnivoice.cpp` construir
 * los binarios. Todo con SOLO módulos nativos de Node (`os`, `child_process`) —
 * cero dependencias — para poder ejecutarse en la máquina del usuario tal cual.
 *
 * Es la ÚNICA fuente de verdad del catálogo de ficheros GGUF y de la matriz
 * hardware→modelo: install.mjs y autosync.mjs importan de aquí (no duplican).
 *
 * Ejecutable directo:  `node probe.mjs`  → imprime el informe en JSON legible
 * (JSON puro por stdout; resumen humano por stderr, para poder `> informe.json`).
 *
 * NUNCA lanza: cualquier comando del sistema que falle se trata como "no
 * disponible" y la detección sigue con lo que tenga.
 */

import os from "node:os";
import { execFileSync, execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// ── HECHOS UPSTREAM (verificados, no inventar) ───────────────────────────────
// Repo del motor C++ (C++17 + GGML). Requiere submódulos al clonar.
export const OMNIVOICE_REPO = "https://github.com/ServeurpersoCom/omnivoice.cpp";
// Repo de pesos GGUF en HuggingFace (base + tokenizer, 4 cuantizaciones).
export const HF_REPO = "Serveurperso/OmniVoice-GGUF";
// Modelo 0.6B params, arquitectura omnivoice-lm. Salida WAV mono 24 kHz.
export const SAMPLE_RATE = 24000;

/**
 * CATÁLOGO EXACTO de ficheros GGUF por cuantización (nombres literales del repo
 * `Serveurperso/OmniVoice-GGUF`). Cada variante necesita SU base + SU tokenizer.
 * NO cambiar estos nombres: son los ficheros reales publicados en HuggingFace.
 */
export const HF_FILES = {
  BF16: { base: "omnivoice-base-BF16.gguf", tokenizer: "omnivoice-tokenizer-BF16.gguf" },
  F32: { base: "omnivoice-base-F32.gguf", tokenizer: "omnivoice-tokenizer-F32.gguf" },
  Q8_0: { base: "omnivoice-base-Q8_0.gguf", tokenizer: "omnivoice-tokenizer-Q8_0.gguf" },
  Q4_K_M: { base: "omnivoice-base-Q4_K_M.gguf", tokenizer: "omnivoice-tokenizer-Q4_K_M.gguf" },
};

/**
 * MATRIZ DE GAMAS (petición del usuario). Cada gama fija su cuantización y, con
 * ella, sus dos ficheros GGUF. El `buildScript` real lo decide el backend de
 * aceleración detectado (ver selectModelVariant), no la gama.
 *
 *  · Gama ALTA  (CUDA≥12 o Metal, ≥16 GB VRAM/UMA) → BF16   (máxima calidad)
 *  · Gama MEDIA (Vulkan o Metal, ~8 GB)            → Q8_0   (equilibrio)
 *  · Gama BAJA  (CPU puro, ≤4 GB)                  → Q4_K_M (mínimo footprint)
 */
export const MODEL_VARIANTS = {
  alta: { tier: "alta", quant: "BF16", modelFile: HF_FILES.BF16.base, codecFile: HF_FILES.BF16.tokenizer },
  media: { tier: "media", quant: "Q8_0", modelFile: HF_FILES.Q8_0.base, codecFile: HF_FILES.Q8_0.tokenizer },
  baja: { tier: "baja", quant: "Q4_K_M", modelFile: HF_FILES.Q4_K_M.base, codecFile: HF_FILES.Q4_K_M.tokenizer },
};

/**
 * Scripts de build REALES de `omnivoice.cpp` por backend de aceleración.
 *   ./buildcuda.sh   → NVIDIA (CUDA)
 *   ./buildvulkan.sh → AMD / Intel (Vulkan)
 *   ./buildcpu.sh    → CPU (y BASE en macOS Apple Silicon: GGML activa
 *                      Accelerate/Metal según su propia detección)
 * (Existen además ./buildall.sh y ./checkpoints.sh; aquí elegimos el específico.)
 */
export const BUILD_SCRIPTS = {
  cuda: "./buildcuda.sh",
  vulkan: "./buildvulkan.sh",
  metal: "./buildcpu.sh", // en Apple Silicon el build CPU activa Metal vía GGML
  cpu: "./buildcpu.sh",
};

// ── Utilidades de ejecución (silenciosas, con timeout, nunca lanzan) ─────────

/** Ejecuta un binario con argumentos y devuelve stdout (o "" si falla). */
function tryExecFile(cmd, args = [], timeout = 4000) {
  try {
    return String(execFileSync(cmd, args, { timeout, stdio: ["ignore", "pipe", "ignore"] }) || "").trim();
  } catch {
    return "";
  }
}

/** Ejecuta una línea de shell (para pipes tipo `lspci | grep`). "" si falla. */
function tryExecShell(line, timeout = 4000) {
  try {
    return String(execSync(line, { timeout, stdio: ["ignore", "pipe", "ignore"], shell: true }) || "").trim();
  } catch {
    return "";
  }
}

/** Redondea a GB con un decimal a partir de bytes. */
function toGB(bytes) {
  return Math.round((bytes / 1024 ** 3) * 10) / 10;
}

// ── Detección de GPU / aceleración por sistema operativo ─────────────────────

/** macOS: Apple Silicon = Metal + memoria unificada (UMA = RAM del sistema). */
function detectMac() {
  const brand = tryExecFile("sysctl", ["-n", "machdep.cpu.brand_string"]);
  const display = tryExecFile("system_profiler", ["SPDisplaysDataType"], 8000);
  // "Chipset Model: Apple M3 Pro" → nombre de GPU.
  const chipset = (display.match(/Chipset Model:\s*(.+)/) || [])[1] || "";
  const isAppleSilicon = os.arch() === "arm64" || /Apple\s+M\d/i.test(brand);
  if (isAppleSilicon) {
    return {
      cpu: brand || "Apple Silicon",
      gpu: chipset || "Apple GPU (integrada)",
      accel: "metal", // GGML compila Metal en Apple Silicon
      uma: true, // memoria unificada: la GPU comparte la RAM del sistema
    };
  }
  // Mac Intel: sin Apple Silicon; puede tener AMD (Vulkan/Metal) — asumimos CPU
  // salvo que haya GPU dedicada AMD (Metal la cubre el build CPU también).
  return { cpu: brand || os.cpus()[0]?.model || "CPU", gpu: chipset || "GPU integrada", accel: "cpu", uma: false };
}

/** Linux: nvidia-smi (CUDA) → vulkaninfo/lspci (Vulkan) → CPU. */
function detectLinux() {
  const cpu = os.cpus()[0]?.model || "CPU";

  // 1) NVIDIA / CUDA
  const smiName = tryExecFile("nvidia-smi", ["--query-gpu=name", "--format=csv,noheader"]);
  if (smiName) {
    const vramRaw = tryExecFile("nvidia-smi", ["--query-gpu=memory.total", "--format=csv,noheader,nounits"]);
    const vramMiB = parseInt(String(vramRaw).split("\n")[0], 10);
    const vramGB = Number.isFinite(vramMiB) ? Math.round((vramMiB / 1024) * 10) / 10 : 0;
    // La versión de CUDA aparece en la cabecera de `nvidia-smi` a secas.
    const header = tryExecFile("nvidia-smi", []);
    const cudaVersion = parseFloat((header.match(/CUDA Version:\s*([\d.]+)/) || [])[1] || "0") || 0;
    return { cpu, gpu: String(smiName).split("\n")[0].trim(), accel: "cuda", vramGB, cudaVersion, uma: false };
  }

  // 2) Vulkan (AMD / Intel). vulkaninfo confirma el runtime; lspci da el nombre.
  const vulkan = tryExecFile("vulkaninfo", ["--summary"], 6000);
  const vga = tryExecShell("lspci 2>/dev/null | grep -iE 'vga|3d|display' | head -n1");
  const gpuName = (vga.split(":").pop() || "").trim();
  if (vulkan && /GPU id|deviceName|apiVersion/i.test(vulkan)) {
    return { cpu, gpu: gpuName || "GPU compatible con Vulkan", accel: "vulkan", uma: false };
  }
  // Hay GPU dedicada AMD/NVIDIA/Intel pero sin runtime → deja Vulkan como intento.
  if (/nvidia|amd|radeon|intel|arc/i.test(vga)) {
    return { cpu, gpu: gpuName || "GPU detectada", accel: "vulkan", uma: false };
  }

  // 3) CPU puro
  return { cpu, gpu: gpuName || "sin GPU dedicada", accel: "cpu", uma: false };
}

/** Windows: wmic para la GPU; NVIDIA→CUDA, resto→Vulkan; sin GPU→CPU. */
function detectWindows() {
  const cpu = os.cpus()[0]?.model || "CPU";
  const wmic = tryExecShell("wmic path win32_VideoController get name");
  const names = wmic
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^name$/i.test(l));
  const gpu = names[0] || "GPU integrada";
  if (/nvidia|geforce|rtx|quadro|tesla/i.test(gpu)) {
    const header = tryExecFile("nvidia-smi", []);
    const cudaVersion = parseFloat((header.match(/CUDA Version:\s*([\d.]+)/) || [])[1] || "0") || 0;
    const vramRaw = tryExecFile("nvidia-smi", ["--query-gpu=memory.total", "--format=csv,noheader,nounits"]);
    const vramMiB = parseInt(String(vramRaw).split("\n")[0], 10);
    const vramGB = Number.isFinite(vramMiB) ? Math.round((vramMiB / 1024) * 10) / 10 : 0;
    return { cpu, gpu, accel: "cuda", vramGB, cudaVersion, uma: false };
  }
  if (/amd|radeon|intel|arc/i.test(gpu)) {
    return { cpu, gpu, accel: "vulkan", uma: false };
  }
  return { cpu, gpu, accel: "cpu", uma: false };
}

// ── API pública ──────────────────────────────────────────────────────────────

/**
 * probeHardware — radiografía de la máquina. Devuelve:
 *   { arch, os, ramGB, freeGB, cpu, gpu, accel:'cuda'|'metal'|'vulkan'|'cpu',
 *     cudaVersion?, vramGB?, uma?, cores }
 * Nunca lanza; en el peor caso devuelve accel:'cpu' con lo básico de `os`.
 */
export function probeHardware() {
  const platform = os.platform();
  const base = {
    arch: os.arch(),
    os: platform,
    ramGB: toGB(os.totalmem()),
    freeGB: toGB(os.freemem()),
    cores: os.cpus()?.length || 1,
  };
  let detail;
  try {
    if (platform === "darwin") detail = detectMac();
    else if (platform === "win32") detail = detectWindows();
    else detail = detectLinux();
  } catch {
    detail = { cpu: os.cpus()[0]?.model || "CPU", gpu: "desconocida", accel: "cpu", uma: false };
  }
  return { ...base, ...detail };
}

/**
 * selectModelVariant — aplica la MATRIZ hardware→modelo del usuario.
 * Devuelve { tier, backend, buildScript, modelFile, codecFile, quant, reason }.
 *
 * Lógica:
 *   · El BACKEND (y su buildScript) sale del tipo de aceleración detectado.
 *   · La GAMA (y su cuantización) sale de la aceleración + memoria disponible:
 *       - "accelMem" = VRAM en CUDA/Vulkan (si se detectó); RAM del sistema en
 *         Metal (UMA) y en CPU puro.
 *       - ALTA  = CUDA≥12 con ≥16 GB, o Metal con ≥16 GB UMA.
 *       - MEDIA = Vulkan/CUDA/Metal con memoria intermedia (>4 GB).
 *       - BAJA  = CPU puro, o ≤4 GB de memoria de aceleración.
 */
export function selectModelVariant(probe) {
  const accel = probe?.accel || "cpu";
  const ram = probe?.ramGB || 0;
  const vram = probe?.vramGB || 0;
  // Memoria relevante para la aceleración elegida.
  const accelMem = accel === "metal" || accel === "cpu" ? ram : vram || ram;
  const cuda = probe?.cudaVersion || 0;

  const backend = ["cuda", "vulkan", "metal", "cpu"].includes(accel) ? accel : "cpu";
  const buildScript = BUILD_SCRIPTS[backend];

  let tier;
  let reason;
  if (accel === "cpu") {
    tier = "baja";
    reason = "CPU puro (sin aceleración de GPU detectada)";
  } else if (accel === "metal" && accelMem < 12) {
    // LECCIÓN REAL (Adenda 85, M1 8 GB): la memoria UNIFICADA se comparte con
    // el navegador y el sistema — con 8 GB, Q8_0 entra en swap y una frase
    // agota los 180 s. En Metal, la gama MEDIA exige ≥12 GB; por debajo,
    // Q4_K_M (la mitad de memoria, ~2× más rápida) suena igual de digna.
    tier = "baja";
    reason = `Apple Silicon con ${accelMem} GB unificados (<12): Q4_K_M para no pelear con el navegador por la RAM`;
  } else if (accelMem <= 4) {
    tier = "baja";
    reason = `Memoria de aceleración baja (~${accelMem} GB ≤ 4 GB)`;
  } else if ((accel === "cuda" && cuda >= 12 && accelMem >= 16) || (accel === "metal" && accelMem >= 16)) {
    tier = "alta";
    reason =
      accel === "cuda"
        ? `CUDA ${cuda} con ${accelMem} GB de VRAM (≥16)`
        : `Apple Silicon (Metal) con ${accelMem} GB de memoria unificada (≥16)`;
  } else {
    tier = "media";
    reason = `${accel} con ~${accelMem} GB de memoria (gama media)`;
  }

  const v = MODEL_VARIANTS[tier];
  return {
    tier,
    backend,
    buildScript,
    quant: v.quant,
    modelFile: v.modelFile,
    codecFile: v.codecFile,
    reason,
  };
}

/**
 * summarize — informe combinado hardware + variante elegida (para el JSON de
 * `node probe.mjs` y para que install.mjs lo guarde en config.json).
 */
export function summarize() {
  const hardware = probeHardware();
  const variant = selectModelVariant(hardware);
  return {
    engine: "omnivoice.cpp",
    repo: OMNIVOICE_REPO,
    hfRepo: HF_REPO,
    sampleRate: SAMPLE_RATE,
    hardware,
    variant,
    generatedAt: new Date().toISOString(),
  };
}

// ── CLI directa ──────────────────────────────────────────────────────────────

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const report = summarize();
  const { hardware: h, variant: v } = report;
  // Resumen humano por STDERR (no contamina el JSON de STDOUT).
  const line = (s) => process.stderr.write(s + "\n");
  line("");
  line("  🌌  ASTRAURA · Sondeo de hardware para el Motor de Voz");
  line("  ───────────────────────────────────────────────────────");
  line(`  SO / arquitectura : ${h.os} · ${h.arch} · ${h.cores} núcleos`);
  line(`  CPU               : ${h.cpu}`);
  line(`  RAM               : ${h.ramGB} GB (libre ${h.freeGB} GB)`);
  line(`  GPU               : ${h.gpu}`);
  line(
    `  Aceleración       : ${h.accel}` +
      (h.cudaVersion ? ` (CUDA ${h.cudaVersion})` : "") +
      (h.vramGB ? ` · ${h.vramGB} GB VRAM` : "") +
      (h.uma ? " · memoria unificada" : ""),
  );
  line("  ───────────────────────────────────────────────────────");
  line(`  → Gama            : ${v.tier.toUpperCase()}  (${v.reason})`);
  line(`  → Cuantización    : ${v.quant}`);
  line(`  → Modelo          : ${v.modelFile}`);
  line(`  → Tokenizer/codec : ${v.codecFile}`);
  line(`  → Build           : ${v.buildScript}  (backend ${v.backend})`);
  line("");
  // JSON puro por STDOUT (parseable, `node probe.mjs > informe.json`).
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}
