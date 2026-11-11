/**
 * voz-datos/jitter — búfer de fluctuación adaptativo con ocultación de pérdidas (LLA1108E).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Puro y sin reloj propio: quien reproduce llama a `sacar()` cada `msTrama` y empuja lo que salga a
 * su worklet. Reordena por número de trama, descarta duplicados y tardías, tapa huecos repitiendo la
 * última trama con fundido (no hay silencios secos ni zumbidos) y adapta el retardo objetivo entre
 * 60 y 200 ms: sube 20 ms con cada vaciado del búfer y baja 10 ms tras 5 s estables.
 * Si el búfer acumula más de `maxMs` por delante, se salta lo más viejo: el retardo nunca crece sin tope.
 */
import { aFloat32 } from "./codec";

export interface OpcionesJitter {
  minMs?: number;
  maxMs?: number;
  msTrama?: number;
}

export interface SalidaJitter {
  pcm: Int16Array;
  /** true si es una trama inventada (repetición con fundido) porque la real no llegó. */
  oculta: boolean;
}

export interface EstadisticasJitter {
  objetivoMs: number;
  ocupadoMs: number;
  recibidas: number;
  perdidas: number;
  tardias: number;
  duplicadas: number;
  reordenadas: number;
  vaciados: number;
  saltadas: number;
  ocultadas: number;
}

export class BufferJitter {
  private readonly minMs: number;
  private readonly maxMs: number;
  private readonly msTrama: number;
  private objetivoMs: number;
  private readonly almacen = new Map<number, Int16Array>();
  private siguiente: number | null = null;
  private maximo = -1;
  private iniciado = false;
  private ultima: Int16Array | null = null;
  private racha = 0;
  private estables = 0;
  private s = { recibidas: 0, perdidas: 0, tardias: 0, duplicadas: 0, reordenadas: 0, vaciados: 0, saltadas: 0, ocultadas: 0 };

  constructor(o: OpcionesJitter = {}) {
    this.minMs = o.minMs ?? 60;
    this.maxMs = o.maxMs ?? 200;
    this.msTrama = o.msTrama ?? 20;
    this.objetivoMs = this.minMs;
  }

  /**
   * (VOZ1111J) Suelo del retardo objetivo: con paquetes de 120–180 ms el audio llega a golpes de ese tamaño y empezar en
   * 60 ms suponía un vaciado (un hueco audible) por cada 20 ms que faltaban hasta acomodarse.
   */
  fijarMinimo(ms: number): void {
    const m = Math.max(this.minMs, Math.min(this.maxMs, Math.round(ms)));
    this.minimoDinamico = m;
    if (this.objetivoMs < m) this.objetivoMs = m;
  }

  private minimoDinamico = 0;

  /** (VOZ1111J) ¿Ya pasó su turno esa trama (o está guardada)? Para no decodificar redundancia que no sirve. */
  yaNoHaceFalta(q: number): boolean {
    return this.almacen.has(q) || (this.iniciado && this.siguiente !== null && q < this.siguiente);
  }

  /** Mete una trama ya decodificada con su número. */
  meter(q: number, pcm: Int16Array): void {
    this.s.recibidas++;
    if (this.siguiente !== null && this.iniciado && q < this.siguiente) {
      this.s.tardias++;
      return;
    }
    if (this.almacen.has(q)) {
      this.s.duplicadas++;
      return;
    }
    if (q < this.maximo) this.s.reordenadas++;
    this.almacen.set(q, pcm);
    if (q > this.maximo) this.maximo = q;
    if (this.siguiente === null || (!this.iniciado && q < this.siguiente)) this.siguiente = q;
    // Tope de retardo: lo que sobra por delante se salta (lo más viejo).
    if (this.iniciado && this.siguiente !== null) {
      const maxTramas = Math.ceil(this.maxMs / this.msTrama);
      while (this.maximo - this.siguiente + 1 > maxTramas) {
        this.almacen.delete(this.siguiente);
        this.siguiente++;
        this.s.saltadas++;
      }
    }
  }

  private ocupado(): number {
    return this.siguiente === null || this.maximo < this.siguiente ? 0 : (this.maximo - this.siguiente + 1) * this.msTrama;
  }

  private ocultar(): SalidaJitter | null {
    if (!this.ultima) return null;
    this.racha++;
    const ganancia = Math.max(0, 1 - 0.34 * this.racha);
    this.s.ocultadas++;
    if (ganancia <= 0) return { pcm: new Int16Array(this.ultima.length), oculta: true };
    const o = new Int16Array(this.ultima.length);
    for (let i = 0; i < o.length; i++) o[i] = Math.round(this.ultima[i] * ganancia);
    return { pcm: o, oculta: true };
  }

  /** La siguiente trama que toca reproducir (null: aún se está llenando el búfer, silencio). */
  sacar(): SalidaJitter | null {
    if (!this.iniciado) {
      if (this.ocupado() < this.objetivoMs) return null;
      this.iniciado = true;
      // Tras un vaciado largo, se retoma desde lo más viejo que queda (lo que falta se cuenta perdido).
      if (this.almacen.size) {
        const menor = Math.min(...this.almacen.keys());
        if (this.siguiente !== null && menor > this.siguiente) this.s.perdidas += menor - this.siguiente;
        this.siguiente = menor;
      }
    }
    if (this.siguiente === null) return null;
    const trama = this.almacen.get(this.siguiente);
    if (trama) {
      this.almacen.delete(this.siguiente);
      this.siguiente++;
      this.ultima = trama;
      this.racha = 0;
      this.estables++;
      // 5 s estables a 20 ms/trama = 250 tramas: se baja el objetivo 10 ms.
      if (this.estables >= 5000 / this.msTrama) {
        this.estables = 0;
        this.objetivoMs = Math.max(this.minMs, this.minimoDinamico, this.objetivoMs - 10);
      }
      return { pcm: trama, oculta: false };
    }
    this.estables = 0;
    if (this.almacen.size === 0) {
      // Vaciado: se vuelve a llenar y el objetivo sube.
      this.iniciado = false;
      this.s.vaciados++;
      this.objetivoMs = Math.min(this.maxMs, this.objetivoMs + 20);
      return this.ocultar();
    }
    // Hay tramas por delante pero esta no llegó: perdida (o tardará más de lo que se espera).
    this.s.perdidas++;
    this.siguiente++;
    return this.ocultar();
  }

  /** Porcentaje de pérdida visto hasta ahora (de las que tocaba reproducir). */
  perdidaPct(): number {
    const total = this.s.recibidas + this.s.perdidas;
    return total === 0 ? 0 : Math.round((this.s.perdidas / total) * 1000) / 10;
  }

  estadisticas(): EstadisticasJitter {
    return { objetivoMs: this.objetivoMs, ocupadoMs: this.ocupado(), ...this.s };
  }

  reiniciar(): void {
    this.almacen.clear();
    this.siguiente = null;
    this.maximo = -1;
    this.iniciado = false;
    this.ultima = null;
    this.racha = 0;
    this.estables = 0;
    this.objetivoMs = Math.max(this.minMs, this.minimoDinamico);
  }
}

/** Para pintar un medidor de nivel sin tocar el audio. */
export function nivelDe(pcm: Int16Array): number {
  if (!pcm.length) return 0;
  const f = aFloat32(pcm);
  let s = 0;
  for (let i = 0; i < f.length; i++) s += f[i] * f[i];
  return Math.sqrt(s / f.length);
}
