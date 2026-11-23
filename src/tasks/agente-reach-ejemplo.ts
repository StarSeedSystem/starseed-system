import { execSync } from "node:child_process";

export interface ItemReach {
  ok: boolean;
  items?: Array<{
    title: string;
    url: string;
    author: string;
    published_at: string;
    text: string;
    raw: Record<string, unknown>;
  }>;
  error?: { code: string; message: string; retry_after_seconds?: number };
}

export interface ResultadoExtraccion {
  canal: string;
  extraccion: string[];
  fuentes: string[];
  error?: string;
}

export function ejecutarAgenteReach(canales: string[]): ResultadoExtraccion[] {
  return canales.map((canal) => {
    try {
      const salida = execSync(`agent-reach ${canal} hot --limit 2 2>/dev/null`, {
        encoding: "utf-8",
        timeout: 30000,
      });
      const datos = JSON.parse(salida) as ItemReach;
      if (!datos.ok || !datos.items) {
        return {
          canal,
          extraccion: [],
          fuentes: [],
          error: datos.error?.message || "Sin resultados",
        };
      }
      return {
        canal,
        extraccion: datos.items.map((i) => i.title),
        fuentes: datos.items.map((i) => i.url),
      };
    } catch (e) {
      return {
        canal,
        extraccion: [],
        fuentes: [],
        error: e instanceof Error ? e.message : "Error desconocido",
      };
    }
  });
}

export function contieneUrl_valida(texto: string): boolean {
  const urlRegex = /^https?:\/\/[^\s]+$/i;
  return urlRegex.test(texto.trim());
}