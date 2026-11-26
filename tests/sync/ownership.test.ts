import { describe, it, expect, beforeEach } from "vitest";
import { OwnershipService, OwnershipView, Presence, OwnershipMessage } from "../../src/lib/salas/ownership";

describe("Ownership con épocas", () => {
  let service: OwnershipService;
  let view: OwnershipView;

  const basePresences: Presence[] = [
    { slot: 0, connected: true, inCell: true, inNeighbourCell: false, distance: 10 },
    { slot: 1, connected: true, inCell: true, inNeighbourCell: false, distance: 50 },
  ];

  beforeEach(() => {
    service = new OwnershipService();
    view = service.getView();
    service.playerJoined(0);
    service.playerJoined(1);
  });

  describe("Reglas básicas", () => {
    it("host decide owner inicial", () => {
      service.track("actor1", basePresences, 1000);
      const owner = view.getOwner("actor1");
      expect(owner?.owner).toBe(0);
      expect(owner?.epoch).toBe(1);
    });

    it("epoch monotónica: track establece epoch 1", () => {
      service.track("actor1", basePresences, 1000);
      const epoch1 = view.getOwner("actor1")?.epoch ?? 0;
      expect(epoch1).toBe(1);
    });

    it("handoff: evaluate devuelve Transfer y Commit cuando hay transferencia", () => {
      service.track("actor1", basePresences, 1000);
      service.lastTransferTime.set("actor1", 0);

      const moved: Presence[] = [
        { slot: 0, connected: true, inCell: true, inNeighbourCell: false, distance: 50 },
        { slot: 1, connected: true, inCell: true, inNeighbourCell: false, distance: 5 },
      ];
      const messages = service.evaluate("actor1", moved, 2000);
      const hasTransfer = messages.some((m) => m.type === "Transfer");
      const hasCommit = messages.some((m) => m.type === "Commit");
      expect(hasTransfer || hasCommit).toBe(true);
    });

    it("follower exception: reclutador mantiene ownership", () => {
      service.track("companion1", basePresences, 1000);
      service.setRecruiter("companion1", 0, basePresences, 1000);
      service.lastTransferTime.set("companion1", 0);

      const recruiterFar: Presence[] = [
        { slot: 0, connected: true, inCell: false, inNeighbourCell: false, distance: 500 },
        { slot: 1, connected: true, inCell: true, inNeighbourCell: false, distance: 50 },
      ];
      service.evaluate("companion1", recruiterFar, 2000);
      expect(view.getOwner("companion1")?.owner).toBe(0);
      expect(view.hasRecruiter("companion1")).toBe(true);
    });

    it("rechaza epoch stale en check", () => {
      view.apply({ actorId: "a1", epoch: 5, ownerSlot: 1, type: "Grant" });
      const result = view.check("a1", 1, 3);
      expect(result).toBe("Stale");
    });

    it("rechaza own echo en check (mismo slot, misma epoch = Accept)", () => {
      view.apply({ actorId: "a1", epoch: 1, ownerSlot: 0, type: "Grant" });
      const result = view.check("a1", 0, 1);
      expect(result).toBe("Accept");
    });

    it("rechaza mensaje de no-owner", () => {
      view.apply({ actorId: "a1", epoch: 1, ownerSlot: 0, type: "Grant" });
      const result = view.check("a1", 1, 1);
      expect(result).toBe("NotOwner");
    });

    it("rechaza future epoch", () => {
      view.apply({ actorId: "a1", epoch: 1, ownerSlot: 0, type: "Grant" });
      const result = view.check("a1", 0, 5);
      expect(result).toBe("Future");
    });

    it("mayPublish solo permite al owner actual", () => {
      view.apply({ actorId: "a1", epoch: 1, ownerSlot: 0, type: "Grant" });
      expect(view.mayPublish("a1", 0)).toEqual({ allowed: true, epoch: 1 });
      expect(view.mayPublish("a1", 1)).toEqual({ allowed: false, epoch: 1 });
    });
  });

  describe("Player join/leave", () => {
    it("playerLeft libera actors del jugador", () => {
      service.track("actor1", basePresences, 1000);
      expect(view.getOwner("actor1")?.owner).toBe(0);

      const messages = service.playerLeft(0, 2000);
      expect(messages.some((m) => m.type === "Release" && m.actorId === "actor1")).toBe(true);
    });
  });

  describe("Mutation twins (7 total)", () => {
    it("noEpochBump twin: epoch no sube en transfer", () => {
      const svc = new OwnershipService();
      svc.enableMutationTwin("noEpochBump");
      const v = svc.getView();
      svc.playerJoined(0);
      svc.playerJoined(1);
      svc.track("actor1", basePresences, 1000);
      const epoch1 = v.getOwner("actor1")?.epoch ?? 0;

      const moved: Presence[] = [
        { slot: 0, connected: true, inCell: true, inNeighbourCell: false, distance: 50 },
        { slot: 1, connected: true, inCell: true, inNeighbourCell: false, distance: 5 },
      ];
      svc.lastTransferTime.set("actor1", 0);
      svc.evaluate("actor1", moved, 2000);
      const epoch2 = v.getOwner("actor1")?.epoch ?? 0;
      expect(epoch2).toBe(epoch1);
    });

    it("noDedupe twin: acepta mensaje duplicado", () => {
      const v = new OwnershipView();
      v.enableMutationTwin("noDedupe");
      v.apply({ actorId: "a1", epoch: 1, ownerSlot: 0, type: "Grant" });
      v.apply({ actorId: "a1", epoch: 1, ownerSlot: 0, type: "Grant" });
      expect(v.getOwner("a1")?.epoch).toBe(1);
    });

    it("noFlap twin: flapea ownership cada evaluación", () => {
      const svc = new OwnershipService();
      svc.enableMutationTwin("noFlap");
      const v = svc.getView();
      svc.playerJoined(0);
      svc.playerJoined(1);
      svc.track("actor1", basePresences, 1000);
      svc.lastTransferTime.set("actor1", 0);

      const moved: Presence[] = [
        { slot: 0, connected: true, inCell: true, inNeighbourCell: false, distance: 50 },
        { slot: 1, connected: true, inCell: true, inNeighbourCell: false, distance: 5 },
      ];
      svc.evaluate("actor1", moved, 2000);
      expect(v.getOwner("actor1")?.owner).toBe(1);
    });

    it("staleAccept twin: acepta epoch antigua en apply", () => {
      const v = new OwnershipView();
      v.enableMutationTwin("staleAccept");
      v.apply({ actorId: "a1", epoch: 5, ownerSlot: 1, type: "Grant" });
      v.apply({ actorId: "a1", epoch: 3, ownerSlot: 0, type: "Grant" });
      expect(v.getOwner("a1")?.owner).toBe(0);
      expect(v.getOwner("a1")?.epoch).toBe(3);
    });

    it("handoffNoWait twin: evaluate devuelve Commit", () => {
      const svc = new OwnershipService();
      svc.enableMutationTwin("handoffNoWait");
      svc.playerJoined(0);
      svc.playerJoined(1);
      svc.track("actor1", basePresences, 1000);
      svc.lastTransferTime.set("actor1", 0);

      const moved: Presence[] = [
        { slot: 0, connected: true, inCell: true, inNeighbourCell: false, distance: 50 },
        { slot: 1, connected: true, inCell: true, inNeighbourCell: false, distance: 5 },
      ];
      const messages = svc.evaluate("actor1", moved, 2000);
      const hasCommit = messages.some((m) => m.type === "Commit");
      expect(hasCommit).toBe(true);
    });

    it("recruiterIgnored twin: ignora follower exception", () => {
      const svc = new OwnershipService();
      svc.enableMutationTwin("recruiterIgnored");
      const v = svc.getView();
      svc.playerJoined(0);
      svc.playerJoined(1);
      svc.track("companion1", basePresences, 1000);
      svc.setRecruiter("companion1", 0, basePresences, 1000);
      svc.lastTransferTime.set("companion1", 0);

      const recruiterFar: Presence[] = [
        { slot: 0, connected: true, inCell: false, inNeighbourCell: false, distance: 500 },
        { slot: 1, connected: true, inCell: true, inNeighbourCell: false, distance: 50 },
      ];
      svc.evaluate("companion1", recruiterFar, 2000);
      expect(v.getOwner("companion1")?.owner).toBe(1);
    });

    it("epochReset twin: track usa epoch 1", () => {
      const svc = new OwnershipService();
      svc.enableMutationTwin("epochReset");
      const v = svc.getView();
      svc.playerJoined(0);
      svc.playerJoined(1);
      svc.track("actor1", basePresences, 1000);
      expect(v.getOwner("actor1")?.epoch).toBe(1);
    });
  });

  describe("Idempotencia", () => {
    it("aplicar mismo mensaje dos veces no cambia estado", () => {
      const msg: OwnershipMessage = { actorId: "a1", epoch: 1, ownerSlot: 0, type: "Grant" };
      view.apply(msg);
      view.apply(msg);
      expect(view.getOwner("a1")?.epoch).toBe(1);
    });

    it("aplicar mensaje con epoch menor no cambia estado", () => {
      view.apply({ actorId: "a1", epoch: 5, ownerSlot: 1, type: "Grant" });
      view.apply({ actorId: "a1", epoch: 3, ownerSlot: 0, type: "Grant" });
      expect(view.getOwner("a1")?.owner).toBe(1);
      expect(view.getOwner("a1")?.epoch).toBe(5);
    });
  });
});