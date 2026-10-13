import { describe, it, expect } from "vitest";
import { repartirAnchoBanda } from "../ancho-banda";
import type { Prioridad } from "../tipos";

describe("repartirAnchoBanda", () => {
  // Helper to create a flujo
  const flujo = (id: string, prioridad: Prioridad, demandaKbps: number, enlaces: string[]) => ({
    id,
    prioridad,
    demandaKbps,
    enlaces
  });

  it("un enlace con dos flujos 8:1", () => {
    // P0 (weight 8) and P3 (weight 1) sharing a link with capacity 9 kbps
    // Should get 8 and 1 respectively
    const flujos = [
      flujo("f1", 0, 10, ["enlace1"]), // P0, demand 10
      flujo("f2", 3, 10, ["enlace1"])  // P3, demand 10
    ];
    const capacidades = { "enlace1": 9 };

    const resultado = repartirAnchoBanda(flujos, capacidades);
    
    // With weights 8:1, P0 should get 8/9 of capacity, P3 should get 1/9
    expect(resultado["f1"]).toBeCloseTo(8, 1e-6);
    expect(resultado["f2"]).toBeCloseTo(1, 1e-6);
  });

  it("demanda pequeña satisfecha y el resto al otro", () => {
    // P0 with low demand, P3 with high demand
    const flujos = [
      flujo("f1", 0, 2, ["enlace1"]),   // P0, demand 2
      flujo("f2", 3, 10, ["enlace1"])   // P3, demand 10
    ];
    const capacidades = { "enlace1": 10 };

    const resultado = repartirAnchoBanda(flujos, capacidades);
    
    // P0 gets its full demand (2), P3 gets the rest (8)
    expect(resultado["f1"]).toBeCloseTo(2, 1e-6);
    expect(resultado["f2"]).toBeCloseTo(8, 1e-6);
  });

  it("enlace sin capacidad → 0", () => {
    const flujos = [
      flujo("f1", 0, 5, ["enlace1"]),
      flujo("f2", 1, 5, ["enlace1"])
    ];
    const capacidades = { "enlace1": 0 };

    const resultado = repartirAnchoBanda(flujos, capacidades);
    
    expect(resultado["f1"]).toBeCloseTo(0, 1e-6);
    expect(resultado["f2"]).toBeCloseTo(0, 1e-6);
  });

  it("suma por enlace ≤ capacidad (con tolerancia 1e-6)", () => {
    const flujos = [
      flujo("f1", 0, 100, ["enlace1", "enlace2"]),
      flujo("f2", 1, 100, ["enlace1"]),
      flujo("f3", 2, 100, ["enlace2"])
    ];
    const capacidades = { "enlace1": 50, "enlace2": 50 };

    const resultado = repartirAnchoBanda(flujos, capacidades);
    
    // Check link 1: f1 + f2 <= 50
    const usoEnlace1 = (resultado["f1"] || 0) + (resultado["f2"] || 0);
    expect(usoEnlace1).toBeLessThanOrEqual(50 + 1e-6);
    
    // Check link 2: f1 + f3 <= 50
    const usoEnlace2 = (resultado["f1"] || 0) + (resultado["f3"] || 0);
    expect(usoEnlace2).toBeLessThanOrEqual(50 + 1e-6);
    
    // Also check that no flow exceeds its demand
    expect(resultado["f1"]).toBeLessThanOrEqual(100 + 1e-6);
    expect(resultado["f2"]).toBeLessThanOrEqual(100 + 1e-6);
    expect(resultado["f3"]).toBeLessThanOrEqual(100 + 1e-6);
  });

  it("flujos múltiples en múltiples enlaces", () => {
    // More complex scenario
    const flujos = [
      flujo("f1", 0, 10, ["e1", "e2"]), // P0, high priority
      flujo("f2", 1, 10, ["e1", "e3"]), // P1
      flujo("f3", 2, 10, ["e2", "e3"]), // P2
      flujo("f4", 3, 10, ["e1", "e2", "e3"]) // P3
    ];
    const capacidades = { "e1": 10, "e2": 10, "e3": 10 };

    const resultado = repartirAnchoBanda(flujos, capacidades);
    
    // All links should be fully utilized or flows satisfied
    const usoE1 = (resultado["f1"] || 0) + (resultado["f2"] || 0) + (resultado["f4"] || 0);
    const usoE2 = (resultado["f1"] || 0) + (resultado["f3"] || 0) + (resultado["f4"] || 0);
    const usoE3 = (resultado["f2"] || 0) + (resultado["f3"] || 0) + (resultado["f4"] || 0);
    
    expect(usoE1).toBeLessThanOrEqual(10 + 1e-6);
    expect(usoE2).toBeLessThanOrEqual(10 + 1e-6);
    expect(usoE3).toBeLessThanOrEqual(10 + 1e-6);
    
    // No flow should exceed demand
    expect(resultado["f1"]).toBeLessThanOrEqual(10 + 1e-6);
    expect(resultado["f2"]).toBeLessThanOrEqual(10 + 1e-6);
    expect(resultado["f3"]).toBeLessThanOrEqual(10 + 1e-6);
    expect(resultado["f4"]).toBeLessThanOrEqual(10 + 1e-6);
  });
});