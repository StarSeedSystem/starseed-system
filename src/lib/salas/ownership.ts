export interface OwnershipMessage {
  actorId: string;
  epoch: number;
  ownerSlot: number;
  type: "Grant" | "Transfer" | "Commit" | "Release" | "Ack";
  recruiterSlot?: number;
}

export interface Presence {
  slot: number;
  connected: boolean;
  inCell: boolean;
  inNeighbourCell: boolean;
  distance: number;
}

type MutationTwin =
  | "noEpochBump"
  | "noDedupe"
  | "noFlap"
  | "staleAccept"
  | "handoffNoWait"
  | "recruiterIgnored"
  | "epochReset"
  | "doubleOwner";

export class OwnershipView {
  private owners = new Map<string, { owner: number; epoch: number; recruiter?: number }>();
  private pendingTransfers = new Map<string, { from: number; to: number; epoch: number; finalState?: unknown }>();
  private appliedMessages = new Set<string>();
  private mutationTwins = new Set<MutationTwin>();

  enableMutationTwin(twin: MutationTwin): void {
    this.mutationTwins.add(twin);
  }

  apply(msg: OwnershipMessage): void {
    const key = `${msg.actorId}:${msg.type}:${msg.epoch}:${msg.ownerSlot}`;
    if (this.appliedMessages.has(key)) {
      if (!this.mutationTwins.has("noDedupe")) return;
    }
    this.appliedMessages.add(key);

    const current = this.owners.get(msg.actorId);
    if (current && msg.epoch < current.epoch) {
      if (!this.mutationTwins.has("staleAccept")) return;
    }
    if (current && msg.epoch === current.epoch && msg.ownerSlot !== current.owner) {
      if (!this.mutationTwins.has("doubleOwner")) return;
    }

    switch (msg.type) {
      case "Grant":
      case "Transfer":
      case "Commit":
        this.owners.set(msg.actorId, {
          owner: msg.ownerSlot,
          epoch: msg.epoch,
          recruiter: msg.recruiterSlot,
        });
        break;
      case "Release":
        this.owners.delete(msg.actorId);
        break;
      case "Ack":
        break;
    }
  }

  mayPublish(actorId: string, mySlot: number): { allowed: boolean; epoch: number } {
    const current = this.owners.get(actorId);
    if (!current) return { allowed: false, epoch: 0 };
    return { allowed: current.owner === mySlot, epoch: current.epoch };
  }

  check(
    actorId: string,
    fromSlot: number,
    updateEpoch: number
  ): "Accept" | "Stale" | "Future" | "NotOwner" {
    const current = this.owners.get(actorId);
    if (!current) return "NotOwner";
    if (updateEpoch < current.epoch) return "Stale";
    if (updateEpoch > current.epoch) return "Future";
    return fromSlot === current.owner ? "Accept" : "NotOwner";
  }

  handoffIncoming(actorId: string, epoch: number): boolean {
    const pending = this.pendingTransfers.get(actorId);
    return pending !== undefined && pending.epoch === epoch;
  }

  getOwner(actorId: string): { owner: number; epoch: number; recruiter?: number } | undefined {
    return this.owners.get(actorId);
  }

  setRecruiter(actorId: string, recruiterSlot: number, epoch: number): void {
    const current = this.owners.get(actorId);
    if (current) {
      this.owners.set(actorId, { ...current, recruiter: recruiterSlot, epoch });
    }
  }

  hasRecruiter(actorId: string): boolean {
    return (this.owners.get(actorId)?.recruiter ?? -1) >= 0;
  }
}

export class OwnershipService {
  private view = new OwnershipView();
  private hostSlot = 0;
  private minHoldTime = 1500;
  private flapThreshold = 0.25;
  private lastTransferTime = new Map<string, number>();
  private mutationTwins = new Set<MutationTwin>();

