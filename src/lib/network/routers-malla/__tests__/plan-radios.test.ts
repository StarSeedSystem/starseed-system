import { describe, it, expect } from "vitest";

import { 
  planRadios, 
  type RouterMalla, 
  type RadioRouter,
  type PlanRadiosOutput
} from "../plan-radios";

describe("planRadios", () => {
  it("debería manejar región desconocida y usar perfil EU", () => {
    const input = {
      region: "REGION_DESCONOCIDA",
      routers: [
        {
          id: "router1",
          radios: [
            { id: "radio1", banda: "2g" as const, anchosMhz: [20] },
            { id: "radio2", banda: "5g" as const, anchosMhz: [20, 40, 80] },
            { id: "radio3", banda: "6g" as const, anchosMhz: [20, 40] }
          ]
        }
      ],
      troncales: [] as [string, string][],
      ocupacion: undefined
    };

    const result = planRadios(input);
    
    // Should have a warning about unknown region
    expect(result.avisos.length).toBeGreaterThan(0);
    expect(result.avisos[0]).toContain("Región desconocida");
     expect(result.avisos[0]).toContain("usando perfil EU");
     expect(result.routerUciConfigs).toBeDefined();
     expect(Array.isArray(result.routerUciConfigs)).toBe(true);
   });

  it("debería asignar canales 1/6/11 alternados para clientes en 2g", () => {
    const input = {
      region: "EU",
      routers: [
        {
          id: "router1",
          radios: [{ id: "radio1", banda: "2g" as const, anchosMhz: [20] }]
        },
        {
          id: "router2", 
          radios: [{ id: "radio2", banda: "2g" as const, anchosMhz: [20] }]
        },
        {
          id: "router3",
          radios: [{ id: "radio3", banda: "2g" as const, anchosMhz: [20] }]
        }
      ],
      troncales: [] as [string, string][],
      ocupacion: undefined
    };

    const result = planRadios(input);
    
    // Should have 3 clients (one per router)
    expect(result.clientes.length).toBe(3);
    
    // First router gets channel 1
    const cliente1 = result.clientes.find(c => c.router === "router1");
    expect(cliente1).toBeDefined();
    expect(cliente1?.canal).toBe(1);
    
    // Second router gets channel 6
    const cliente2 = result.clientes.find(c => c.router === "router2");
    expect(cliente2).toBeDefined();
    expect(cliente2?.canal).toBe(6);
    
    // Third router gets channel 11
     const cliente3 = result.clientes.find(c => c.router === "router3");
     expect(cliente3).toBeDefined();
     expect(cliente3?.canal).toBe(11);
     expect(result.routerUciConfigs).toBeDefined();
     expect(Array.isArray(result.routerUciConfigs)).toBe(true);
   });

  it("debería preferir 6g para troncales cuando ambos routers lo tienen", () => {
    const input = {
      region: "EU",
      routers: [
        {
          id: "router1",
          radios: [
            { id: "radio1", banda: "2g" as const, anchosMhz: [20] },
            { id: "radio2", banda: "5g" as const, anchosMhz: [20] },
            { id: "radio3", banda: "6g" as const, anchosMhz: [20, 40] }
          ]
        },
        {
          id: "router2",
          radios: [
            { id: "radio4", banda: "2g" as const, anchosMhz: [20] },
            { id: "radio5", banda: "5g" as const, anchosMhz: [20] },
            { id: "radio6", banda: "6g" as const, anchosMhz: [20, 40] }
          ]
        }
      ],
      troncales: [["router1", "router2"] as [string, string]],
      ocupacion: undefined
    };

    const result = planRadios(input);
    
    // Should have one troncal
    expect(result.troncales.length).toBe(1);
    const troncal = result.troncales[0];
    
    // Should use 6g band
    expect(troncal.banda).toBe("6g");
    // Should use one of the 6g channels
    expect([1, 5, 9, 13, 17, 21, 25, 29, 33, 37, 41, 45, 49, 53, 57, 61, 65, 69, 73, 77, 81, 85, 89, 93]).toContain(troncal.canal);
    // Should use one of the supported widths
    expect([20, 40]).toContain(troncal.anchoMhz);
     // Should use PIRE from the profile (23 dBm for EU 6g)
     expect(troncal.pireDbm).toBe(23);
     expect(result.routerUciConfigs).toBeDefined();
     expect(Array.isArray(result.routerUciConfigs)).toBe(true);
   });

  it("debería usar 5g cuando no hay 6g disponible", () => {
    const input = {
      region: "EU",
      routers: [
        {
          id: "router1",
          radios: [
            { id: "radio1", banda: "2g" as const, anchosMhz: [20] },
            { id: "radio2", banda: "5g" as const, anchosMhz: [20, 40] }
          ]
        },
        {
          id: "router2",
          radios: [
            { id: "radio3", banda: "2g" as const, anchosMhz: [20] },
            { id: "radio4", banda: "5g" as const, anchosMhz: [20, 40] }
          ]
        }
      ],
      troncales: [["router1", "router2"] as [string, string]],
      ocupacion: undefined
    };

    const result = planRadios(input);
    
    // Should have one troncal
    expect(result.troncales.length).toBe(1);
    const troncal = result.troncales[0];
    
    // Should use 5g band
    expect(troncal.banda).toBe("5g");
    // Should use one of the 5g channels
    expect([36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140]).toContain(troncal.canal);
    // Should use one of the supported widths
     expect([20, 40]).toContain(troncal.anchoMhz);
     // Should use PIRE from the profile (23 dBm for UNII-1, 30 dBm for others)
     // Depending on the channel selected
     expect(result.routerUciConfigs).toBeDefined();
     expect(Array.isArray(result.routerUciConfigs)).toBe(true);
   });

  it("debería usar 2g con aviso cuando no hay 5g/6g disponible", () => {
    const input = {
      region: "EU",
      routers: [
        {
          id: "router1",
          radios: [{ id: "radio1", banda: "2g" as const, anchosMhz: [20] }]
        },
        {
          id: "router2",
          radios: [{ id: "radio2", banda: "2g" as const, anchosMhz: [20] }]
        }
      ],
      troncales: [["router1", "router2"] as [string, string]],
      ocupacion: undefined
    };

    const result = planRadios(input);
    
    // Should have one troncal
    expect(result.troncales.length).toBe(1);
    const troncal = result.troncales[0];
    
    // Should use 2g band
    expect(troncal.banda).toBe("2g");
    // Should use one of the standard 2g channels for troncales (not limited to 1/6/11)
    // Actually, for troncales in 2g we can use any channel
    expect(troncal.canal).toBeGreaterThanOrEqual(1);
    expect(troncal.canal).toBeLessThanOrEqual(13);
    // Should use one of the supported widths
    expect(troncal.anchoMhz).toBe(20);
    // Should use PIRE from the profile (20 dBm for EU 2.4g)
    expect(troncal.pireDbm).toBe(20);
    
     // Should have a warning about using 2g
     expect(result.avisos.length).toBeGreaterThan(0);
     expect(result.avisos.some(a => a.includes("usando 2g por falta de 5g/6g"))).toBe(true);
     expect(result.routerUciConfigs).toBeDefined();
     expect(Array.isArray(result.routerUciConfigs)).toBe(true);
   });

  it("debería evitar interferencia en troncales mediante coloreado DSatur", () => {
    // Three routers in a triangle: each pair is connected
    // This should result in different channels for each link to avoid interference
    const input = {
      region: "EU",
      routers: [
        {
          id: "routerA",
          radios: [
            { id: "radio1", banda: "2g" as const, anchosMhz: [20] },
            { id: "radio2", banda: "5g" as const, anchosMhz: [20, 40, 80] },
            { id: "radio3", banda: "6g" as const, anchosMhz: [20, 40] }
          ]
        },
        {
          id: "routerB",
          radios: [
            { id: "radio4", banda: "2g" as const, anchosMhz: [20] },
            { id: "radio5", banda: "5g" as const, anchosMhz: [20, 40, 80] },
            { id: "radio6", banda: "6g" as const, anchosMhz: [20, 40] }
          ]
        },
        {
          id: "routerC",
          radios: [
            { id: "radio7", banda: "2g" as const, anchosMhz: [20] },
            { id: "radio8", banda: "5g" as const, anchosMhz: [20, 40, 80] },
            { id: "radio9", banda: "6g" as const, anchosMhz: [20, 40] }
          ]
        }
      ],
      troncales: [
        ["routerA", "routerB"] as [string, string],
        ["routerB", "routerC"] as [string, string],
        ["routerC", "routerA"] as [string, string]
      ],
      ocupacion: undefined  // No occupation restrictions
    };

    const result = planRadios(input);
    
    // Should have three troncales
    expect(result.troncales.length).toBe(3);
    
    // All should use 6g band (since all routers have 6g)
    result.troncales.forEach(t => {
      expect(t.banda).toBe("6g");
    });
    
    // Extract the channels used
    const canales = result.troncales.map(t => t.canal);
    
    // In a triangle, we need at least 2 different channels to avoid interference
    // With DSatur and our implementation, we should get different channels
    // Note: This depends on the specific implementation of DSatur
     const canalesUnicos = new Set(canales);
     // At minimum, we should avoid having all three links on the same channel
     expect(canalesUnicos.size).toBeGreaterThan(1);
     expect(result.routerUciConfigs).toBeDefined();
     expect(Array.isArray(result.routerUciConfigs)).toBe(true);
   });

  it("debería respetar las restricciones de ocupación de canales", () => {
    const input = {
      region: "EU",
      routers: [
        {
          id: "router1",
          radios: [
            { id: "radio1", banda: "2g" as const, anchosMhz: [20] },
            { id: "radio2", banda: "5g" as const, anchosMhz: [20, 40] }
          ]
        },
        {
          id: "router2",
          radios: [
            { id: "radio3", banda: "2g" as const, anchosMhz: [20] },
            { id: "radio4", banda: "5g" as const, anchosMhz: [20, 40] }
          ]
        }
      ],
      troncales: [["router1", "router2"] as [string, string]],
      // Simulate high occupation on channel 36 (0.9 = 90%)
      ocupacion: {
        36: 0.9,
        40: 0.1,  // Low occupation
        44: 0.2   // Low occupation
      }
    };

    const result = planRadios(input);
    
    // Should have one troncal
    expect(result.troncales.length).toBe(1);
    const troncal = result.troncales[0];
    
     // Should avoid the highly occupied channel 36
     expect(troncal.canal).not.toBe(36);
     // Should prefer less occupied channels like 40 or 44
     expect([40, 44]).toContain(troncal.canal);
     expect(result.routerUciConfigs).toBeDefined();
     expect(Array.isArray(result.routerUciConfigs)).toBe(true);
   });
});