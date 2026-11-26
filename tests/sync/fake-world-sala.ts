import { SeededRNG } from "./seeded-rng";

export interface SalaState {
  jugadores: Map<string, Jugador>;
  objetos: Map<string, ObjetoSala>;
  ownership: Map<string, OwnershipInfo>;
  sequence: number;
}

export interface Jugador {
  id: string;
  slot: number;
  posicion: { x: number; y: number };
  inventario: string[];
}

export interface ObjetoSala {
  id: string;
  tipo: "cofre" | "puerta" | "item" | "npc";
  posicion: { x: number; y: number };
  estado: Record<string, unknown>;
}

export interface OwnershipInfo {
  actorId: string;
  ownerSlot: number;
  epoch: number;
  reclutador?: number;
}

export interface NetworkMessage {
  from: number;
  to: number;
  tipo: "accion" | "estado" | "ownership" | "sync";
  payload: unknown;
  seq: number;
  epoch: number;
}

type MutationTwin = "dupApply" | "staleEpoch" | "doubleOwner" | "noDedupe" | "noEpochBump" | "noFlap" | "handoffNoWait" | "staleAccept";

interface LossProfile {
  lossRate: number;
  dupRate: number;
  burstLoss?: number;
  reorder?: number;
  corruption?: number;
}

const LOSS_PROFILES: Record<string, LossProfile> = {
  lan: { lossRate: 0.001, dupRate: 0.0001 },
  good_wifi: { lossRate: 0.005, dupRate: 0.001 },
  bad_wifi: { lossRate: 0.02, dupRate: 0.005, burstLoss: 0.1 },
  hell: { lossRate: 0.08, dupRate: 0.05, reorder: 0.1, corruption: 0.001 },
};

export class SalaFakeWorld {
  private rng: SeededRNG;
  private virtualTime = 0;
  private network: NetworkMessage[] = [];
  private lossProfile: LossProfile;
  private appliedMessages = new Set<string>();
  private mutationTwins = new Set<MutationTwin>();
  public converged = false;
  public doubleApplies = 0;
  public staleApplies = 0;
  public ownershipTransfers = 0;
  public lootRaces = 0;
  public spawnRaces = 0;
  public hostLoads = 0;
  public staleReplays = 0;
  public rejectedDupes = 0;

  constructor(
    public readonly state: SalaState,
    private readonly players: number,
    profile: keyof typeof LOSS_PROFILES = "bad_wifi",
    seed = 42
  ) {
    this.rng = new SeededRNG(seed);
    this.lossProfile = LOSS_PROFILES[profile];
  }

  enableMutationTwin(twin: MutationTwin): void {
    this.mutationTwins.add(twin);
  }

  tick(ms: number): void {
    this.virtualTime += ms;
    this.processNetwork();
    this.updateOwnership();
  }

  private processNetwork(): void {
    const delivered: NetworkMessage[] = [];
    for (const msg of this.network) {
      if (this.rng.next() < this.lossProfile.lossRate) continue;
      if (this.lossProfile.burstLoss && this.rng.next() < this.lossProfile.burstLoss) continue;
      if (this.rng.next() < this.lossProfile.dupRate) {
        delivered.push({ ...msg, seq: msg.seq });
      }
      delivered.push(msg);
    }
    if (this.lossProfile.reorder && this.rng.next() < this.lossProfile.reorder) {
      delivered.sort(() => this.rng.next() - 0.5);
    }
    for (const msg of delivered) this.applyMessage(msg);
    this.network = [];
  }

  private applyMessage(msg: NetworkMessage): void {
    const key = `${msg.tipo}:${msg.seq}:${msg.epoch}:${msg.from}`;
    if (this.appliedMessages.has(key)) {
      if (!this.mutationTwins.has("noDedupe")) {
        this.doubleApplies++;
        return;
      }
    }
    this.appliedMessages.add(key);

    if (msg.tipo === "ownership") {
      const info = msg.payload as OwnershipInfo;
      const current = this.state.ownership.get(info.actorId);
      if (current && info.epoch < current.epoch) {
        if (!this.mutationTwins.has("staleAccept")) {
          this.staleApplies++;
          return;
        }
      }
      if (current && info.epoch === current.epoch && info.ownerSlot !== current.ownerSlot) {
        if (!this.mutationTwins.has("doubleOwner")) {
          this.ownershipTransfers++;
        }
      }
      this.state.ownership.set(info.actorId, info);
      this.ownershipTransfers++;
    }
  }

  private updateOwnership(): void {
    for (const [actorId, info] of this.state.ownership) {
      const playersInRange = Array.from(this.state.jugadores.values())
        .filter((j) => this.distance(j.posicion, this.getActorPos(actorId)) < 50);
      if (playersInRange.length > 0) {
        const nearest = playersInRange.reduce((a, b) =>
          this.distance(a.posicion, this.getActorPos(actorId)) <
          this.distance(b.posicion, this.getActorPos(actorId))
            ? a
            : b
        );
        if (nearest.slot !== info.ownerSlot) {
          const newEpoch = info.epoch + 1;
          this.sendOwnership(actorId, nearest.slot, newEpoch);
        }
      }
    }
  }

  private getActorPos(actorId: string): { x: number; y: number } {
    const obj = this.state.objetos.get(actorId);
    return obj?.posicion ?? { x: 0, y: 0 };
  }

  private distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  sendAction(from: number, action: unknown): void {
    this.network.push({
      from,
      to: 0,
      tipo: "accion",
      payload: action,
      seq: this.state.sequence++,
      epoch: 0,
    });
  }

