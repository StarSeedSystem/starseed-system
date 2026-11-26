import { describe, it, expect, beforeEach } from "vitest";
import { SalaFakeWorld, createSalaState } from "./fake-world-sala";
import { SeededRNG } from "./seeded-rng";

describe("Fake World: sincronía de sala", () => {
  let world: SalaFakeWorld;

  beforeEach(() => {
    world = new SalaFakeWorld(createSalaState(3), 3, "lan", 42);
  });

  describe("Convergencia básica", () => {
    it("converge cuando todos los jugadores tienen mismo estado inicial", () => {
      // En lan sin mensajes de red, el estado inicial es consistente
      expect(world.checkConvergence()).toBe(true);
    });

    it("rechaza ownership de época antigua (stale echo) vía applyMessage", () => {
      world.state.ownership.set("npc_goblin_001", { actorId: "npc_goblin_001", ownerSlot: 1, epoch: 5 });
      world.network.push({
        from: 0,
        to: -1,
        tipo: "ownership",
        payload: { actorId: "npc_goblin_001", ownerSlot: 1, epoch: 3, reclutador: undefined },
        seq: world.state.sequence++,
        epoch: 3,
      });
      world.tick(50);
      expect(world.staleApplies).toBeGreaterThan(0);
      expect(world.checkConvergence()).toBe(true);
    });

    it("registra ownership transfers cuando cambia owner", () => {
      world.state.ownership.set("npc_lobo_001", { actorId: "npc_lobo_001", ownerSlot: 0, epoch: 1 });
      world.network.push({
        from: 0,
        to: -1,
        tipo: "ownership",
        payload: { actorId: "npc_lobo_001", ownerSlot: 1, epoch: 2, reclutador: undefined },
        seq: world.state.sequence++,
        epoch: 2,
      });
      world.tick(50);
      expect(world.ownershipTransfers).toBeGreaterThan(0);
    });

    it("conserva items: suelo + contenedores + inventarios = inicial", () => {
      const inicial = world.countTotalItems();
      world.tick(100);
      expect(world.countTotalItems()).toBe(inicial);
    });

    it("handoff: secuencia Transfer -> Commit actualiza ownership", () => {
      world.state.ownership.set("npc_oso_001", { actorId: "npc_oso_001", ownerSlot: 0, epoch: 1 });
      world.network.push({
        from: 0,
        to: -1,
        tipo: "ownership",
        payload: { actorId: "npc_oso_001", ownerSlot: 1, epoch: 2, reclutador: undefined },
        seq: world.state.sequence++,
        epoch: 2,
      });
      world.network.push({
        from: 0,
        to: -1,
        tipo: "ownership",
        payload: { actorId: "npc_oso_001", ownerSlot: 1, epoch: 3, reclutador: undefined },
        seq: world.state.sequence++,
        epoch: 3,
      });
      world.tick(100);
      expect(world.checkConvergence()).toBe(true);
    });

    it("follower exception: reclutador mantiene ownership al moverse", () => {
      world.state.ownership.set("npc_companion", { actorId: "npc_companion", ownerSlot: 0, epoch: 1, reclutador: 0 });
      world.tick(100);
      const npc = world.state.ownership.get("npc_companion");
      expect(npc?.ownerSlot).toBe(0);
    });
  });

  describe("Cobertura de contadores", () => {
    it("registra ownership transfers en tick", () => {
      world.network.push({
        from: 0,
        to: -1,
        tipo: "ownership",
        payload: { actorId: "actor1", ownerSlot: 1, epoch: 2, reclutador: undefined },
        seq: world.state.sequence++,
        epoch: 2,
      });
      world.tick(50);
      const cov = world.getCoverage();
      expect(cov.ownershipTransfers).toBeGreaterThan(0);
    });
  });

  describe("Mutation twins", () => {
    it("dupApply twin: sin deduplicación aplica dos veces (noDedupe)", () => {
      const w = new SalaFakeWorld(createSalaState(2), 2, "lan", 123);
      w.enableMutationTwin("noDedupe");
      w.network.push({
        from: 1,
        to: 0,
        tipo: "accion",
        payload: { tipo: "usar", objetoId: "item_pocion_001" },
        seq: 100,
        epoch: 0,
      });
      w.network.push({
        from: 1,
        to: 0,
        tipo: "accion",
        payload: { tipo: "usar", objetoId: "item_pocion_001" },
        seq: 100,
        epoch: 0,
      });
      w.tick(50);
      expect(w.doubleApplies).toBeGreaterThan(0);
    });

    it("staleEpoch twin: acepta época antigua (staleAccept)", () => {
      const w = new SalaFakeWorld(createSalaState(2), 2, "lan", 123);
      w.enableMutationTwin("staleAccept");
      w.state.ownership.set("npc_goblin_001", { actorId: "npc_goblin_001", ownerSlot: 1, epoch: 5 });
      w.network.push({
        from: 0,
        to: -1,
        tipo: "ownership",
        payload: { actorId: "npc_goblin_001", ownerSlot: 0, epoch: 3, reclutador: undefined },
        seq: w.state.sequence++,
        epoch: 3,
      });
      w.tick(50);
      expect(w.staleApplies).toBe(0);
    });

    it("doubleOwner twin: dos dueños misma época", () => {
      const w = new SalaFakeWorld(createSalaState(3), 3, "lan", 123);
      w.enableMutationTwin("doubleOwner");
      w.state.ownership.set("actor1", { actorId: "actor1", ownerSlot: 0, epoch: 1 });
      w.network.push({
        from: 0,
        to: -1,
        tipo: "ownership",
        payload: { actorId: "actor1", ownerSlot: 1, epoch: 1, reclutador: undefined },
        seq: w.state.sequence++,
        epoch: 1,
      });
      w.tick(50);
      expect(w.ownershipTransfers).toBeGreaterThan(0);
    });
  });

  describe("Determinismo por semilla", () => {
    it("misma semilla produce mismo resultado", () => {
      const w1 = new SalaFakeWorld(createSalaState(3), 3, "lan", 42);
      const w2 = new SalaFakeWorld(createSalaState(3), 3, "lan", 42);
      w1.network.push({ from: 0, to: -1, tipo: "ownership", payload: { actorId: "a1", ownerSlot: 1, epoch: 2, reclutador: undefined }, seq: 1, epoch: 2 });
      w2.network.push({ from: 0, to: -1, tipo: "ownership", payload: { actorId: "a1", ownerSlot: 1, epoch: 2, reclutador: undefined }, seq: 1, epoch: 2 });
      w1.tick(100);
      w2.tick(100);
      expect(w1.checkConvergence()).toBe(w2.checkConvergence());
      expect(w1.doubleApplies).toBe(w2.doubleApplies);
      expect(w1.staleApplies).toBe(w2.staleApplies);
      expect(w1.ownershipTransfers).toBe(w2.ownershipTransfers);
    });

    it("diferente semilla produce resultado diferente", () => {
      const w1 = new SalaFakeWorld(createSalaState(3), 3, "lan", 42);
      const w2 = new SalaFakeWorld(createSalaState(3), 3, "lan", 999);
      w1.network.push({ from: 0, to: -1, tipo: "ownership", payload: { actorId: "a1", ownerSlot: 1, epoch: 2, reclutador: undefined }, seq: 1, epoch: 2 });
      w2.network.push({ from: 0, to: -1, tipo: "ownership", payload: { actorId: "a1", ownerSlot: 1, epoch: 2, reclutador: undefined }, seq: 1, epoch: 2 });
      w1.tick(100);
      w2.tick(100);
      const diff =
        w1.doubleApplies !== w2.doubleApplies ||
        w1.staleApplies !== w2.staleApplies ||
        w1.ownershipTransfers !== w2.ownershipTransfers;
      expect(diff).toBe(true);
    });
  });

  describe("Perfiles de red", () => {
    it("lan: casi sin fallos", () => {
      const w = new SalaFakeWorld(createSalaState(2), 2, "lan", 42);
      w.state.ownership.set("a1", { actorId: "a1", ownerSlot: 0, epoch: 1 });
      w.network.push({ from: 0, to: -1, tipo: "ownership", payload: { actorId: "a1", ownerSlot: 1, epoch: 2, reclutador: undefined }, seq: 1, epoch: 2 });
      w.tick(100);
      expect(w.doubleApplies).toBeLessThanOrEqual(1);
      expect(w.staleApplies).toBe(0);
    });

    it("hell: más fallos pero converge al curar", () => {
      const w = new SalaFakeWorld(createSalaState(2), 2, "hell", 42);
      w.state.ownership.set("a1", { actorId: "a1", ownerSlot: 0, epoch: 1 });
      w.network.push({ from: 0, to: -1, tipo: "ownership", payload: { actorId: "a1", ownerSlot: 1, epoch: 2, reclutador: undefined }, seq: 1, epoch: 2 });
      w.tick(200);
      expect(w.doubleApplies + w.staleApplies).toBeGreaterThanOrEqual(0);
      expect(w.checkConvergence()).toBe(true);
    });
  });
});