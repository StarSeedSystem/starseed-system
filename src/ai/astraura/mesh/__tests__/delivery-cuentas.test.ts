import { describe, expect, it } from "vitest";
import {
  planTransmission,
  TransmitRequest,
  TransmitScope,
  TrafficClass,
} from "../synaptic-router";
import {
  deliver,
  executePlan,
  DeliveryReceipt,
  DeliveryHop,
  HopStatus,
} from "../delivery";
import type { NetworkContext, DeliveryPorts } from "../synaptic-router";

// Mock data for tests
const MI_CUENTA = "mi-cuenta-handle";
const OTRA_CUENTA = "otra-cuenta-handle";
const PAYLOAD_TEST = { test: "data" };

describe("planTransmission - relevo entre cuentas", () => {
  const ctxBase: NetworkContext = {
    meshReady: true,
    onlineNodes: 2,
    avgSnr: 20,
    channelUtilPct: 10,
    region: "test",
    activePreset: "MEDIUM",
    wifiHealthy: true,
    hasAccount: true,
    meshAllowed: true,
    serverAllowed: true,
    publicAllowed: true,
    serverId: "starseed",
  };

  it("debe usar server-relay con motivo 'relevo cifrado por destinatario' para privado a otra cuenta sin camino directo", () => {
    const req: TransmitRequest = {
      scope: "private",
      cls: "P2",
      sizeBytes: 100,
      target: "account",
      recipient: OTRA_CUENTA,
      distance: "local",
      e2e: true,
    };

    // Simular que la malla no es usable por configuración
    const ctx: NetworkContext = {
      ...ctxBase,
      meshAllowed: false, // Malla no permitida
    };

    const plan = planTransmission(req, ctx);

    expect(plan.primary.via).toBe("server-relay");
    expect(plan.primary.reason).toBe("relevo cifrado por destinatario");
    expect(plan.queuedOnly).toBeUndefined();
  });

  it("no debe usar el motivo especial para privado a misma cuenta", () => {
    const req: TransmitRequest = {
      scope: "private",
      cls: "P2",
      sizeBytes: 100,
      target: "account",
      // Para transmisiones a la misma cuenta, no se establece recipient
      distance: "local",
      e2e: true,
    };

    const ctx: NetworkContext = {
      ...ctxBase,
      meshAllowed: false, // Malla no permitida para forzar el branch !meshUsable
    };

    const plan = planTransmission(req, ctx);

    expect(plan.primary.via).toBe("server-relay");
    expect(plan.primary.reason).not.toBe("relevo cifrado por destinatario");
    // Debe usar el motivo genérico
    expect(plan.primary.reason).toBe("malla no disponible o payload grande: relé cifrado por servidor");
  });

  it("no debe usar el motivo especial para público", () => {
    const req: TransmitRequest = {
      scope: "public",
      cls: "P2",
      sizeBytes: 100,
      target: "account",
      recipient: OTRA_CUENTA,
      distance: "local",
      e2e: false,
    };

    const ctx: NetworkContext = {
      ...ctxBase,
      onlineNodes: 0,
    };

    const plan = planTransmission(req, ctx);

    // Para público, debería ir por server-public o similar, no necesariamente server-relay con motivo especial
    expect(plan.primary.via).toBe("server-public");
    expect(plan.primary.reason).toContain("contenido público");
  });
});

describe("delivery - manejo de falta de clave del destinatario", () => {
  const req: TransmitRequest = {
    scope: "private",
    cls: "P2",
    sizeBytes: 100,
    target: "account",
    recipient: OTRA_CUENTA,
    distance: "local",
    e2e: true,
  };

  const ctx: NetworkContext = {
    meshReady: true,
    onlineNodes: 2,
    avgSnr: 20,
    channelUtilPct: 10,
    region: "test",
    activePreset: "MEDIUM",
    wifiHealthy: true,
    hasAccount: true,
    meshAllowed: true,
    serverAllowed: true,
    publicAllowed: true,
    serverId: "starseed",
  };

  it("debe mostrar motivo específico y marcar hop como queued cuando falla por falta de clave del destinatario", async () => {
    // Puertos simulados
    const ports: DeliveryPorts = {
      mesh: async () => ({
        ok: false,
        detail: "malla no disponible",
      }),
      server: async (leg: TransmitLeg, _req: TransmitRequest, _payload: unknown) => {
        // Simular fallo por falta de clave del destinatario solo para server-relay
        if (leg.via === "server-relay") {
          throw new Error("no se pudo cifrar para el destinatario: falta de la clave del destinatario");
        }
        // Para otros casos, éxito genérico
        return { ok: true, confirmed: true, through: "test-server" };
      },
    };

    const receipt: DeliveryReceipt = await deliver(req, PAYLOAD_TEST, ctx, ports);

    // Verificar que el recibo existe
    expect(receipt).toBeDefined();
    expect(receipt.id).toContain("dlv-");

    // Verificar que al menos un hop tiene el motivo específico y estado queued
    const relayHop = receipt.hops.find(
      (hop) => hop.via === "server-relay" && hop.detail === "falta de la clave del destinatario para cifrado"
    );
    expect(relayHop).toBeDefined();
    expect(relayHop?.status).toBe("queued");

    // Verificar que el recibo detalle contiene el motivo (opcional, depende de cómo se implemente el resumen)
    // El detalle específico está en el hop, no necesariamente en el resumen del recibo
  });

  it("debe mostrar motivo específico y marcar hop como queued cuando falla por falta de clave del destinatario", async () => {
    // Para asegurar que server-relay sea la vía principal, desactivamos malla
    const ctxNoMesh: NetworkContext = {
      ...ctx,
      meshAllowed: false, // Malla no permitida
    };

    // Puertos simulados donde servidor falla por falta de clave
    const ports: DeliveryPorts = {
      mesh: async () => ({
        ok: false,
        detail: "malla no disponible por configuración",
      }),
      server: async (_leg: TransmitLeg, _req: TransmitRequest, _payload: unknown) => {
        // Simular fallo por falta de clave del destinatario
        throw new Error("no se pudo cifrar para el destinatario: falta de la clave del destinatario");
      },
    };

    const receipt: DeliveryReceipt = await deliver(req, PAYLOAD_TEST, ctxNoMesh, ports);

    // Verificar que el recipiente existe
    expect(receipt).toBeDefined();
    expect(receipt.id).toContain("dlv-");

    // Verificar que el hop de server-relay tiene el motivo específico y estado queued
    const serverHop = receipt.hops.find((hop) => hop.via === "server-relay");
    expect(serverHop).toBeDefined();
    expect(serverHop?.detail).toBe("falta de la clave del destinatario para cifrado");
    expect(serverHop?.status).toBe("queued");
  });
});