// src/lib/mando/tunel-metagenesis-estado.ts
import { exec } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { platform } from 'node:os';

export interface EstadoTunelMetaGenesis {
  cargado: boolean;
  pid: number | null;
  ultimasLineas: string[];
  medidoEn: string; // ISO timestamp
  motivo?: string;
}

export const TACHKAR_REGEX = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/g;

export function tachar(linea: string): string {
  return linea.replace(TACHKAR_REGEX, '[túnel]');
}

export async function estadoTunelMetaGenesis(): Promise<EstadoTunelMetaGenesis> {
  if (platform() !== 'darwin') {
    return {
      cargado: false,
      pid: null,
      ultimasLineas: [],
      medidoEn: new Date().toISOString(),
      motivo: 'No macOS',
    };
  }

  try {
    // Check if the service is loaded
    const { stdout, stderr, exitCode } = await promisifyExec(
      'launchctl list com.starseed.tunel-metagenesis'
    );

    if (exitCode !== 0) {
      return {
        cargado: false,
        pid: null,
        ultimasLineas: [],
        medidoEn: new Date().toISOString(),
        motivo: stderr || 'Service not found',
      };
    }

    // Parse the output to get PID
    // Example output: "	-	0	com.starseed.tunel-metagenesis"
    // or if not running: "" (empty) but we already checked exitCode?
    // Actually, launchctl list returns 0 even if the service is not running? Let's check the man page.
    // We'll look for the PID in the second column.
    const lines = stdout.trim().split('\n');
    let pid: number | null = null;
    for (const line of lines) {
      if (line.includes('com.starseed.tunel-metagenesis')) {
        const parts = line.split(/\s+/);
        // The format is: [PID] [status] [label]? Actually, from man launchctl list:
        // The output consists of three fields: <PID> <Status> <Label>
        // But sometimes the PID is "-" if not running.
        if (parts.length >= 3) {
          const pidStr = parts[0];
          if (pidStr !== '-') {
            pid = parseInt(pidStr, 10);
          }
          break;
        }
      }
    }

    // Get the last 5 lines of the log
    let ultimasLineas: string[] = [];
    try {
      const logData = await readFile('/tmp/starseed-tunel-metagenesis.log', 'utf8');
      const lines = logData.trim().split('\n');
      // Take the last 5 lines, or fewer if there are less than 5
      ultimasLineas = lines.slice(-5).map(tachar);
    } catch (e) {
      // If we can't read the log, we still return the service status
      ultimasLineas = [];
    }

    return {
      cargado: true,
      pid,
      ultimasLineas,
      medidoEn: new Date().toISOString(),
    };
  } catch (e) {
    return {
      cargado: false,
      pid: null,
      ultimasLineas: [],
      medidoEn: new Date().toISOString(),
      motivo: e instanceof Error ? e.message : 'Unknown error',
    };
  }
}

// Helper to promisify exec
function promisifyExec(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        resolve({ stdout, stderr: stderr || '', exitCode: error.code });
      } else {
        resolve({ stdout, stderr: '', exitCode: 0 });
      }
    });
  });
}