import { mulberry32, entero, elegir } from "./seeded-rng";
import { LossyLink, PerfilRed } from "./fake-network";
import { fusionarEstados, type EstadoSala, type ElementoSala } from "@/lib/salas/sincronia-sala";

export type { PerfilRed };

export type Accion =
  | { tipo: "editar"; id: string; tipoElem: string; datos: Record<string, unknown>; dispositivo: string }
  | { tipo: "borrar"; id: string; dispositivo: string }
  | { tipo: "crear"; id: string; tipoElem: string; datos: Record<string, unknown>; dispositivo: string }
  | { tipo: "esperar"; ms: number };

export interface PasoEscenario {
  accion: Accion;
  nodo: number;
}

export interface NodoSimulado {
  id: number;
  dispositivo: string;
  estado: EstadoSala;
  enlace: LossyLink<EstadoSala>;
  accionesPendientes: Accion[];
  reloj: number;
}

export class FakeCluster {
  public nodos: NodoSimulado[] = [];
  public relojGlobal = 0;
  private rnd: () => number;
  private perfil: PerfilRed;
  private siguienteIdElemento = 0;

  constructor(
    cantidadNodos: number,
    perfil: PerfilRed = "bad_wifi",
    semilla: number = 1025,
    salaId = "sala-test"
  ) {
    this.rnd = mulberry32(semilla);
    this.perfil = perfil;

    for (let i = 0; i < cantidadNodos; i += 1) {
      const dispositivo = `nodo-${i}-${this.rnd().toString(36).slice(2, 8)}`;
      this.nodos.push({
        id: i,
        dispositivo,
        estado: { salaId, elementos: {}, reloj: 0 },
        enlace: new LossyLink<EstadoSala>(perfil, semilla + i * 1000),
        accionesPendientes: [],
        reloj: 0,
      });
    }
  }

  /** Añade una acción a la cola de un nodo. */
  encolarAccion(nodoIdx: number, accion: Accion): void {
    this.nodos[nodoIdx].accionesPendientes.push(accion);
  }

  /** Ejecuta un tick: procesa acciones, envía estado, recibe y fusiona. */
  tick(ms: number = 10): void {
    this.relojGlobal += ms;

    // 1. Cada nodo procesa sus acciones locales
    for (const nodo of this.nodos) {
      nodo.reloj = this.relojGlobal;
      while (nodo.accionesPendientes.length > 0) {
        const accion = nodo.accionesPendientes.shift()!;
        this.aplicarAccionLocal(nodo, accion);
      }
    }

    // 2. Cada nodo publica su estado a TODOS los demás nodos (mesh completo)
    // Cada enlace simula la red entre ese nodo y los demás
    for (const emisor of this.nodos) {
      for (const receptor of this.nodos) {
        if (emisor.id === receptor.id) continue;
        // El emisor envía a través del enlace del receptor (simula red hacia el receptor)
        receptor.enlace.enviar(emisor.estado, emisor.id, receptor.id, this.relojGlobal);
      }
    }

    // 3. Cada nodo recibe y fusiona lo que le llega
    for (const nodo of this.nodos) {
      const recibidos = nodo.enlace.tick(this.relojGlobal);
      for (const paquete of recibidos) {
        const { resultado } = fusionarEstados(nodo.estado, paquete.contenido, nodo.dispositivo);
        nodo.estado = resultado;
      }
    }
  }

  /** Avanza hasta que todos los nodos convergen (mismo digest) o timeout. */
  async quiesce(maxMs: number = 5000, intervaloMs: number = 10): Promise<boolean> {
    const inicio = this.relojGlobal;
    while (this.relojGlobal - inicio < maxMs) {
      this.tick(intervaloMs);
      if (this.convergen()) return true;
    }
    return false;
  }

  /** Verifica si todos los nodos tienen el mismo estado (convergencia). */
  convergen(): boolean {
    if (this.nodos.length < 2) return true;
    const base = this.digest(this.nodos[0].estado);
    return this.nodos.every((n) => this.digest(n.estado) === base);
  }

  /** Digest simple del estado para comparar. */
  digest(estado: EstadoSala): string {
    const claves = Object.keys(estado.elementos).sort();
    return claves
      .map((k) => {
        const e = estado.elementos[k];
        return `${k}:${e.actualizadoEn}:${e.porDispositivo}:${e.borrado ? 1 : 0}`;
      })
      .join("|");
  }

  /** Obtiene el estado de un nodo. */
  getEstado(nodoIdx: number): EstadoSala {
    return this.nodos[nodoIdx].estado;
  }

  /** Crea un elemento nuevo con ID único. */
  crearId(): string {
    return `elem-${this.siguienteIdElemento++}-${this.rnd().toString(36).slice(2, 6)}`;
  }

