import { describe, it, expect } from "vitest";
import { type AdnAvatar } from "@/lib/avatares/adn/adn";
import { type CambioAvatar } from "@/lib/avatares/adn/cambios";
import { proponerCambioAvatar, aplicarCambioAvatar } from "@/lib/avatares/adaptadores/propuesta-avatar";
import { type Ambito } from "@/lib/genesis/operaciones";
import { aplicarCambio } from "@/lib/avatares/adn/cambios";

describe("propuesta-avatar adapter", () => {
  const baseAdn: AdnAvatar = {
    v: 1,
    id: "avatar-1",
    nombre: "Avatar Test",
    dueno: { tipo: "perfil", id: "user-1" },
    base: { tipo: "orbe" },
    esqueleto: { tipo: "ninguno", articulaciones: 0 },
    morfologia: {},
    materiales: {},
    piezas: [],
    expresionBase: {},
    aura: { tono: 0, intensidad: 0.5, ligadaEmocion: true },
    movimiento: { energia: 0.5, amplitud: 0.5, ritmo: 0.5, postura: 0.5 },
    visibilidad: "privado",
    procedencia: [],
    rev: 0,
  };

    it("should validate a valid avatar change operation", () => {
      const propuesto: AdnAvatar = {
        ...baseAdn,
        nombre: "Avatar Test Cambiado",
        rev: 1,
      };
      const ambito: Ambito = { tipo: "persona" };
      const resultado = proponerCambioAvatar(baseAdn.id, baseAdn, propuesto, "Cambiar nombre", ambito);
      expect(resultado.ok).toBe(true);
      if (resultado.ok && resultado.op.tipo === "avatar.cambiar") {
        const op = resultado.op as { tipo: "avatar.cambiar"; datos: { ref: string; revBase: number; cambios: CambioAvatar[] } };
        expect(op.datos.ref).toBe(baseAdn.id);
        expect(op.datos.revBase).toBe(baseAdn.rev);
        expect(Array.isArray(op.datos.cambios)).toBe(true);
        // Should have one cambio for nombre
        expect(op.datos.cambios.length).toBe(1);
        expect(op.datos.cambios[0].op).toBe("nombre");
      }
    });

    it("should reject if ref is empty", () => {
      const propuesto: AdnAvatar = { ...baseAdn, nombre: "Cambio" };
      const ambito: Ambito = { tipo: "persona" };
      const resultado = proponerCambioAvatar("", baseAdn, propuesto, "Cambiar nombre", ambito);
      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.problemas).toContain("ref");
      }
    });

  it("should apply changes correctly", () => {
    const cambioNombre: CambioAvatar = { op: "nombre", valor: "Avatar Nuevo" };
    const cambios: CambioAvatar[] = [cambioNombre];
    const datos = { ref: baseAdn.id, revBase: baseAdn.rev, cambios };
    const nuevoAdn = aplicarCambioAvatar(baseAdn, datos);
    expect(nuevoAdn.nombre).toBe("Avatar Nuevo");
    // rev should be incremented by aplicarCambioAvatar? Actually aplicarCambioAvatar uses aplicarCambio which increments rev per change.
    // Since we apply one cambio, rev should be baseAdn.rev + 1
    expect(nuevoAdn.rev).toBe(baseAdn.rev + 1);
  });
});