  sendOwnership(actorId: string, ownerSlot: number, epoch: number): void {
    this.network.push({
      from: 0,
      to: -1,
      tipo: "ownership",
      payload: { actorId, ownerSlot, epoch, reclutador: undefined },
      seq: this.state.sequence++,
      epoch,
    });
  }

  runScenario(name: string): void {
    switch (name) {
      case "dos_jugadores_mismo_objeto":
        this.scenarioDosJugadoresMismoObjeto();
        break;
      case "stale_echo":
        this.scenarioStaleEcho();
        break;
      case "transferencia_ownership":
        this.scenarioTransferenciaOwnership();
        break;
      case "caos_total":
        this.scenarioCaosTotal();
        break;
      case "handoff_completo":
        this.scenarioHandoffCompleto();
        break;
      case "follower_se_mueve":
        this.scenarioFollowerSeMueve();
        break;
      case "mensaje_duplicado":
        this.scenarioMensajeDuplicado();
        break;
      default:
        throw new Error(`Escenario desconocido: ${name}`);
    }
  }

  private scenarioDosJugadoresMismoObjeto(): void {
    const objId = "item_espada_001";
    this.state.objetos.set(objId, {
      id: objId,
      tipo: "item",
      posicion: { x: 10, y: 10 },
      estado: { recogido: false },
    });
    this.sendAction(1, { tipo: "recoger", objetoId: objId });
    this.sendAction(2, { tipo: "recoger", objetoId: objId });
    this.tick(100);
    this.tick(100);
  }

  private scenarioStaleEcho(): void {
    const actorId = "npc_goblin_001";
    this.state.ownership.set(actorId, { actorId, ownerSlot: 1, epoch: 5 });
    this.network.push({
      from: 0,
      to: -1,
      tipo: "ownership",
      payload: { actorId, ownerSlot: 1, epoch: 3 },
      seq: this.state.sequence++,
      epoch: 3,
    });
    this.tick(50);
  }

  private scenarioTransferenciaOwnership(): void {
    const actorId = "npc_lobo_001";
    this.state.ownership.set(actorId, { actorId, ownerSlot: 0, epoch: 1 });
    this.state.jugadores.get("jugador_1")!.posicion = { x: 5, y: 5 };
    this.tick(100);
    this.tick(100);
  }

  private scenarioCaosTotal(): void {
    for (let i = 0; i < 100; i++) {
      const player = this.rng.nextInt(this.players) + 1;
      this.sendAction(player, { tipo: "mover", x: this.rng.next() * 100, y: this.rng.next() * 100 });
      if (this.rng.next() < 0.1) this.tick(10);
    }
    this.tick(1000);
  }

  private scenarioHandoffCompleto(): void {
    const actorId = "npc_oso_001";
    this.state.ownership.set(actorId, { actorId, ownerSlot: 0, epoch: 1 });
    this.state.jugadores.get("jugador_1")!.posicion = { x: 5, y: 5 };
    this.tick(100);
    this.sendOwnership(actorId, 1, 2);
    this.tick(50);
    this.sendOwnership(actorId, 1, 3);
    this.tick(100);
  }

  private scenarioFollowerSeMueve(): void {
    const actorId = "npc_companion";
    this.state.ownership.set(actorId, { actorId, ownerSlot: 0, epoch: 1, reclutador: 0 });
    this.state.jugadores.get("jugador_0")!.posicion = { x: 500, y: 500 };
    this.tick(100);
  }

  private scenarioMensajeDuplicado(): void {
    const actorId = "item_pocion_001";
    this.network.push({
      from: 1,
      to: 0,
      tipo: "accion",
      payload: { tipo: "usar", objetoId: actorId },
      seq: 100,
      epoch: 0,
    });
    this.network.push({
      from: 1,
      to: 0,
      tipo: "accion",
      payload: { tipo: "usar", objetoId: actorId },
      seq: 100,
      epoch: 0,
    });
    this.tick(50);
  }

  checkConvergence(): boolean {
    const digests = new Map<number, string>();
    for (const [, jugador] of this.state.jugadores) {
      digests.set(jugador.slot, this.getPlayerDigest(jugador));
    }
    const first = digests.values().next().value;
    this.converged = Array.from(digests.values()).every((d) => d === first);
    return this.converged;
  }

  private getPlayerDigest(jugador: Jugador): string {
    return `${jugador.id}:${jugador.posicion.x}:${jugador.posicion.y}:${jugador.inventario.sort().join(",")}`;
  }

  countTotalItems(): number {
    let count = 0;
    for (const obj of this.state.objetos.values()) {
      if (obj.tipo === "item" && !obj.estado.recogido) count++;
    }
    for (const jugador of this.state.jugadores.values()) {
      count += jugador.inventario.length;
    }
    return count;
  }

  getCoverage() {
    return {
      ownershipTransfers: this.ownershipTransfers,
      lootRaces: this.lootRaces,
      spawnRaces: this.spawnRaces,
      hostLoads: this.hostLoads,
      staleReplays: this.staleReplays,
      rejectedDupes: this.rejectedDupes,
    };
  }
}

export function createSalaState(playerCount: number): SalaState {
  const jugadores = new Map<string, Jugador>();
  for (let i = 0; i < playerCount; i++) {
    jugadores.set(`jugador_${i}`, {
      id: `jugador_${i}`,
      slot: i,
      posicion: { x: i * 10, y: i * 10 },
      inventario: [],
    });
  }
  return {
    jugadores,
    objetos: new Map(),
    ownership: new Map(),
    sequence: 0,
  };
}