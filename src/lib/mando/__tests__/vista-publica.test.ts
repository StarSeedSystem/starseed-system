import { describe, it, expect } from "vitest";
import { vistaPublica } from "../vista-publica";

const baseEstado = {
  ambito: { nombre: "MiAmbito", visibilidad: "publico" as const },
  olas: [
    {
      nombre: "Ola 1",
      avance: 0.5,
      tareas: [
        { id: "t1", titulo: "Tarea pública", estado: "pendiente", prompt: "PROMPT-SECRETO", archivos: ["ruta/privada.ts"], registro: {}, proveedor: "proveedor-x" },
      ],
    },
  ],
  integradas: [
    { titulo: "Integración 1", fecha: "2026-01-01T00:00:00Z", archivos: ["ruta/privada.ts"], commit: "abc123" },
  ],
  motor: { estado: "corriendo", ultimo_reporte: Date.now() - 300000, proveedores: ["proveedor-x"] },
  medidores: { creditos: 123.45 },
  chat: [
    { canal: "publico", autor: "usuario1", texto: "Hola público" },
    { canal: "interno", autor: "sistema", texto: "Secreto interno" },
  ],
};

describe("vistaPublica", () => {
  it("devuelve null si visibilidad es privado", () => {
    const estado = { ...baseEstado, ambito: { nombre: "X", visibilidad: "privado" as const } };
    expect(vistaPublica(estado)).toBeNull();
  });

  it("devuelve null si visibilidad es miembros", () => {
    const estado = { ...baseEstado, ambito: { nombre: "X", visibilidad: "miembros" as const } };
    expect(vistaPublica(estado)).toBeNull();
  });

  it("devuelve vista pública sin datos privados", () => {
    const res = vistaPublica(baseEstado);
    expect(res).not.toBeNull();
    if (!res) return;

    const json = JSON.stringify(res);
    expect(json).not.toContain("PROMPT-SECRETO");
    expect(json).not.toContain("ruta/privada.ts");
    expect(json).not.toContain("proveedor-x");
    expect(json).not.toContain("123.45");
    expect(json).not.toContain("Secreto interno");
  });

  it("incluye solo tareas con titulo y estado", () => {
    const res = vistaPublica(baseEstado);
    expect(res?.olas[0].tareas[0]).toEqual({ titulo: "Tarea pública", estado: "pendiente" });
  });

  it("incluye solo integradas con titulo y fecha", () => {
    const res = vistaPublica(baseEstado);
    expect(res?.integradas[0]).toMatchObject({ titulo: "Integración 1" });
    expect(typeof res?.integradas[0].fecha).toBe("string");
  });

  it("motor incluye estado y haceMin", () => {
    const res = vistaPublica(baseEstado);
    expect(res?.motor).toHaveProperty("estado", "corriendo");
    expect(typeof res?.motor.haceMin).toBe("number");
  });

  it("avanceMedio calcula promedio", () => {
    const estado = {
      ...baseEstado,
      olas: [
        { nombre: "A", avance: 0.2, tareas: [] },
        { nombre: "B", avance: 0.8, tareas: [] },
      ],
    };
    const res = vistaPublica(estado);
    expect(res?.avanceMedio).toBeCloseTo(0.5);
  });

  it("chat filtra solo canal publico", () => {
    const res = vistaPublica(baseEstado);
    expect(res?.chat).toHaveLength(1);
    expect(res?.chat[0]).toEqual({ autor: "usuario1", texto: "Hola público" });
  });
});
