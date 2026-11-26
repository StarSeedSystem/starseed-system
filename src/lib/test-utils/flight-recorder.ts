import { type EstadoSala } from "@/lib/salas/sincronia-sala";

export type EventoRecorder =
  | { tipo: "tick"; nodo: number; timestamp: number; estadoDigest: string }
  | { tipo: "fusion"; nodo: number; timestamp: number; origen: number; conflictos: string[]; estadoDigest: string }
  | { tipo: "accion"; nodo: number; timestamp: number; accion: string }
  | { tipo: "desincronia"; nodo: number; timestamp: number; detalle: string };

export interface Vuelo {
  nodo: number;
  eventos: EventoRecorder[];
  capacidad: number;
}

export class FlightRecorder {
  private vuelos: Map<number, Vuelo> = new Map();
  private capacidad: number;

  constructor(capacidad: number = 10000) {
    this.capacidad = capacidad;
  }

  registrar(nodo: number, evento: EventoRecorder): void {
    let vuelo = this.vuelos.get(nodo);
    if (!vuelo) {
      vuelo = { nodo, eventos: [], capacidad: this.capacidad };
      this.vuelos.set(nodo, vuelo);
    }
    vuelo.eventos.push(evento);
    // Anillo: si excede capacidad, quita los más antiguos
    if (vuelo.eventos.length > vuelo.capacidad) {
      const exceso = vuelo.eventos.length - vuelo.capacidad;
      vuelo.eventos = vuelo.eventos.slice(exceso);
    }
  }

  getVuelo(nodo: number): Vuelo | undefined {
    return this.vuelos.get(nodo);
  }

  getTodosVuelos(): Vuelo[] {
    return Array.from(this.vuelos.values());
  }

  /** Vuelca todos los vuelos a JSON. */
  volcar(): string {
    return JSON.stringify(Array.from(this.vuelos.entries()), null, 2);
  }

  /** Encuentra la primera divergencia entre vuelos. */
  encontrarPrimeraDivergencia(): { timestamp: number; nodoMinoria: number; clave: string; valorMayoria: string; valorMinoria: string; cadenaCausal: EventoRecorder[] } | null {
    const vuelos = this.getTodosVuelos();
    if (vuelos.length < 2) return null;

    // Busca eventos de desincronía registrados
    for (const vuelo of vuelos) {
      for (const evento of vuelo.eventos) {
        if (evento.tipo === "desincronia") {
          // Intenta extraer clave/valor del detalle
          const match = evento.detalle.match(/clave:\s*(\S+)\s+mayoria:\s*(\S+)\s+minoria:\s*(\S+)/);
          if (match) {
            return {
              timestamp: evento.timestamp,
              nodoMinoria: vuelo.nodo,
              clave: match[1],
              valorMayoria: match[2],
              valorMinoria: match[3],
              cadenaCausal: this.cadenaCausal(vuelo, evento.timestamp),
            };
          }
        }
      }
    }
    return null;
  }

  private cadenaCausal(vuelo: Vuelo, hasta: number, ventana: number = 500): EventoRecorder[] {
    return vuelo.eventos
      .filter((e) => e.timestamp >= hasta - ventana && e.timestamp <= hasta)
      .slice(-50);
  }

  limpiar(): void {
    this.vuelos.clear();
  }
}

/** Fixture de regresión para delta-debug shrink. */
export interface FixtureRegresion {
  nombre: string;
  semilla: number;
  perfil: string;
  pasos: Array<{ nodo: number; accion: string; timestamp: number }>;
  expectaConvergencia: boolean;
  expectaConflictos: string[];
}

/** Convierte un vuelo a fixture. */
export function vueloAFixture(vuelo: Vuelo, nombre: string, semilla: number, perfil: string): FixtureRegresion {
  return {
    nombre,
    semilla,
    perfil,
    pasos: vuelo.eventos
      .filter((e) => e.tipo === "accion" || e.tipo === "fusion")
      .map((e) => ({ nodo: e.nodo, accion: e.tipo === "accion" ? e.accion : `fusion:${(e as any).conflictos.join(",")}`, timestamp: e.timestamp })),
    expectaConvergencia: true,
    expectaConflictos: [],
  };
}

/** Shrink delta-debug: quita chunks y mantiene solo si sigue fallando igual. */
export function shrinkDeltaDebug(
  fixture: FixtureRegresion,
  replayFn: (pasos: FixtureRegresion["pasos"]) => { converge: boolean; conflictos: string[] },
  maxIteraciones: number = 100
): FixtureRegresion {
  let actual = { ...fixture, pasos: [...fixture.pasos] };
  let tamanoChunk = Math.max(1, Math.floor(actual.pasos.length / 2));

  for (let iter = 0; iter < maxIteraciones && actual.pasos.length > 1; iter += 1) {
    let reducido = false;
    for (let inicio = 0; inicio < actual.pasos.length; inicio += tamanoChunk) {
      const fin = Math.min(inicio + tamanoChunk, actual.pasos.length);
      const candidato = actual.pasos.slice(0, inicio).concat(actual.pasos.slice(fin));
      const resultado = replayFn(candidato);
      if (resultado.converge === fixture.expectaConvergencia && JSON.stringify(resultado.conflictos.sort()) === JSON.stringify(fixture.expectaConflictos.sort())) {
        actual.pasos = candidato;
        reducido = true;
        break;
      }
    }
    if (!reducido) {
      tamanoChunk = Math.max(1, Math.floor(tamanoChunk / 2));
    }
  }
  return actual;
}