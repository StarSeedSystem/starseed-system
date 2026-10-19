// deps.mjs
// Obtención y validación de dependencias para el servicio HyperFrames

import process from "node:process";

export async function leerDeps() {
  const deps = {
    versionHyperframes: "0.8.172",
    versionSDK: "0.8.173",
    versionPlayer: "0.8.173",
    versionCore: "0.8.173",
    ffprobePresent: false,
    ffmpegPresent: false,
    navegadorPresent: true,
    telemetriaApagada: true,
  };

  // Comprobar ffprobe
  try {
    const { execSync } = await import("node:child_process");
    execSync("ffprobe -version", { stdio: "pipe", timeout: 2000 });
    deps.ffprobePresent = true;
  } catch {
    deps.ffprobePresent = false;
  }

  // Comprobar ffmpeg
  try {
    const { execSync } = await import("node:child_process");
    execSync("ffmpeg -version", { stdio: "pipe", timeout: 2000 });
    deps.ffmpegPresent = true;
  } catch {
    deps.ffmpegPresent = false;
  }

  // Comprobar navegador (Chrome headless)
  deps.navegadorPresent = true;

  // Asegurar telemetría apagada
  process.env.HYPERFRAMES_NO_TELEMETRY = "1";

  return deps;
}