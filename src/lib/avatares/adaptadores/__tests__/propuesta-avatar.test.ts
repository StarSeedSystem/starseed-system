import { describe, it, expect } from "vitest";
import { type AdnAvatar } from "@/lib/avatares/adn/adn";
import { type CambioAvatar } from "@/lib/avatares/adn/cambios";
import { proponerCambioAvatar, aplicarCambioAvatar, type PeticionPropuestaAvatar } from "@/lib/avatares/adaptadores/propuesta-avatar";
import { type Ambito, describirOperacion } from "@/lib/genesis/operaciones";

const adn = (cambios: Partial<AdnAvatar> = {}): AdnAvatar => ({
    v: 1,
    id: "adn-1",
    nombre: "Orbe",
    dueno: { tipo: "grupo", id: "g1" },
    base: { tipo: "orbe" },
    esqueleto: { tipo: "ninguno", articulaciones: 0 },
    morfologia: {},
    materiales: {},
    piezas: [],
    expresionBase: {},
    aura: { tono: 260, intensidad: 0.6, ligadaEmocion: true },
    movimiento: { energia: 0.5, amplitud: 0.5, ritmo: 0.5, postura: 0.5 },
    visibilidad: "privado",
    procedencia: [],
    rev: 3,
    ...cambios,
});

const entidad: Ambito = { tipo: "entidad", entidad: { tipo: "grupo", id: "g1", slug: "grupo", nombre: "Grupo" } };

const peticion = (actual: AdnAvatar, propuesto: AdnAvatar, extra: Partial<PeticionPropuestaAvatar> = {}): PeticionPropuestaAvatar => ({
    actual,
    propuesto,
    motivo: "Cambiar el aura del grupo",
    ambito: entidad,
    rol: "miembro",
    gobierno: "democratico",
    ...extra,
});

const cambioTono: CambioAvatar = { op: "aura", campo: "tono", valor: 120 };

describe("propuesta de avatar · solo se propone lo que se vota", () => {
    it("en una entidad democrática convierte el diff en la operación avatar.cambiar", () => {
        const actual = adn();
        const propuesto = adn({ aura: { tono: 120, intensidad: 0.6, ligadaEmocion: true } });
        const r = proponerCambioAvatar(peticion(actual, propuesto));

        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.operacion.tipo).toBe("avatar.cambiar");
        if (r.operacion.tipo !== "avatar.cambiar") return;
        expect(r.operacion.datos).toEqual({ ref: "adn-1", revBase: 3, cambios: [cambioTono] });
        expect(r.cambiosEnPalabras).toEqual(["Aura · tono: 120"]);
        expect(describirOperacion(r.operacion, entidad).detalles).toContain("Aura · tono: 120");
    });

    it("no propone si la entidad es jerárquica ni el avatar es de una persona", () => {
        const jerarquica = proponerCambioAvatar(peticion(adn(), adn({ nombre: "Otro" }), { gobierno: "jerarquico", rol: "dueno" }));
        expect(jerarquica.ok).toBe(false);
        if (!jerarquica.ok) expect(jerarquica.motivo).toContain("administra");

        const persona: Ambito = { tipo: "persona" };
        const propia = proponerCambioAvatar(peticion(adn({ dueno: { tipo: "perfil", id: "p1" } }), adn({ dueno: { tipo: "perfil", id: "p1" }, nombre: "Otro" }), { ambito: persona, rol: "dueno" }));
        expect(propia.ok).toBe(false);
    });

    it("rechaza un observador, un cambio vacío y un avatar propuesto con otro id", () => {
        const observador = proponerCambioAvatar(peticion(adn(), adn({ nombre: "Otro" }), { rol: "observador" }));
        expect(observador.ok).toBe(false);

        const vacia = proponerCambioAvatar(peticion(adn(), adn()));
        expect(vacia.ok).toBe(false);
        if (!vacia.ok) expect(vacia.problemas).toContain("cambios");

        const otro = proponerCambioAvatar(peticion(adn(), adn({ id: "adn-2", nombre: "Otro" })));
        expect(otro.ok).toBe(false);
        if (!otro.ok) expect(otro.problemas).toContain("id");
    });
});

describe("aprobación de avatar · rebase sobre la revisión vigente", () => {
    it("con la misma revisión aplica el diff tal cual, sin aviso", () => {
        const r = aplicarCambioAvatar(adn(), { ref: "adn-1", revBase: 3, cambios: [cambioTono] });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.rebasado).toBe(false);
        expect(r.aviso).toBeNull();
        expect(r.adn.aura.tono).toBe(120);
    });

    it("si la revisión cambió, rebasa contra la actual, conserva lo ajeno y avisa", () => {
        const actual = adn({ rev: 5, nombre: "Otro nombre" });
        const r = aplicarCambioAvatar(actual, { ref: "adn-1", revBase: 3, cambios: [cambioTono] });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.rebasado).toBe(true);
        expect(r.aviso).toContain("revisión 3");
        expect(r.aviso).toContain("revisión 5");
        expect(r.adn.aura.tono).toBe(120);
        expect(r.adn.nombre).toBe("Otro nombre");
        expect(r.cambiosEnPalabras).toEqual(["Aura · tono: 120"]);
    });

    it("rechaza una propuesta de una revisión más nueva o de otro avatar", () => {
        const futura = aplicarCambioAvatar(adn(), { ref: "adn-1", revBase: 9, cambios: [cambioTono] });
        expect(futura.ok).toBe(false);
        if (!futura.ok) expect(futura.motivo).toContain("recarga");

        const ajena = aplicarCambioAvatar(adn(), { ref: "adn-2", revBase: 3, cambios: [cambioTono] });
        expect(ajena.ok).toBe(false);
    });

    it("acepta biblioteca:<id> y avisa cuando al rebasar no queda ningún cambio", () => {
        const actual = adn({ rev: 4, aura: { tono: 120, intensidad: 0.6, ligadaEmocion: true } });
        const r = aplicarCambioAvatar(actual, { ref: "biblioteca:adn-1", revBase: 3, cambios: [cambioTono] });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.rebasado).toBe(true);
        expect(r.cambios).toEqual([]);
        expect(r.adn).toEqual(actual);
        expect(r.aviso).toContain("no queda ningún cambio");
    });
});
