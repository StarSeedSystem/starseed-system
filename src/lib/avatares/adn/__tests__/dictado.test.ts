import { describe, expect, it } from "vitest";
import { adnPorDefecto } from "../adn";
import { aplicarCambios } from "../cambios";
import { COLORES, cambiosDesdeFrase, normalizar, tonoDe } from "../dictado";

const adn = () => adnPorDefecto("av1", "Ana", { tipo: "perfil", id: "p1" });

describe("dictado sin modelo", () => {
  it("normaliza tildes y mayúsculas", () => {
    expect(normalizar("  Más ALTO, pequeño ")).toBe("mas alto, pequeno");
  });
  it("colores por ranura y aura por tono", () => {
    const { cambios, sinEntender } = cambiosDesdeFrase("Pelo azul, ojos verdes y aura dorada", adn());
    expect(sinEntender).toEqual([]);
    expect(cambios).toEqual([
      { op: "material", slot: "cabello", campo: "color", valor: COLORES.azul },
      { op: "material", slot: "ojos", campo: "color", valor: COLORES.verde },
      { op: "aura", campo: "tono", valor: tonoDe(COLORES.dorado) },
    ]);
  });
  it("relativos: «más alto» sube desde donde está; «un poco», «mucho más»", () => {
    const a = adn();
    expect(cambiosDesdeFrase("más alto", a).cambios).toEqual([{ op: "morfologia", clave: "altura", valor: 0.6 }]);
    expect(cambiosDesdeFrase("un poco más bajo", a).cambios[0]).toEqual({ op: "morfologia", clave: "altura", valor: 0.45 });
    expect(cambiosDesdeFrase("mucho más fuerte", a).cambios[0]).toEqual({ op: "morfologia", clave: "complexion", valor: 0.7 });
  });
  it("partes del cuerpo: la dirección la da el adjetivo, no el «más»", () => {
    const a = adn();
    expect(cambiosDesdeFrase("cabeza más pequeña", a).cambios).toEqual([{ op: "morfologia", clave: "cabeza", valor: 0.4 }]);
    expect(cambiosDesdeFrase("piernas más largas", a).cambios).toEqual([{ op: "morfologia", clave: "piernas", valor: 0.6 }]);
    expect(cambiosDesdeFrase("hombros menos anchos", a).cambios).toEqual([{ op: "morfologia", clave: "hombros", valor: 0.4 }]);
  });
  it("expresiones exclusivas y carácter del movimiento", () => {
    const a = adn();
    const feliz = cambiosDesdeFrase("sonríe", a).cambios;
    expect(feliz).toContainEqual({ op: "expresion", clave: "happy", valor: 1 });
    expect(feliz).toContainEqual({ op: "expresion", clave: "sad", valor: 0 });
    expect(cambiosDesdeFrase("más tranquilo", a).cambios).toEqual([{ op: "movimiento", campo: "energia", valor: 0.4 }]);
    expect(cambiosDesdeFrase("con más energía", a).cambios).toEqual([{ op: "movimiento", campo: "energia", valor: 0.6 }]);
  });
  it("lo que no entiende va a Astraura; los valores nunca se salen de 0…1", () => {
    const r = cambiosDesdeFrase("ponle alas de mariposa, más alto", adn());
    expect(r.sinEntender).toEqual(["ponle alas de mariposa"]);
    let a = adn();
    for (let i = 0; i < 20; i++) a = aplicarCambios(a, cambiosDesdeFrase("mucho más alto", a).cambios);
    expect(a.morfologia.altura).toBe(1);
  });
});
