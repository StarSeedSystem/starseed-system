import { mulberry32, entero, elegir } from "./seeded-rng";

export type PerfilRed = "lan" | "good_wifi" | "bad_wifi" | "mobile_tether" | "transatlantic" | "hell";

export interface Paquete<T> {
  contenido: T;
  id: number;
  origen: number;
  destino: number;
  timestamp: number;
}

export interface ConfigRed {
  latenciaBase: number;
  jitter: number;
  perdida: number;
  duplicados: number;
  reorden: number;
  corrupcion: number;
  anchoBandaKbps: number;
}

export const PERFILES: Record<PerfilRed, ConfigRed> = {
  lan: { latenciaBase: 1, jitter: 0, perdida: 0, duplicados: 0, reorden: 0, corrupcion: 0, anchoBandaKbps: 100000 },
  good_wifi: { latenciaBase: 12, jitter: 2, perdida: 0.005, duplicados: 0.001, reorden: 0.001, corrupcion: 0, anchoBandaKbps: 50000 },
  bad_wifi: { latenciaBase: 35, jitter: 25, perdida: 0.02, duplicados: 0.01, reorden: 0.02, corrupcion: 0.0001, anchoBandaKbps: 10000 },
  mobile_tether: { latenciaBase: 70, jitter: 30, perdida: 0.01, duplicados: 0.005, reorden: 0.01, corrupcion: 0.0001, anchoBandaKbps: 2000 },
  transatlantic: { latenciaBase: 90, jitter: 10, perdida: 0.001, duplicados: 0.0005, reorden: 0.001, corrupcion: 0, anchoBandaKbps: 5000 },
  hell: { latenciaBase: 200, jitter: 150, perdida: 0.08, duplicados: 0.05, reorden: 0.1, corrupcion: 0.001, anchoBandaKbps: 512 },
};

/** Enlace con pérdida, duplicados, reorden y corrupción — determinista por semilla. */
export class LossyLink<T> {
  private rnd: () => number;
  private config: ConfigRed;
  private cola: Array<{ paquete: Paquete<T>; entregaEn: number }> = [];
  private contadorId = 0;
  private estadisticas = { enviados: 0, entregados: 0, perdidos: 0, duplicados: 0, reordenados: 0, corruptos: 0 };

  constructor(perfil: PerfilRed, semilla: number) {
    this.rnd = mulberry32(semilla);
    this.config = PERFILES[perfil];
  }

  /** Envía un paquete; retorna true si entró en la cola (no perdido por congestión). */
  enviar(contenido: T, origen: number, destino: number, ahora: number): boolean {
    this.estadisticas.enviados += 1;

    // Pérdida
    if (this.rnd() < this.config.perdida) {
      this.estadisticas.perdidos += 1;
      return false;
    }

    const latencia = Math.max(1, this.config.latenciaBase + Math.floor(this.rnd() * this.config.jitter * 2) - this.config.jitter);
    const id = this.contadorId++;

    // Duplicado
    const esDuplicado = this.rnd() < this.config.duplicados;
    if (esDuplicado) this.estadisticas.duplicados += 1;

    // Corrupción
    const corrupto = this.rnd() < this.config.corrupcion;
    if (corrupto) this.estadisticas.corruptos += 1;

    const paquete: Paquete<T> = {
      contenido: corrupto ? ({} as T) : contenido,
      id,
      origen,
      destino,
      timestamp: ahora,
    };

    this.cola.push({ paquete, entregaEn: ahora + latencia });

    if (esDuplicado) {
      const latencia2 = Math.max(1, this.config.latenciaBase + Math.floor(this.rnd() * this.config.jitter * 2) - this.config.jitter);
      this.cola.push({ paquete: { ...paquete, id: this.contadorId++ }, entregaEn: ahora + latencia2 });
    }

    return true;
  }

  /** Avanza el tiempo y retorna paquetes listos para entregar (ordenados por timestamp, con posible reorden). */
  tick(ahora: number): Paquete<T>[] {
    const listos = this.cola.filter((p) => p.entregaEn <= ahora);
    this.cola = this.cola.filter((p) => p.entregaEn > ahora);

    // Reordenamiento aleatorio de los listos
    if (this.config.reorden > 0 && listos.length > 1) {
      for (let i = 0; i < listos.length; i += 1) {
        if (this.rnd() < this.config.reorden) {
          const j = entero(this.rnd, 0, listos.length - 1);
          [listos[i], listos[j]] = [listos[j], listos[i]];
          this.estadisticas.reordenados += 1;
        }
      }
    }

    return listos.map((p) => p.paquete);
  }

  getEstadisticas() { return { ...this.estadisticas }; }
  getColaPendiente() { return this.cola.length; }
}