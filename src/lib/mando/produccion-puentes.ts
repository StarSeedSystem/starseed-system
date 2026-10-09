import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

export interface PuenteInfo {
  id: string;
  tipo: "propio" | "externo";
  capacidades: string[];
  env?: string[];
  cupo?: number;
}

export const BRIDGES: PuenteInfo[] = [
  { id: "bandeja", tipo: "propio", capacidades: ["avisos"], env: [] },
  { id: "chat_director", tipo: "propio", capacidades: ["avisos"], env: [] },
  { id: "n8n_hf", tipo: "externo", capacidades: ["redes", "drive"], env: ["N8N_HF_URL"], cupo: 1000 },
  { id: "n8n_cloud", tipo: "externo", capacidades: ["redes", "drive"], env: ["N8N_CLOUD_URL"], cupo: 1000 },
];

export interface EstadoPuente {
  usos_mes: number;
  mes: string;
  latencia_media: number | null;
  peso: number;
  fallos_seguidos: number;
  ultimo_ok: string | null;
  ultimo_fallo: string | null;
}

export interface EstadoPuentes {
  [clave: string]: EstadoPuente;
}

export interface PathDetails {
  id: string;
  tipo: "propio" | "externo";
  estado: EstadoPuente;
  configurado: boolean;
}

export async function obtenerPuentes(): Promise<PathDetails[]> {
  const estadoPath = path.join(os.homedir(), ".starseed", "produccion", "puentes.json");
  let estado: EstadoPuentes = {};
  
  try {
    const contenido = await readFile(estadoPath, "utf-8");
    estado = JSON.parse(contenido);
  } catch {
    estado = {};
  }

  const entornos = { ...process.env };
  const configurados = BRIDGES.filter((p) =>
    p.tipo === "propio" || p.env?.every((e) => entornos[e] !== undefined)
  );

  return configurados.map((p) => {
    const e = estado[p.id] || {
      usos_mes: 0,
      mes: "",
      latencia_media: null,
      peso: 0.5,
      fallos_seguidos: 0,
      ultimo_ok: null,
      ultimo_fallo: null,
    };

    return {
      id: p.id,
      tipo: p.tipo,
      estado: e,
      configurado: configurados.some((cp) => cp.id === p.id),
    };
  });
}

function obtenerMes(ahora: Date): string {
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`;
}

function validarFecha(fecha: unknown): Date | null {
  if (!fecha) return null;
  if (typeof fecha === "string") {
    const fechaDate = new Date(fecha);
    return isNaN(fechaDate.getTime()) ? null : fechaDate;
  }
  if (fecha instanceof Date) {
    return isNaN(fecha.getTime()) ? null : fecha;
  }
  return null;
}

export async function actualizarEstadoPuente(
  id: string,
  exito: boolean,
  latencia: number | null,
  ahora: Date,
): Promise<void> {
  const estadoPath = path.join(os.homedir(), ".starseed", "produccion", "puentes.json");
  
  let estado: EstadoPuentes = {};
  try {
    const contenido = await readFile(estadoPath, "utf-8");
    estado = JSON.parse(contenido);
  } catch {
    estado = {};
  }

  const e = estado[id] || {
    usos_mes: 0,
    mes: "",
    latencia_media: null,
    peso: 0.5,
    fallos_seguidos: 0,
    ultimo_ok: null,
    ultimo_fallo: null,
  };

  const mes = obtenerMes(ahora);
  if (e.mes !== mes) {
    e.usos_mes = 0;
    e.fallos_seguidos = 0;
    e.mes = mes;
  }

  if (exito) {
    e.usos_mes += 1;
    e.fallos_seguidos = 0;
    e.ultimo_ok = ahora.toISOString();
    if (latencia !== null) {
      if (e.latencia_media === null) {
        e.latencia_media = latencia;
      } else {
        e.latencia_media = e.latencia_media * 0.8 + latencia * 0.2;
      }
    }
    e.peso = Math.min(1.0, Math.max(0.05, e.peso + 0.1));
  } else {
    e.fallos_seguidos += 1;
    e.ultimo_fallo = ahora.toISOString();
    e.peso = Math.max(0.05, e.peso - 0.15);
  }

  await mkdir(path.dirname(estadoPath), { recursive: true });
  const temporal = `${estadoPath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporal, `${JSON.stringify(estado, null, 2)}\n`, "utf-8");
  await rename(temporal, estadoPath);
}
