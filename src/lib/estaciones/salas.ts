/*
 * ═════════════════════════════════════════════════════════════════════════════
 * StarSeed OS · Salas de estaciones (Ola ???) — lógica pura de relay de estaciones
 * ---------------------------------------------------------------------------
 * Módulo PURO: sin red, sin disco, sin node:*. Sólo decide y explica.
 * ═════════════════════════════════════════════════════════════════════════════
 */

export interface SalaConfig {
  maxSalas?: number;
  maxPorSala?: number;
  maxBytes?: number;
}

export interface Conexion {
  // Esto es solo un marcador, el contenido real no importa para la lógica pura
}

export interface ResultadoEntrada {
  ok: boolean;
  motivo?: string;
}

export class Salas {
  private salas: Map<string, Set<Conexion>>;
  private conexiones: Map<Conexion, string>;
  private maxSalas: number;
  private maxPorSala: number;
  private maxBytes: number;

  constructor(config: SalaConfig = {}) {
    this.salas = new Map();
    this.conexiones = new Map();
    this.maxSalas = config.maxSalas ?? 100;
    this.maxPorSala = config.maxPorSala ?? 100;
    this.maxBytes = config.maxBytes ?? 1000;
  }

  entrar(tema: string, conexion: Conexion): ResultadoEntrada {
    // Validar formato del tema
    if (!this.esTemaValido(tema)) {
      return { ok: false, motivo: 'Tema inválido' };
    }

    // Verificar si la conexión ya está en una sala
    if (this.conexiones.has(conexion)) {
      return { ok: false, motivo: 'Conexión ya está en una sala' };
    }

    // Obtener o crear la sala
    let sala = this.salas.get(tema);
    if (!sala) {
      // Verificar límite de salas
      if (this.salas.size >= this.maxSalas) {
        return { ok: false, motivo: 'Límite de salas alcanzado' };
      }
      sala = new Set();
      this.salas.set(tema, sala);
    }

    // Verificar límite de conexiones por sala
    if (sala.size >= this.maxPorSala) {
      return { ok: false, motivo: 'Límite de conexiones por sala alcanzado' };
    }

    // Añadir conexión a la sala
    sala.add(conexion);
    this.conexiones.set(conexion, tema);

    return { ok: true };
  }

  salir(conexion: Conexion): void {
    const tema = this.conexiones.get(conexion);
    if (tema) {
      const sala = this.salas.get(tema);
      if (sala) {
        sala.delete(conexion);
        // Eliminar la sala si queda vacía
        if (sala.size === 0) {
          this.salas.delete(tema);
        }
      }
      this.conexiones.delete(conexion);
    }
  }

  presencia(tema: string): number {
    const sala = this.salas.get(tema);
    return sala ? sala.size : 0;
  }

  temaDe(conexion: Conexion): string | undefined {
    return this.conexiones.get(conexion);
  }

  difundir(emisor: Conexion, texto: unknown): Conexion[] {
    // Verificar que el emisor esté en una sala
    const tema = this.conexiones.get(emisor);
    if (!tema) {
      return [];
    }

    const sala = this.salas.get(tema);
    if (!sala) {
      return [];
    }

    // Validar el texto
    if (typeof texto !== 'string') {
      return [];
    }

    if (texto.length > this.maxBytes) {
      return [];
    }

    if (!texto.startsWith('{"t":"est"')) {
      return [];
    }

    // Devolver todas las conexiones en la sala excepto el emisor
    const destinatarios: Conexion[] = [];
    for (const conexion of sala) {
      if (conexion !== emisor) {
        destinatarios.push(conexion);
      }
    }

    return destinatarios;
  }

  private esTemaValido(tema: string): boolean {
    // El tema debe empezar con "estacion-vivo:" o "estacion-p:" seguido de al menos 8 caracteres alfanuméricos
    const prefijoVivo = 'estacion-vivo:';
    const prefijoP = 'estacion-p:';
    
    if (tema.startsWith(prefijoVivo)) {
      const resto = tema.substring(prefijoVivo.length);
      return /^[A-Z0-9]{8,}$/i.test(resto); // 'i' para insensible a mayúsculas/minúsculas
    }
    
    if (tema.startsWith(prefijoP)) {
      const resto = tema.substring(prefijoP.length);
      return /^[A-Z0-9]{8,}$/i.test(resto); // 'i' para insensible a mayúsculas/minúsculas
    }
    
    return false;
  }
}

/**
 * Crea una instancia de Salas con la configuración especificada.
 * @param config Configuración opcional para los límites
 * @returns Instancia de Salas
 */
export function crearSalas(config: SalaConfig = {}): Salas {
  return new Salas(config);
}