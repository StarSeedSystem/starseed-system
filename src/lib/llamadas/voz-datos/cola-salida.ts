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
}

export class ColaSalidaVoz {
  private readonly items: TramaSalida[] = [];
  private tiradas = 0;
  private encoladas = 0;

  constructor(private readonly opc: { maxMs?: number; msTrama?: number } = {}) {}

  private get maxTramas(): number {
    return Math.max(1, Math.floor((this.opc.maxMs ?? 240) / (this.opc.msTrama ?? 20)));
  }

  /** Mete una trama; devuelve cuántas viejas se tiraron para que quepa. */
  encolar(t: TramaSalida): number {
    this.items.push(t);
    this.encoladas++;
    let tiradas = 0;
    while (this.items.length > this.maxTramas) {
      this.items.shift();
      tiradas++;
    }
    this.tiradas += tiradas;
    return tiradas;
  }

  /** Saca hasta `n` tramas (las más viejas primero). */
  sacar(n: number): TramaSalida[] {
    return this.items.splice(0, Math.max(0, n));
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
