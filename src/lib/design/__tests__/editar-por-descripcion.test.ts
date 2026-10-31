import { describe, it, expect } from "vitest";
import {
  ANCHOS_OBLIGADOS,
  colorARgb,
  contraste,
  validarParcheDiseno,
} from "../editar-por-descripcion";

/* FSH1018N — editar el diseño describiéndolo: lista blanca, guardas AA/44 px/anchos y nivel «proponer» */

describe("editar-por-descripcion · puertas del parche", () => {
  it("la matriz de anchos del OS es 360, 768, 1280 y 1920", () => {
    expect(ANCHOS_OBLIGADOS).toEqual([360, 768, 1280, 1920]);
  });

  it("acepta tokens de la lista blanca y devuelve el parche seguro (nivel «proponer»)", () => {
    const r = validarParcheDiseno(
      { tokens: { "radio.tarjeta": "24px", "material.global": "cristal", "color.acento": "#0a8f3c" } },
      { ambito: "perfil" },
    );
    expect(r.aplicable).toBe(true);
    expect(r.nivel).toBe("proponer"); // ui-permisos.ts: nada se aplica sin la persona
    expect(r.parcheSeguro).toEqual({ "radio.tarjeta": "24", "material.global": "cristal", "color.acento": "#0a8f3c" });
  });

  it("rechaza tokens fuera de la lista blanca y valores fuera de sus variantes", () => {
    const r = validarParcheDiseno({ tokens: { "dock.oculto": true, "radio.tarjeta": "17px" } }, { ambito: "perfil" });
    expect(r.aplicable).toBe(false);
    expect(r.parcheSeguro).toEqual({}); // nunca parcial
    expect(r.motivos[0]).toContain("lista blanca");
    expect(r.motivos[1]).toContain("no es una variante");
  });

  it("rechaza variantes pedidas fuera de la lista blanca", () => {
    const r = validarParcheDiseno({ tokens: {}, variantes: ["holograma"] }, { ambito: "pagina" });
    expect(r.aplicable).toBe(false);
    expect(r.motivos[0]).toContain("holograma");
  });

  it("nunca oculta ni desactiva un control esencial", () => {
    const r = validarParcheDiseno({ tokens: {}, ocultarOdesactivar: ["dock", "navegación"] }, { ambito: "perfil" });
    expect(r.aplicable).toBe(false);
    expect(r.motivos.join(" ")).toContain("prohibido");
  });

  it("mide el contraste AA del texto y descarta lo que quede por debajo", () => {
    expect(validarParcheDiseno({ tokens: {} }, { ambito: "perfil", fondo: "#ffffff", texto: "#767676" }).aplicable).toBe(true);
    const malo = validarParcheDiseno({ tokens: {} }, { ambito: "perfil", fondo: "#ffffff", texto: "#777777" });
    expect(malo.aplicable).toBe(false);
    expect(malo.motivos[0]).toContain("Contraste insuficiente");
  });

  it("rechaza dianas táctiles por debajo de 44 px", () => {
    const r = validarParcheDiseno({ tokens: { "diana.altura": "40px" } }, { ambito: "perfil" });
    expect(r.aplicable).toBe(false);
    expect(r.motivos.join(" ")).toContain("44 px");
  });

  it("anchos del OS: fuera de la matriz se rechaza y la escala φ no cabe en pantallas estrechas", () => {
    const r1 = validarParcheDiseno({ tokens: { "tipografia.escala@500": "1.618" } }, { ambito: "perfil" });
    expect(r1.motivos[0]).toContain("fuera de la matriz");
    const r2 = validarParcheDiseno({ tokens: { "tipografia.escala@360": "1.618" } }, { ambito: "perfil" });
    expect(r2.motivos[0]).toContain("máximo 1,25");
    const bien = validarParcheDiseno(
      { tokens: { "tipografia.escala@360": "1.25", "tipografia.escala@1280": "1.618" } },
      { ambito: "perfil" },
    );
    expect(bien.aplicable).toBe(true);
    expect(bien.parcheSeguro).toEqual({ "tipografia.escala": "1.618" });
  });

  it("nivel «nada» no propone y «cuenta» con «aplicar» se rebaja a propuesta", () => {
    const nada = validarParcheDiseno({ tokens: {} }, { ambito: "perfil", nivel: "nada" });
    expect(nada.aplicable).toBe(false);
    const cuenta = validarParcheDiseno({ tokens: { "material.global": "cristal" } }, { ambito: "cuenta", nivel: "aplicar" });
    expect(cuenta.nivel).toBe("proponer");
    expect(cuenta.motivos.join(" ")).toContain("cuenta");
  });

  it("un parche roto o un color ilegible no pasan la puerta", () => {
    expect(validarParcheDiseno(null, { ambito: "perfil" }).aplicable).toBe(false);
    const color = validarParcheDiseno({ tokens: { "color.texto": "rojo intenso" } }, { ambito: "perfil" });
    expect(color.aplicable).toBe(false);
    expect(color.motivos.join(" ")).toContain("no se entiende");
  });

  it("parsea hex (#rgb) y hsl (incluido el formato espaciado de las vars CSS)", () => {
    expect(colorARgb("#0f0")).toEqual([0, 1, 0]);
    expect(contraste("hsl(0 0% 100%)", "hsl(0 0% 0%)")).toBeCloseTo(21, 0);
    expect(contraste("#fff", "azul")).toBeNull();
  });
});
