import { describe, it, expect } from "vitest";
import { agruparDispositivos, nombreEquipo } from "@/lib/network/agrupar-dispositivos";
import type { DispositivoMallaRow } from "@/lib/network/malla-neuronas";

function fila(parcial: Partial<DispositivoMallaRow>): DispositivoMallaRow {
  return {
    neuronId: "n-x",
    nombre: "Dispositivo",
    plataforma: "macOS",
    tipo: "desktop",
    online: false,
    esEsteDispositivo: false,
    enlace: { estado: "sin-vinculo" },
    ...parcial,
  };
}

describe("nombreEquipo", () => {
  it("quita el emoji inicial y el sufijo «· Navegador <versión>»", () => {
    expect(nombreEquipo("💻 macOS · Chrome 152")).toBe("macos");
    expect(nombreEquipo("macOS · Chrome 152 · fallido".replace(" · fallido", ""))).toBe("macos");
    expect(nombreEquipo("Neurona macOS")).toBe("neurona macos");
  });
});

describe("agruparDispositivos", () => {
  it("una Mac con 3 instalaciones (distinto navegador/versión) → 1 grupo", () => {
    const filas = [
      fila({ neuronId: "n1", nombre: "💻 macOS · Chrome 152", online: true, esEsteDispositivo: true }),
      fila({ neuronId: "n2", nombre: "macOS · Chrome 153", online: true }),
      fila({ neuronId: "n3", nombre: "💻 macOS · Chrome 152", online: false, ultimoVisto: "2026-09-20T10:00:00Z" }),
    ];
    const { activos, desconectados } = agruparDispositivos(filas, Date.now());
    expect(activos).toHaveLength(1);
    expect(desconectados).toHaveLength(0);
    expect(activos[0].filas).toHaveLength(3);
  });

  it("una tablet queda en su propio grupo aunque esté en línea a la vez", () => {
    const filas = [
      fila({ neuronId: "n1", nombre: "💻 macOS · Chrome 152", online: true, esEsteDispositivo: true }),
      fila({ neuronId: "n2", nombre: "Neurona Maggaboard", plataforma: "Android", tipo: "tablet", online: true }),
    ];
    const { activos } = agruparDispositivos(filas, Date.now());
    expect(activos).toHaveLength(2);
  });

  it("un grupo entero sin filas en línea va a desconectados (plegable)", () => {
    const filas = [
      fila({ neuronId: "n1", nombre: "💻 macOS · Chrome 152", online: true }),
      fila({ neuronId: "n2", nombre: "💻 macOS · Chrome 149", online: false, ultimoVisto: "2026-09-01T00:00:00Z" }),
      fila({
        neuronId: "n3",
        nombre: "Viejo portátil",
        plataforma: "Windows",
        tipo: "laptop",
        online: false,
        ultimoVisto: "2026-09-10T00:00:00Z",
      }),
    ];
    const { activos, desconectados } = agruparDispositivos(filas, Date.now());
    expect(activos).toHaveLength(1);
    expect(desconectados).toHaveLength(1);
    expect(desconectados[0].titulo).toBe("viejo portátil");
  });

  it("desconectados se ordenan por el ultimoVisto más reciente del grupo", () => {
    const filas = [
      fila({ neuronId: "n1", nombre: "A uno", plataforma: "Linux", tipo: "server", ultimoVisto: "2026-09-01T00:00:00Z" }),
      fila({ neuronId: "n2", nombre: "B dos", plataforma: "Windows", tipo: "laptop", ultimoVisto: "2026-09-20T00:00:00Z" }),
    ];
    const { desconectados } = agruparDispositivos(filas, Date.now());
    expect(desconectados.map((g) => g.titulo)).toEqual(["b dos", "a uno"]);
  });

  it("este dispositivo manda: su grupo va primero aunque otro también esté en línea", () => {
    const filas = [
      fila({ neuronId: "n1", nombre: "Tablet", plataforma: "Android", tipo: "tablet", online: true }),
      fila({ neuronId: "n2", nombre: "💻 macOS · Chrome 152", online: true, esEsteDispositivo: true }),
    ];
    const { activos } = agruparDispositivos(filas, Date.now());
    expect(activos[0].filas[0].neuronId).toBe("n2");
  });
});
