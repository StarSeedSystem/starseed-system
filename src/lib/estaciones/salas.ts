/*
 * StarSeed OS · Salas de estaciones — lógica pura de relay de estaciones.
 * Módulo puro: sin red, sin disco, sin node:*. Solo decide y explica.
 */

export interface SalaConfig {
  maxSalas?: number;
  maxPorSala?: number;
  maxBytes?: number;
}

export type Conexion = object;

export interface ResultadoEntrada {
  ok: boolean;
  motivo?: string;
}

export class Salas {
  private salas = new Map<string, Set<Conexion>>();
  private conexiones = new Map<Conexion, string>();
  private maxSalas: number;
  private maxPorSala: number;
  private maxBytes: number;

  constructor(config: SalaConfig = {}) {
    this.maxSalas = config.maxSalas ?? 100;
    this.maxPorSala = config.maxPorSala ?? 100;
    this.maxBytes = config.maxBytes ?? 1000;
  }

  entrar(tema: string, conexion: Conexion): ResultadoEntrada {
    if (!esTemaValido(tema)) {
      return { ok: false, motivo: "Tema inválido" };
    }
    if (this.conexiones.has(conexion)) {
      return { ok: false, motivo: "Conexión ya está en una sala" };
    }
    let sala = this.salas.get(tema);
    if (!sala) {
      if (this.salas.size >= this.maxSalas) {
        return { ok: false, motivo: "Límite de salas alcanzado" };
      }
      sala = new Set();
      this.salas.set(tema, sala);
    }
    if (sala.size >= this.maxPorSala) {
      return { ok: false, motivo: "Límite de conexiones por sala alcanzado" };
    }
    sala.add(conexion);
    this.conexiones.set(conexion, tema);
    return { ok: true };
  }

  salir(conexion: Conexion): void {
    const tema = this.conexiones.get(conexion);
    if (!tema) return;
    const sala = this.salas.get(tema);
    if (sala && sala.delete(conexion) && sala.size === 0) {
      this.salas.delete(tema);
    }
    this.conexiones.delete(conexion);
  }

  presencia(tema: string): number {
    return this.salas.get(tema)?.size ?? 0;
  }

  temaDe(conexion: Conexion): string | undefined {
    return this.conexiones.get(conexion);
  }

  difundir(emisor: Conexion, texto: unknown): Conexion[] {
    const tema = this.conexiones.get(emisor);
    if (!tema) return [];
    const sala = this.salas.get(tema);
    if (!sala) return [];
    if (typeof texto !== "string") return [];
    if (texto.length > this.maxBytes) return [];
    if (!texto.startsWith('{"t":"est"')) return [];
    const destinatarios: Conexion[] = [];
    for (const c of sala) {
      if (c !== emisor) destinatarios.push(c);
    }
    return destinatarios;
  }
}

export function crearSalas(config: SalaConfig = {}): Salas {
  return new Salas(config);
}

export function esTemaValido(tema: string): boolean {
  const prefiji = ["estacion-vivo:", "estacion-p:"];
  for (const p of prefiji) {
    if (tema.startsWith(p)) {
      const resto = tema.substring(p.length);
      return /^[A-Z0-9]{8,}$/i.test(resto);
    }
  }
  return false;
}
