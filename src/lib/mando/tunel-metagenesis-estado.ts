import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface EstadoTunelMetaGenesis {
  cargado: boolean;
  pid: number | null;
  ultimasLineas: string[];
  medidoEn: string; // ISO string
}

/**
 * Ejecuta una función y devuelve un valor por defecto si falla.
 */
export async function intentar<T>(promesa: Promise<T>, porDefecto: T): Promise<T> {
  try {
    return await promesa;
  } catch {
    return porDefecto;
  }
}

/**
 * Sustituye URLs de trycloudflare por "[túnel]" en el texto.
 */
export function tacharTexto(texto: string): string {
  return texto.replace(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g, "[túnel]");
}

/**
 * Obtiene el estado del túnel de MetaGenesis en macOS.
 * En otros sistemas o si falla, devuelve cargado:false.
 */
export async function estadoTunelMetaGenesis(): Promise<EstadoTunelMetaGenesis> {
  // Solo funciona en macOS
  if (process.platform !== "darwin") {
    return {
      cargado: false,
      pid: null,
      ultimasLineas: [],
      medidoEn: new Date().toISOString(),
    };
  }

  try {
    // Obtener estado del servicio launchctl
    const launchctlResult = await intentar(
      execFileAsync("launchctl", ["list", "com.starseed.tunel-metagenesis"]),
      { stdout: "", stderr: "" }
    );

    const cargado = launchctlResult.stdout.includes("com.starseed.tunel-metagenesis");
    let pid: number | null = null;

    if (cargado && launchctlResult.stdout) {
      const líneas = launchctlResult.stdout.trim().split("\n");
      for (const línea of líneas) {
        const partes = línea.trim().split(/\s+/);
        if (partes.length >= 3 && partes[2] === "com.starseed.tunel-metagenesis") {
          const pidParsed = Number.parseInt(partes[0], 10);
          if (!Number.isNaN(pidParsed)) {
            pid = pidParsed;
            break;
          }
        }
      }
    }

    // Obtener últimas líneas del log
    const logResult = await intentar(
      readFile("/tmp/starseed-tunel-metagenesis.log", "utf-8"),
      ""
    );

    const líneas = logResult
      .split("\n")
      .filter((línea) => línea.trim().length > 0)
      .slice(-5)
      .map(tacharTexto);

    return {
      cargado,
      pid,
      ultimasLineas: líneas,
      medidoEn: new Date().toISOString(),
    };
  } catch (error) {
    // En caso de cualquier error, devolver estado no cargado
    return {
      cargado: false,
      pid: null,
      ultimasLineas: [],
      medidoEn: new Date().toISOString(),
    };
  }
}