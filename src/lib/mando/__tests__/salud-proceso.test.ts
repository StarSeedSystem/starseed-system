// src/lib/mando/__tests__/salud-proceso.test.ts
// Pruebas del módulo puro de salud: entrada → salida, sin red ni disco.

import { describe, it, expect } from "vitest";
import { saludDeTarea, saludDeAgente, type EntradaSalud } from "../salud-proceso";

describe("saludDeTarea", () => {
  it("tarea sana: escribiendo y produciendo", () => {
    const s = saludDeTarea({ estado: "escribiendo", bytesEscritos: 120, registroCrece: true }, 1000);
    expect(s.puntos).toBe(10);
    expect(s.motivo).toBe("escribiendo y produciendo");
    expect(s.señal).toBe("bien");
  });

  it("tarea muda: silencio prolongado", () => {
    // Sin bytes, sin registro creciendo y 300 s en etapa: baja la salud.
    const s = saludDeTarea({ etapa: "escribiendo", segundosEnEtapa: 300 }, 2000);
    expect(s.puntos).toBe(6); // baja pero aún no toca fondo
    expect(s.motivo).toContain("min sin escribir un byte");
    expect(s.señal).toBe("vigilar");
  });

  it("tarea que reparó", () => {
    // Reparación automática resta puntos pero no llega al fondo.
    const s = saludDeTarea({ reparacionAutomatica: true, intentosModelo: 1 }, 3000);
    expect(s.puntos).toBeGreaterThanOrEqual(3);
    expect(s.puntos).toBeLessThanOrEqual(6);
    expect(s.motivo).toContain("reparó");
  });

  it("tarea rechazada", () => {
    const s = saludDeTarea({ estado: "rechazada" }, 4000);
    expect(s.puntos).toBe(1);
    expect(s.motivo).toContain("rechazada");
    expect(s.señal).toBe("mal");
  });
});

describe("saludDeAgente", () => {
  it("agente con una sana y una muda", () => {
    const tareas: EntradaSalud[] = [
      { estado: "escribiendo", bytesEscritos: 120, registroCrece: true },
      { estado: "sin cambios" },
    ];
    const s = saludDeAgente(tareas, 5000);
    expect(s.puntos).toBe(1); // la muda domina
    expect(s.motivo).toContain("una sana y una muda");
    expect(s.señal).toBe("mal");
  });
});
