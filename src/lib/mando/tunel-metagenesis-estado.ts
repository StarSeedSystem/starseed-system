import { exec } from "node:child_process";
import { readFile } from "node:fs/promises";
import { platform } from "node:process";
import { promisify } from "node:util";

const execPromise = promisify(exec);

// Function to tachar URLs trying to match trycloudflare
export function tacharTrycloudflare(line: string): string {
  return line.replace(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g, "[túnel]");
}

export async function estadoTunelMetaGenesis(): Promise<{
  cargado: boolean;
  pid: number | null;
  ultimasLineas: string[];
  medidoEn: string;
  motivo?: string;
}> {
  // If not macOS, return not loaded
  if (platform() !== "darwin") {
    return {
      cargado: false,
      pid: null,
      ultimasLineas: [],
      medidoEn: new Date().toISOString(),
      motivo: "No macOS",
    };
  }

  // Try to get the service status via launchctl
  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  try {
    const { stdout: out, stderr: err } = await execPromise("launchctl list com.starseed.tunel-metagenesis");
    stdout = out;
    stderr = err;
  } catch (err: any) {
    // The command failed (non-zero exit code)
    stdout = err.stdout ?? "";
    stderr = err.stderr ?? "";
    exitCode = err.code ?? 0;
  }

  // If the service is not found (exit code 1) or other error, consider not loaded
  const cargado = exitCode === 0;
  let pid: number | null = null;

  if (cargado) {
    // Parse the output to get the PID
    // The output of launchctl list for a service is:
    //   PID   Status   Label
    //   12345   0   com.starseed.tunel-metagenesis
    // We split by whitespace and take the first field (PID) and the second field (status) should be 0 for success.
    const lines = stdout.trim().split("\n");
    // Skip the header line
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line) {
        const parts = line.split(/\s+/);
        if (parts.length >= 3 && parts[2] === "com.starseed.tunel-metagenesis") {
          const pidStr = parts[0];
          const status = parts[1];
          if (status === "0") {
            pid = parseInt(pidStr, 10);
          }
          break;
        }
      }
    }
  }

  // Read the last 5 lines of the log file
  const logPath = "/tmp/starseed-tunel-metagenesis.log";
  let ultimasLineas: string[] = [];
  try {
    const logContent = await readFile(logPath, "utf-8");
    const lines = logContent.trim().split("\n");
    // Take the last 5 lines
    ultimasLineas = lines.slice(-5).map((line) => line.trim());
  } catch (err) {
    // If we can't read the log, we leave ultimasLineas as empty array
    ultimasLineas = [];
  }

  // Apply tachar to each line
  ultimasLineas = ultimasLineas.map(tacharTrycloudflare);

  return {
    cargado,
    pid,
    ultimasLineas,
    medidoEn: new Date().toISOString(),
    ...(cargado ? {} : { motivo: cargado ? undefined : "Service not running" }),
  };
}