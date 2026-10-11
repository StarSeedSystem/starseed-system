import { describe, expect, it } from "vitest";
import { adnPorDefecto } from "../adn";
import {
  aplicarCambio, aplicarCambios, claveCambio, crearColaEnvio, debeGuardar, diffAdn, encolar, intervaloEnvioMs, lote, sanearCambio,
  type CambioAvatar,
} from "../cambios";

const orbe = () => adnPorDefecto("av1", "Ana", { tipo: "perfil", id: "p1" });
const vrm = () => aplicarCambio(orbe(), { op: "base", tipo: "vrm", ref: "biblioteca:av/ana.vrm" });

describe("cambios en tiempo real", () => {
  it("aplicar no muta el original, sube la revisión y acota", () => {
    const a = orbe();
    const b = aplicarCambio(a, { op: "morfologia", clave: "altura", valor: 3 });
    expect(a.morfologia.altura).toBeUndefined();
    expect(b.morfologia.altura).toBe(1);
    expect(b.rev).toBe(a.rev + 1);
  });
  it("pasar a VRM pone el esqueleto humanoide; volver a orbe lo quita", () => {
    const b = vrm();
    expect(b.esqueleto).toEqual({ tipo: "vrm-humanoide", articulaciones: 55 });
    expect(aplicarCambio(b, { op: "base", tipo: "orbe" }).esqueleto.tipo).toBe("ninguno");
  });
  it("un cambio inválido (URL externa, color raro) no cambia nada", () => {
    const a = vrm();
    expect(aplicarCambio(a, { op: "pieza", slot: "cabello", ref: "https://x.example/p.glb" })).toBe(a);
    expect(aplicarCambio(a, { op: "material", slot: "ojos", campo: "color", valor: "verde" })).toBe(a);
    expect(sanearCambio({ op: "borrar-todo" })).toBeNull();
  });
  it("material, pieza, aura y movimiento", () => {
    const b = aplicarCambios(vrm(), [
      { op: "material", slot: "cabello", campo: "color", valor: "#00AAFF" },
      { op: "pieza", slot: "accesorio-1", ref: "biblioteca:p/gafas", tinte: "#000000" },
      { op: "aura", campo: "tono", valor: 400 },
      { op: "movimiento", campo: "energia", valor: 0.9 },
    ]);
    expect(b.materiales.cabello?.color).toBe("#00aaff");
    expect(b.piezas).toEqual([{ slot: "accesorio-1", ref: "biblioteca:p/gafas", tinte: "#000000" }]);
    expect(b.aura.tono).toBe(40);
    expect(b.movimiento.energia).toBe(0.9);
    expect(aplicarCambio(b, { op: "pieza", slot: "accesorio-1", ref: null }).piezas).toEqual([]);
  });
  it("diff → aplicar lleva exactamente de A a B (se vota el diff)", () => {
    const a = vrm();
    const b = aplicarCambios(a, [
      { op: "morfologia", clave: "hombros", valor: 0.8 }, { op: "expresion", clave: "happy", valor: 0.4 },
      { op: "material", slot: "piel", campo: "color", valor: "#c68642" }, { op: "pieza", slot: "cabello", ref: "biblioteca:p/1" },
      { op: "visibilidad", valor: "publico" }, { op: "nombre", valor: "Ana 3D" },
    ]);
    const d = diffAdn(a, b);
    const c = aplicarCambios(a, d);
    expect({ ...c, rev: 0 }).toEqual({ ...b, rev: 0 });
    expect(diffAdn(b, b)).toEqual([]);
  });
  it("las claves agrupan: mover un deslizador 60 veces viaja como un solo cambio", () => {
    const cola = crearColaEnvio();
    for (let i = 0; i <= 60; i++) encolar(cola, { op: "morfologia", clave: "altura", valor: i / 60 });
    encolar(cola, { op: "material", slot: "ojos", campo: "color", valor: "#10b981" });
    const l = lote(cola, 1000, 2)!;
    expect(l).toHaveLength(2);
    expect(l[0]).toEqual({ op: "morfologia", clave: "altura", valor: 1 });
    expect(claveCambio(l[1])).toBe("material.ojos.color");
  });
  it("presupuesto de red: 10 Hz, menos con mucha gente y NADA si no hay nadie mirando", () => {
    expect(intervaloEnvioMs(0)).toBe(Infinity);
    expect(intervaloEnvioMs(1)).toBe(100);
    expect(intervaloEnvioMs(5)).toBe(150);
    expect(intervaloEnvioMs(12)).toBe(250);
    const cola = crearColaEnvio();
    const c: CambioAvatar = { op: "aura", campo: "intensidad", valor: 0.3 };
    encolar(cola, c);
    expect(lote(cola, 0, 0)).toBeNull();
    expect(cola.pendientes.size).toBe(0);
    encolar(cola, c);
    expect(lote(cola, 1000, 1)).toEqual([c]);
    encolar(cola, c);
    expect(lote(cola, 1050, 1)).toBeNull();
    expect(lote(cola, 1100, 1)).toEqual([c]);
  });
  it("guardar: tras 5 s de calma y como mucho uno cada 30 s, o al cerrar", () => {
    const g = { sinGuardar: true, ultimoCambio: 100_000, ultimoGuardado: 80_000, cerrando: false };
    expect(debeGuardar({ ...g, ahora: 103_000 })).toBe(false);
    expect(debeGuardar({ ...g, ahora: 105_000 })).toBe(false);
    expect(debeGuardar({ ...g, ahora: 110_000 })).toBe(true);
    expect(debeGuardar({ ...g, ahora: 101_000, cerrando: true })).toBe(true);
    expect(debeGuardar({ ...g, sinGuardar: false, ahora: 200_000, cerrando: true })).toBe(false);
  });
});
