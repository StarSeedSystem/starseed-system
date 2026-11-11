/**
 * voz-datos/cola-salida — la cola de salida de la voz, con contrapresión (LLA1108E).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Puro. La voz que llega tarde no sirve: si el enlace (Bluetooth) no da abasto, se tira lo MÁS VIEJO en
 * vez de acumular segundos de retraso. El tope es de `maxMs` de audio en cola (por defecto 240 ms).
 * Además, `ocupado` del transporte pausa la salida: las tramas se quedan aquí y, si la espera se alarga,
 * las viejas caen. Así la voz nunca llena la cola del enlace y no le quita sitio al chat ni a los archivos.
 */

export interface TramaSalida {
  q: number;
  ts: number;
  bytes: Uint8Array;
  /** (VOZ1111J) Unidades de 20 ms que dura (Opus de 40/60 ms: 2/3). Por defecto 1. */
  n?: number;
  /** (VOZ1111J) Silencio declarado (DTX): no lleva audio, solo dice «aquí no hay voz». */
  silencio?: boolean;
}

/** (VOZ1111J) Unidades de 20 ms de una trama. */
export function unidadesDe(t: Pick<TramaSalida, "n">): number {
  return Math.max(1, t.n ?? 1);
}

export class ColaSalidaVoz {
  private readonly items: TramaSalida[] = [];
  private tiradas = 0;
  private encoladas = 0;

  private unidades = 0;

  constructor(private readonly opc: { maxMs?: number; msTrama?: number } = {}) {}

  private get maxUnidades(): number {
    return Math.max(1, Math.floor((this.opc.maxMs ?? 240) / (this.opc.msTrama ?? 20)));
  }

  /** (VOZ1111J) El tope sigue al tamaño del paquete: con paquetes de 180 ms caben al menos dos. */
  fijarMaxMs(ms: number): void {
    this.opc.maxMs = Math.max(this.opc.msTrama ?? 20, ms);
  }

  /** Mete una trama; devuelve cuántas viejas se tiraron para que quepa (por audio en cola, no por número). */
  encolar(t: TramaSalida): number {
    this.items.push(t);
    this.unidades += unidadesDe(t);
    this.encoladas++;
    let tiradas = 0;
    while (this.unidades > this.maxUnidades && this.items.length > 1) {
      const v = this.items.shift()!;
      this.unidades -= unidadesDe(v);
      if (!v.silencio) tiradas++;
    }
    this.tiradas += tiradas;
    return tiradas;
  }

  /** (VOZ1111J) Unidades de 20 ms en cola. */
  get unidadesEnCola(): number {
    return this.unidades;
  }

  /** (VOZ1111J) Lo que hay en cola, sin sacarlo. */
  mirar(): readonly TramaSalida[] {
    return this.items;
  }

  /** Saca hasta `n` tramas (las más viejas primero). */
  sacar(n: number): TramaSalida[] {
    const fuera = this.items.splice(0, Math.max(0, n));
    for (const t of fuera) this.unidades -= unidadesDe(t);
    return fuera;
  }

  get longitud(): number {
    return this.items.length;
  }

  get descartadas(): number {
    return this.tiradas;
  }

  get total(): number {
    return this.encoladas;
  }

  vaciar(): void {
    this.items.length = 0;
    this.unidades = 0;
  }
}

/** Agrupa tramas en carreras de números consecutivos (cada carrera = un paquete). */
export function agruparConsecutivas(tramas: readonly TramaSalida[], max = 8): TramaSalida[][] {
  const grupos: TramaSalida[][] = [];
  for (const t of tramas) {
    const g = grupos[grupos.length - 1];
    if (g && g.length < max && g[g.length - 1].q + 1 === t.q) g.push(t);
    else grupos.push([t]);
  }
  return grupos;
}
