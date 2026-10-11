import { describe, expect, it } from "vitest";
import { adnPorDefecto } from "../adn";
import { aplicarCambios } from "../cambios";
import { PRESUPUESTO_POR_CALIDAD, adnParaCalidad } from "../calidad";
import { decidirCambioAvatar } from "../permisos";

const vestido = () => aplicarCambios(adnPorDefecto("av1", "Ana", { tipo: "perfil", id: "p1" }), [
  { op: "base", tipo: "vrm", ref: "biblioteca:av/ana.vrm" },
  ...(["mascota", "cabeza", "cabello", "torso", "accesorio-2"] as const).map((slot) => ({ op: "pieza" as const, slot, ref: `biblioteca:p/${slot}` })),
  { op: "expresion", clave: "lookLeft", valor: 0.2 }, { op: "expresion", clave: "aa", valor: 0.1 }, { op: "expresion", clave: "happy", valor: 0.5 },
]);

describe("calidad automática", () => {
  it("los presupuestos crecen con el nivel", () => {
    const n = ["orbe-manos", "cabeza-manos", "vrm-ligero", "vrm", "vrm-completo"] as const;
    for (let i = 1; i < n.length; i++) expect(PRESUPUESTO_POR_CALIDAD[n[i]].triangulos).toBeGreaterThan(PRESUPUESTO_POR_CALIDAD[n[i - 1]].triangulos);
  });
  it("en el nivel más bajo eres tu orbe con tu aura", () => {
    const { adn } = adnParaCalidad(vestido(), "orbe-manos");
    expect(adn.base.tipo).toBe("orbe");
    expect(adn.piezas).toEqual([]);
  });
  it("en cabeza-manos quedan las piezas y expresiones que más identifican", () => {
    const { adn } = adnParaCalidad(vestido(), "cabeza-manos");
    expect(adn.piezas.map((p) => p.slot)).toEqual(["cabeza", "cabello", "torso"]);
    expect(Object.keys(adn.expresionBase).sort()).toEqual(["aa", "happy"]);
  });
  it("en vrm completo no se recorta nada", () => {
    const v = vestido();
    expect(adnParaCalidad(v, "vrm-completo").adn).toEqual(v);
  });
});

describe("quién cambia qué avatar", () => {
  const de = (tipo: "perfil" | "bot" | "grupo" | "pagina") => ({ dueno: { tipo, id: "x" } });
  it("probar en tu pantalla siempre se puede", () => {
    expect(decidirCambioAvatar({ adn: de("grupo"), rol: "observador", vistaPrevia: true }).permitido).toBe(true);
  });
  it("tu avatar y tu bot personal solo los cambias tú", () => {
    expect(decidirCambioAvatar({ adn: de("perfil"), rol: "dueno", vistaPrevia: false }).permitido).toBe(true);
    expect(decidirCambioAvatar({ adn: de("bot"), rol: "admin", vistaPrevia: false }).requiere).toBe("nunca");
  });
  it("grupo democrático: se vota; jerárquico: lo aplica quien administra", () => {
    expect(decidirCambioAvatar({ adn: de("grupo"), rol: "admin", gobierno: "democratico", vistaPrevia: false }).requiere).toBe("votacion");
    expect(decidirCambioAvatar({ adn: de("bot"), botDeEntidad: true, rol: "miembro", gobierno: "democratico", vistaPrevia: false }).requiere).toBe("votacion");
    expect(decidirCambioAvatar({ adn: de("pagina"), rol: "admin", gobierno: "jerarquico", vistaPrevia: false }).permitido).toBe(true);
    expect(decidirCambioAvatar({ adn: de("pagina"), rol: "miembro", vistaPrevia: false }).requiere).toBe("confirmacion");
    expect(decidirCambioAvatar({ adn: de("grupo"), rol: "invitado", gobierno: "democratico", vistaPrevia: false }).requiere).toBe("nunca");
  });
});
