import { describe, it, expect } from "vitest";
import { type AdnAvatar } from "@/lib/avatares/adn/adn";
import { proponerCambioAvatar, aplicarCambioAvatar } from "@/lib/avatares/adaptadores/propuesta-avatar";
import { type Ambito } from "@/lib/genesis/operaciones";
import { validarOperacion, type ContextoValidacion } from "@/lib/genesis/operaciones";
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
    console.log('resultado', resultado);
    expect(resultado.ok).toBe(true);
    expect(resultado.op.tipo).toBe("avatar.cambiar");
    expect(resultado.op.datos.ref).toBe(baseAdn.id);
    expect(resultado.op.datos.revBase).toBe(baseAdn.rev);
    expect(Array.isArray(resultado.op.datos.cambios)).toBe(true);
    // Should have one cambio for nombre
    expect(resultado.op.datos.cambios.length).toBe(1);
    expect(resultado.op.datos.cambios[0].op).toBe("nombre");
  });

  it("should reject if ref is empty", () => {
    const propuesto: AdnAvatar = { ...baseAdn, nombre: "Cambio" };
    const ambito: Ambito = { tipo: "persona" };
    const resultado = proponerCambioAvatar("", baseAdn, propuesto, "Cambiar nombre", ambito);
    console.log('resultado empty ref', resultado);
    expect(resultado.ok).toBe(false);
     expect(resultado.problemas).toContain("«ref» está vacío.");
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

   // Tests for validarOperacion (avatar.cambiar)
   describe("validarOperacion for avatar.cambiar", () => {
     const ctx: ContextoValidacion = { ambito: { tipo: "persona" } };
     const baseDatos = {
       ref: "avatar-1",
       revBase: 0,
       cambios: [{ op: "nombre", valor: "Test" } as CambioAvatar],
     };

     it("should reject negative revBase", () => {
       const resultado = validarOperacion(
         { tipo: "avatar.cambiar", motivo: "test", datos: { ...baseDatos, revBase: -1 } },
         ctx
       );
       expect(resultado.ok).toBe(false);
       expect(resultado.problemas).toContain("«revBase» debe ser un número entero no negativo.");
     });

     it("should reject non-integer revBase", () => {
       const resultado = validarOperacion(
         { tipo: "avatar.cambiar", motivo: "test", datos: { ...baseDatos, revBase: 1.5 } },
         ctx
       );
       expect(resultado.ok).toBe(false);
       expect(resultado.problemas).toContain("«revBase» debe ser un número entero no negativo.");
     });

     it("should reject when cambios is not an array", () => {
       const resultado = validarOperacion(
         { tipo: "avatar.cambiar", motivo: "test", datos: { ...baseDatos, cambios: {} as any } },
         ctx
       );
       expect(resultado.ok).toBe(false);
       expect(resultado.problemas).toContain("«cambios» debe ser una lista.");
     });
   });

   // Test for aplicarCambioAvatar with revBase mismatch
   it("should return original ADN when revBase does not match", () => {
     const propuesto: AdnAvatar = {
       ...baseAdn,
       nombre: "Avatar Test Cambiado",
       rev: 1,
     };
     const cambioNombre: CambioAvatar = { op: "nombre", valor: "Avatar Nuevo" };
     const cambios: CambioAvatar[] = [cambioNombre];
     // Use a revBase that does not match baseAdn.rev (which is 0)
     const datos = { ref: baseAdn.id, revBase: 999, cambios };
     const nuevoAdn = aplicarCambioAvatar(baseAdn, datos);
     // Should return the original ADN unchanged
     expect(nuevoAdn).toBe(baseAdn);
     // Also check that the nombre is not changed
     expect(nuevoAdn.nombre).toBe(baseAdn.nombre);
   });
 });