import { describe, it, expect } from "vitest";
import { claveTarea, claveLatido } from "../mando/ramificacion";

describe("claveTarea (Ola 248 · ids repetidos entre olas)", () => {
  it("un mismo id en dos olas distintas produce claves distintas", () => {
    // Regresión del 2026-09-05: R1-R4 existían en la Ola 227 y eso ocultaba la Ola 247.
    expect(claveTarea("Ola 227", "R2")).not.toBe(claveTarea("Ola 247 · rito fluido", "R2"));
  });

  it("la misma ola y el mismo id producen la misma clave", () => {
    expect(claveTarea("Ola 247 · rito fluido", "R3")).toBe(claveTarea("Ola 247 · rito fluido", "R3"));
  });
});

describe("claveLatido (cola normalizada)", () => {
  it("ignora el prefijo «cola-» y el sufijo «.json» (bus vs disco)", () => {
    expect(claveLatido("cola-247-rito-fluido.json", "R2")).toBe(claveLatido("247-rito-fluido", "R2"));
  });

  it("latidos del mismo id en colas distintas no se mezclan", () => {
    expect(claveLatido("cola-227", "R2")).not.toBe(claveLatido("cola-247-rito-fluido.json", "R2"));
  });

  it("una cola ya normalizada se queda como está", () => {
    expect(claveLatido("247-rito-fluido", "R2")).toBe("247-rito-fluido|R2");
  });
});