  enableMutationTwin(twin: MutationTwin): void {
    this.mutationTwins.add(twin);
    this.view.enableMutationTwin(twin);
  }

  playerJoined(slot: number): OwnershipMessage[] {
    return [];
  }

  playerLeft(slot: number, nowMs: number): OwnershipMessage[] {
    const out: OwnershipMessage[] = [];
    for (const [actorId, info] of this.view["owners"]) {
      if (info.owner === slot) {
        const msg = { actorId, epoch: info.epoch + 1, ownerSlot: -1, type: "Release" as const };
        out.push(msg);
        this.view.apply(msg);
      }
    }
    return out;
  }

  track(actorId: string, presences: Presence[], nowMs: number): OwnershipMessage[] {
    const out: OwnershipMessage[] = [];
    const candidates = presences
      .filter((p) => p.connected && (p.inCell || p.inNeighbourCell))
      .sort((a, b) => a.distance - b.distance);

    if (candidates.length === 0) return out;

    let ownerSlot = this.hostSlot;
    if (candidates[0].slot !== this.hostSlot) {
      ownerSlot = candidates[0].slot;
    }

    const epoch = this.mutationTwins.has("epochReset") ? 1 : 1;
    const msg: OwnershipMessage = { actorId, epoch, ownerSlot, type: "Grant", recruiterSlot: undefined };
    out.push(msg);
    this.view.apply(msg);
    return out;
  }

  evaluate(actorId: string, presences: Presence[], nowMs: number): OwnershipMessage[] {
    const out: OwnershipMessage[] = [];
    const current = this.view.getOwner(actorId);
    if (!current) return out;

    if (this.view.hasRecruiter(actorId) && !this.mutationTwins.has("recruiterIgnored")) {
      return out;
    }

    const lastTransfer = this.lastTransferTime.get(actorId) ?? 0;
    if (nowMs - lastTransfer < this.minHoldTime && !this.mutationTwins.has("noFlap")) {
      return out;
    }

    const candidates = presences
      .filter((p) => p.connected && (p.inCell || p.inNeighbourCell))
      .sort((a, b) => a.distance - b.distance);

    if (candidates.length === 0) return out;

    const nearest = candidates[0];
    const currentOwner = current.owner;
    const currentDist = presences.find((p) => p.slot === currentOwner)?.distance ?? Infinity;

    if (nearest.slot !== currentOwner) {
      const improvement = (currentDist - nearest.distance) / currentDist;
      if (improvement >= this.flapThreshold || this.mutationTwins.has("noFlap")) {
        const newEpoch = current.epoch + 1;
        if (this.mutationTwins.has("noEpochBump")) {
          const msg = { actorId, epoch: current.epoch, ownerSlot: nearest.slot, type: "Transfer" as const };
          out.push(msg);
          this.view.apply(msg);
        } else {
          const transferMsg = { actorId, epoch: newEpoch, ownerSlot: currentOwner, type: "Transfer" as const };
          const commitMsg = { actorId, epoch: newEpoch, ownerSlot: nearest.slot, type: "Commit" as const };
          out.push(transferMsg, commitMsg);
          this.view.apply(transferMsg);
          this.view.apply(commitMsg);
        }
        this.lastTransferTime.set(actorId, nowMs);
      }
    }
    return out;
  }

  setRecruiter(actorId: string, recruiterSlot: number, presences: Presence[], nowMs: number): OwnershipMessage[] {
    const out: OwnershipMessage[] = [];
    const current = this.view.getOwner(actorId);
    if (!current) return out;

    const newEpoch = current.epoch + 1;
    this.view.setRecruiter(actorId, recruiterSlot, newEpoch);
    out.push({ actorId, epoch: newEpoch, ownerSlot: recruiterSlot, type: "Grant", recruiterSlot });
    return out;
  }

  tick(nowMs: number): OwnershipMessage[] {
    return [];
  }

  getView(): OwnershipView {
    return this.view;
  }
}