  /** Aplica una acción local al estado del nodo. */
  private aplicarAccionLocal(nodo: NodoSimulado, accion: Accion): void {
    const ahora = this.relojGlobal;
    switch (accion.tipo) {
      case "crear": {
        const elem: ElementoSala = {
          id: accion.id,
          tipo: accion.tipoElem,
          datos: accion.datos,
          actualizadoEn: ahora,
          porDispositivo: nodo.dispositivo,
        };
        nodo.estado = { ...nodo.estado, elementos: { ...nodo.estado.elementos, [accion.id]: elem } };
        break;
      }
      case "editar": {
        const actual = nodo.estado.elementos[accion.id];
        if (actual) {
          const editado: ElementoSala = {
            ...actual,
            datos: accion.datos,
            actualizadoEn: ahora,
            porDispositivo: nodo.dispositivo,
          };
          nodo.estado = { ...nodo.estado, elementos: { ...nodo.estado.elementos, [accion.id]: editado } };
        }
        break;
      }
      case "borrar": {
        const actual = nodo.estado.elementos[accion.id];
        if (actual) {
          const borrado: ElementoSala = { ...actual, borrado: true, actualizadoEn: ahora, porDispositivo: nodo.dispositivo };
          nodo.estado = { ...nodo.estado, elementos: { ...nodo.estado.elementos, [accion.id]: borrado } };
        }
        break;
      }
      case "esperar":
        // Solo avanza el reloj en el tick principal
        break;
    }
  }

  /** Genera un escenario aleatorio de acciones co-op. */
  generarEscenarioAleatorio(pasos: number): PasoEscenario[] {
    const tipos = ["nota", "posicion", "trazo", "cursor", "widget"] as const;
    const dispositivos = this.nodos.map((n) => n.dispositivo);
    const escenario: PasoEscenario[] = [];

    for (let i = 0; i < pasos; i += 1) {
      const nodo = entero(this.rnd, 0, this.nodos.length - 1);
      const tipoAccion = elegir(this.rnd, ["crear", "editar", "borrar", "esperar"] as const);

      let accion: Accion;
      if (tipoAccion === "crear") {
        const id = this.crearId();
        accion = { tipo: "crear", id, tipoElem: elegir(this.rnd, tipos), datos: { v: this.rnd() }, dispositivo: dispositivos[nodo] };
      } else if (tipoAccion === "editar") {
        const ids = Object.keys(this.nodos[nodo].estado.elementos);
        if (ids.length === 0) {
          accion = { tipo: "esperar", ms: 10 };
        } else {
          const id = elegir(this.rnd, ids);
          accion = { tipo: "editar", id, tipoElem: "nota", datos: { v: this.rnd() }, dispositivo: dispositivos[nodo] };
        }
      } else if (tipoAccion === "borrar") {
        const ids = Object.keys(this.nodos[nodo].estado.elementos).filter((id) => !this.nodos[nodo].estado.elementos[id].borrado);
        if (ids.length === 0) {
          accion = { tipo: "esperar", ms: 10 };
        } else {
          const id = elegir(this.rnd, ids);
          accion = { tipo: "borrar", id, dispositivo: dispositivos[nodo] };
        }
      } else {
        accion = { tipo: "esperar", ms: entero(this.rnd, 10, 100) };
      }
      escenario.push({ accion, nodo });
    }
    return escenario;
  }

  /** Ejecuta un escenario completo. */
  async ejecutarEscenario(escenario: PasoEscenario[]): Promise<void> {
    for (const paso of escenario) {
      this.encolarAccion(paso.nodo, paso.accion);
      this.tick(10);
    }
    await this.quiesce();
  }
}

/** Playbooks de bots co-op (acciones guionadas). */
export const PLAYBOOKS = {
  /** Dos bots editan lo mismo a la vez. */
  carreraEdicion: (cluster: FakeCluster, id: string) => [
    { accion: { tipo: "editar" as const, id, tipoElem: "nota", datos: { texto: "ana" }, dispositivo: cluster.nodos[0].dispositivo }, nodo: 0 },
    { accion: { tipo: "editar" as const, id, tipoElem: "nota", datos: { texto: "bruno" }, dispositivo: cluster.nodos[1].dispositivo }, nodo: 1 },
  ],

  /** Uno crea, otro borra, tercer edita — prueba lápidas. */
  crearBorrarEditar: (cluster: FakeCluster, id: string) => [
    { accion: { tipo: "crear" as const, id, tipoElem: "nota", datos: { texto: "original" }, dispositivo: cluster.nodos[0].dispositivo }, nodo: 0 },
    { accion: { tipo: "borrar" as const, id, dispositivo: cluster.nodos[1].dispositivo }, nodo: 1 },
    { accion: { tipo: "editar" as const, id, tipoElem: "nota", datos: { texto: "resucitado" }, dispositivo: cluster.nodos[2].dispositivo }, nodo: 2 },
  ],

  /** Un nodo se va y vuelve (simula desconexión). */
  irseYVolver: (cluster: FakeCluster, id: string) => [
    { accion: { tipo: "editar" as const, id, tipoElem: "nota", datos: { texto: "antes" }, dispositivo: cluster.nodos[0].dispositivo }, nodo: 0 },
    // Nodo 1 se desconecta (no recibe)
    { accion: { tipo: "editar" as const, id, tipoElem: "nota", datos: { texto: "durante" }, dispositivo: cluster.nodos[0].dispositivo }, nodo: 0 },
    // Nodo 1 se reconecta y fusiona
    { accion: { tipo: "esperar" as const, ms: 100 }, nodo: 1 },
  ],
};