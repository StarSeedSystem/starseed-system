import { describe, expect, it } from "vitest";
import { TAMANO_MAX_ADN, adnPorDefecto, esRefInterna, sanearAdn } from "../adn";

const base = () => adnPorDefecto("av1", "Astraura", { tipo: "bot", id: "b1" }, 200);

describe("ADN del avatar", () => {
  it("por defecto es la orbe de siempre, privada y con el tono de la entidad", () => {
    const a = base();
    expect(a.base.tipo).toBe("orbe");
    expect(a.esqueleto).toEqual({ tipo: "ninguno", articulaciones: 0 });
    expect(a.visibilidad).toBe("privado");
    expect(a.aura.tono).toBe(200);
    expect(sanearAdn(a)).toEqual(a);
  });
  it("rechaza lo que no tiene versión, id o dueño válidos", () => {
    expect(sanearAdn(null)).toBeNull();
    expect(sanearAdn({ ...base(), v: 2 })).toBeNull();
    expect(sanearAdn({ ...base(), id: "" })).toBeNull();
    expect(sanearAdn({ ...base(), dueno: { tipo: "cuenta", id: "x" } })).toBeNull();
  });
  it("nunca acepta una URL externa suelta: un VRM sin referencia interna vuelve a ser orbe", () => {
    expect(esRefInterna("biblioteca:avatares/ana.vrm")).toBe(true);
    expect(esRefInterna("https://malo.example/x.vrm")).toBe(false);
    const a = sanearAdn({ ...base(), base: { tipo: "vrm", ref: "https://malo.example/x.vrm" }, esqueleto: { tipo: "vrm-humanoide", articulaciones: 55 } })!;
    expect(a.base).toEqual({ tipo: "orbe" });
    expect(a.esqueleto.tipo).toBe("ninguno");
  });
  it("acota números, normaliza colores y deja una pieza por ranura (gana la última)", () => {
    const a = sanearAdn({
      ...base(), base: { tipo: "vrm", ref: "biblioteca:av/ana.vrm" }, esqueleto: { tipo: "vrm-humanoide", articulaciones: 3 },
      morfologia: { altura: 7, cabeza: -1, inventada: 0.3 },
      materiales: { cabello: { color: "#00AAFF", metal: 2 }, ojos: { color: "azul" } },
      piezas: [{ slot: "cabello", ref: "biblioteca:p/1" }, { slot: "cabello", ref: "biblioteca:p/2", tinte: "#FF0000" }, { slot: "x", ref: "biblioteca:p/3" }],
      aura: { tono: -30, intensidad: 9 },
    })!;
    expect(a.esqueleto.articulaciones).toBe(55);
    expect(a.morfologia).toEqual({ altura: 1, cabeza: 0 });
    expect(a.materiales).toEqual({ cabello: { color: "#00aaff", metal: 1, rugosidad: 0.6, emisivo: 0 } });
    expect(a.piezas).toEqual([{ slot: "cabello", ref: "biblioteca:p/2", tinte: "#ff0000" }]);
    expect(a.aura.tono).toBe(330);
    expect(a.aura.intensidad).toBe(1);
  });
  it("un esqueleto libre (cualquier criatura) admite de 1 a 256 articulaciones", () => {
    const g = { ...base(), base: { tipo: "glb-rig", ref: "biblioteca:av/dragon.glb" } };
    expect(sanearAdn({ ...g, esqueleto: { tipo: "libre", articulaciones: 900 } })!.esqueleto.articulaciones).toBe(256);
    expect(sanearAdn({ ...g, esqueleto: { tipo: "libre", articulaciones: 0 } })!.esqueleto.articulaciones).toBe(1);
  });
  it("la procedencia guarda licencia, atribución y regiones excluidas saneadas", () => {
    const a = sanearAdn({ ...base(), procedencia: [
      { herramienta: "hunyuan3d-mlx", licencia: "Tencent", uso: "restringido-region", regionesExcluidas: ["eu", "GB", "kr", "zzz"] },
      { herramienta: "x", licencia: "y", uso: "inventado" },
    ] })!;
    expect(a.procedencia).toEqual([{ herramienta: "hunyuan3d-mlx", licencia: "Tencent", uso: "restringido-region", regionesExcluidas: ["EU", "GB", "KR"] }]);
  });
  it("un ADN que no cabe en 8 KB se rechaza", () => {
    const regiones = Array.from({ length: 32 }, (_, i) => String.fromCharCode(65 + Math.floor(i / 26), 65 + (i % 26)));
    const procedencia = Array.from({ length: 16 }, (_, i) => ({
      herramienta: `h${i}`.padEnd(60, "h"), licencia: "l".repeat(80), uso: "libre", atribucion: "a".repeat(160), regionesExcluidas: regiones,
    }));
    const saneado = sanearAdn({ ...base(), procedencia: procedencia.slice(0, 4) })!;
    expect(saneado.procedencia).toHaveLength(4);
    expect(JSON.stringify({ ...base(), procedencia }).length).toBeGreaterThan(TAMANO_MAX_ADN);
    expect(sanearAdn({ ...base(), procedencia })).toBeNull();
  });
});
