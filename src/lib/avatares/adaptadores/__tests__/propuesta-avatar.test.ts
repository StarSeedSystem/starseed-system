import { describe, expect, it } from "vitest";
import { adnPorDefecto, type AdnAvatar } from "@/lib/avatares/adn/adn";
import { aplicarCambios, type CambioAvatar } from "@/lib/avatares/adn/cambios";
import { describirCambioAvatar, numeroEnPalabras } from "@/lib/avatares/adn/descripcion-cambios";
import { aplicarPropuestaAvatar, proponerCambioAvatar } from "@/lib/avatares/adaptadores/propuesta-avatar";
import { describirOperacion, validarOperacion, type Ambito } from "@/lib/genesis/operaciones";

const DUENO = { tipo: "grupo" as const, id: "grupo-1" };
const ENTIDAD: Ambito = { tipo: "entidad", entidad: { tipo: "grupo", id: "grupo-1", slug: "circulo", nombre: "Círculo" } };
const ALTURA: CambioAvatar = { op: "morfologia", clave: "altura", valor: 0.8 };

const base = (rev = 3): AdnAvatar => ({ ...adnPorDefecto("adn-1", "Actual", DUENO, 200), rev });
const conCambios = (adn: AdnAvatar, cambios: CambioAvatar[]): AdnAvatar => aplicarCambios(adn, cambios);

describe("propuesta de avatar · solo con votación", () => {
  it("no propone en un avatar personal ni en una entidad jerárquica", () => {
    const personal = adnPorDefecto("adn-p", "Mío", { tipo: "perfil", id: "perfil-1" });
    const propuesto = conCambios(personal, [ALTURA]);
    expect(proponerCambioAvatar({ actual: personal, propuesto, motivo: "m", rol: "dueno" }).ok).toBe(false);

    const actual = base();
    const deseado = conCambios(actual, [ALTURA]);
    const jerarquico = proponerCambioAvatar({ actual, propuesto: deseado, motivo: "m", rol: "admin", gobierno: "jerarquico" });
    expect(jerarquico.ok).toBe(false);
    if (!jerarquico.ok) expect(jerarquico.motivo).toMatch(/democrático/);
  });

  it("tampoco deja proponer a un observador de una entidad democrática", () => {
    const actual = base();
    const deseado = conCambios(actual, [ALTURA]);
    const r = proponerCambioAvatar({ actual, propuesto: deseado, motivo: "m", rol: "observador", gobierno: "democratico" });
    expect(r.ok).toBe(false);
  });

  it("construye avatar.cambiar con el diff y la revisión base, y Genesis la valida", () => {
    const actual = base();
    const deseado = { ...actual, morfologia: { altura: 0.8 } };
    const r = proponerCambioAvatar({ actual, propuesto: deseado, motivo: " Altura ", rol: "miembro", gobierno: "democratico" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.operacion).toMatchObject({
      tipo: "avatar.cambiar",
      motivo: "Altura",
      datos: { ref: "adn-1", revBase: 3, cambios: [ALTURA] },
    });
    const v = validarOperacion(r.operacion, { ambito: ENTIDAD });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const vista = describirOperacion(v.op, ENTIDAD);
    expect(vista.titulo).toContain("avatar");
    expect(vista.detalles[0]).toContain("altura");
  });

  it("no propone un avatar igual ni uno de otro id", () => {
    const actual = base();
    expect(proponerCambioAvatar({ actual, propuesto: actual, motivo: "m", rol: "miembro", gobierno: "democratico" }).ok).toBe(false);
    const otro = { ...conCambios(actual, [ALTURA]), id: "adn-2" };
    expect(proponerCambioAvatar({ actual, propuesto: otro, motivo: "m", rol: "miembro", gobierno: "democratico" }).ok).toBe(false);
  });
});

describe("aprobación de avatar · rebase", () => {
  it("con la misma revisión aplica los cambios tal cual, sin aviso", () => {
    const actual = base(3);
    const datos = { ref: "adn-1", revBase: 3, cambios: [{ op: "nombre", valor: "Nuevo" } as CambioAvatar] };
    const r = aplicarPropuestaAvatar(actual, datos);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rebasado).toBe(false);
    expect(r.aviso).toBeNull();
    expect(r.adn.nombre).toBe("Nuevo");
    expect(r.adn.rev).toBeGreaterThan(actual.rev);
  });

  it("si la revisión avanzó y se conoce el ADN propuesto, recalcula el diff sobre la actual y avisa", () => {
    const actual = { ...base(7), nombre: "Actual", morfologia: { altura: 0.2 } };
    const deseado = { ...actual, morfologia: { altura: 0.8 } };
    const datos = { ref: "adn-1", revBase: 3, cambios: [ALTURA, { op: "nombre", valor: "Viejo" } as CambioAvatar] };
    const r = aplicarPropuestaAvatar(actual, datos, deseado);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rebasado).toBe(true);
    expect(r.adn.nombre).toBe("Actual");
    expect(r.adn.morfologia.altura).toBe(0.8);
    expect(r.aviso).toContain("revisión 3");
    expect(r.aviso).toContain("revisión 7");
    expect(r.aviso).toContain("recalculado");
  });

  it("sin el ADN propuesto reaplica los cambios guardados sobre la revisión actual y lo dice", () => {
    const actual = { ...base(7), nombre: "Actual" };
    const datos = { ref: "biblioteca:adn-1", revBase: 3, cambios: [{ op: "nombre", valor: "Viejo" } as CambioAvatar] };
    const r = aplicarPropuestaAvatar(actual, datos);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rebasado).toBe(true);
    expect(r.adn.nombre).toBe("Viejo");
    expect(r.aviso).toContain("reaplicado");
  });

  it("rechaza otra referencia o cambios que ya no son válidos", () => {
    const actual = base();
    expect(aplicarPropuestaAvatar(actual, { ref: "adn-otro", revBase: 3, cambios: [ALTURA] }).ok).toBe(false);
    const roto = [{ op: "morfologia", clave: "inventada", valor: 0.5 }] as unknown as CambioAvatar[];
    expect(aplicarPropuestaAvatar(actual, { ref: "adn-1", revBase: 3, cambios: roto }).ok).toBe(false);
    expect(validarOperacion({ tipo: "avatar.cambiar", motivo: "m", datos: { ref: "adn-1", revBase: 3, cambios: [] } }, { ambito: ENTIDAD }).ok).toBe(false);
  });
});

describe("cambios en palabras", () => {
  it("cuenta cada cambio con su valor, sin jerga", () => {
    expect(describirCambioAvatar(ALTURA)).toBe("Morfología · altura: 0,8");
    expect(describirCambioAvatar({ op: "material", slot: "piel", campo: "color", valor: "#aabbcc" })).toBe("Material · piel · color: #aabbcc");
    expect(describirCambioAvatar({ op: "aura", campo: "ligadaEmocion", valor: false })).toBe("Aura ligada a la emoción: no");
    expect(describirCambioAvatar({ op: "pieza", slot: "cabello", ref: null })).toBe("Pieza · cabello: se quita");
    expect(numeroEnPalabras(0.333)).toBe("0,33");
  });
});
