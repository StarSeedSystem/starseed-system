import { describe, expect, it } from "vitest";
import {
    adnParaXR,
    anotarLectura,
    aplicarEventoAdn,
    esRevisionMasNueva,
    crearCacheAdn,
    eventoAdnDeLote,
    lecturasDePresencia,
    lecturasPendientes,
    sanearEventoAdn,
} from "@/lib/avatares/adaptadores/sincronia-adn";
import { adnPorDefecto, type AdnAvatar } from "@/lib/avatares/adn/adn";
import { aplicarCambios, crearColaEnvio, encolar, lote } from "@/lib/avatares/adn/cambios";
import type { MetaAvatar } from "@/lib/vivo/espacial/avatares";

const REF = "biblioteca:adn-uno";
const REF_DOS = "genesis:adn-dos";

const meta = (clave: string, adnRef?: string, adnRev?: number): MetaAvatar => ({
    clave,
    uid: null,
    nombre: clave,
    color: "#7C5CFF",
    modo: "3d",
    editor: false,
    desde: 0,
    ...(adnRef ? { adnRef, ...(adnRev === undefined ? {} : { adnRev }) } : {}),
});

describe("evento adn · saneado del canal", () => {
    it("acepta un lote válido y descarta los cambios que no entiende", () => {
        const e = sanearEventoAdn({ ref: REF, rev: "3", cambios: [{ op: "morfologia", clave: "altura", valor: 0.9 }, { op: "data-mining" }] });
        expect(e).toBeNull(); // rev no numérica: el evento entero se rechaza
        const bien = sanearEventoAdn({ ref: REF, rev: 3, cambios: [{ op: "morfologia", clave: "altura", valor: 2 }, { op: "noexiste", valor: 1 }] });
        expect(bien).not.toBeNull();
        expect(bien).toEqual({ ref: REF, rev: 3, cambios: [{ op: "morfologia", clave: "altura", valor: 1 }] });
    });

    it("rechaza ref externa, rev inválida y lotes vacíos o rotos", () => {
        expect(sanearEventoAdn({ ref: "https://otro", rev: 1, cambios: [{ op: "nombre", valor: "Ana" }] })).toBeNull();
        expect(sanearEventoAdn({ ref: REF, rev: -1, cambios: [{ op: "nombre", valor: "Ana" }] })).toBeNull();
        expect(sanearEventoAdn({ ref: REF, rev: 1, cambios: [] })).toBeNull();
        expect(sanearEventoAdn(null)).toBeNull();
        expect(sanearEventoAdn({ ref: REF, rev: 1 })).toBeNull();
    });
});

describe("evento adn · aplicación por revisión", () => {
    const adn = (): AdnAvatar => adnPorDefecto("adn-uno", "Ana", { tipo: "perfil", id: "p1" });

    it("solo se aplica con revisión más nueva y deja la revisión del evento", () => {
        expect(esRevisionMasNueva(2, 3)).toBe(true);
        expect(esRevisionMasNueva(3, 3)).toBe(false);
        expect(aplicarEventoAdn({ ...adn(), rev: 3 }, { ref: REF, rev: 3, cambios: [{ op: "morfologia", clave: "altura", valor: 0.9 }] })).toBeNull();
        const tras = aplicarEventoAdn(adn(), { ref: REF, rev: 7, cambios: [{ op: "morfologia", clave: "altura", valor: 0.9 }] });
        expect(tras).not.toBeNull();
        expect(tras.rev).toBe(7); // converge: gana la rev del evento, no la de los cambios sueltos
        expect(tras.morfologia.altura).toBe(0.9);
    });

    it("devuelve null si ningún cambio sobrevive al saneo", () => {
        // sanearCambio ya filtró, pero aplicarCambio puede rechazar un cambio válido contra sanearAdn:
        // con la orbe no caben piezas; con rev más nueva igual sube, sin copia inútil descartamos.
        expect(aplicarEventoAdn(adn(), { ref: REF, rev: 5, cambios: [] })).toBeNull();
    });

    it("dos personas que reciben el mismo lote quedan iguales", () => {
        const e = { ref: REF, rev: 4, cambios: [{ op: "morfologia", clave: "altura", valor: 0.2 }, { op: "material", slot: "piel", campo: "color", valor: "#10B981" }] };
        const a = aplicarEventoAdn(adn(), e);
        const b = aplicarEventoAdn({ ...adn(), rev: 2 }, e);
        expect(a).toEqual(b);
    });
});

describe("caché de ADN · UNA lectura por ref+rev", () => {
    const presentes = [meta("ana:1", REF, 3), meta("leo:2"), meta("ana:1", REF, 3), meta("sol:4", REF, 3)];

    it("cada presente con ADN se lee una vez; sin adnRef no se lee nada", () => {
        const cache = crearCacheAdn();
        expect(lecturasPendientes(cache, presentes).map((l) => l.ref)).toEqual([REF]);
        // hasta que anoto, sigue pendiente (una lectura fallida no se pierde en silencio)
        expect(lecturasPendientes(cache, presentes).length).toBe(1);
        anotarLectura(cache, { ref: REF, rev: 3 });
        expect(lecturasPendientes(cache, presentes)).toEqual([]);
    });

    it("una revisión nueva del mismo ref vuelve a leerse; sin rev declarada, también", () => {
        const cache = crearCacheAdn();
        anotarLectura(cache, { ref: REF, rev: 3 });
        expect(lecturasPendientes(cache, [meta("ana:1", REF, 4)])).toEqual([{ ref: REF, rev: 4 }]);
        const sinRev = crearCacheAdn();
        expect(lecturasPendientes(sinRev, [meta("ana:1", REF)])).toEqual([{ ref: REF, rev: null }]);
        anotarLectura(sinRev, { ref: REF, rev: null });
        expect(lecturasPendientes(sinRev, [meta("ana:1", REF)])).toEqual([]);
    });

    it("presencia de Supabase → lecturas de los demás (sin mí)", () => {
        const cache = crearCacheAdn();
        const estado = {
            "yo:0": [{ clave: "yo:0", nombre: "Yo", adnRef: REF, adnRev: 1 }],
            "ana:1": [{ clave: "ana:1", nombre: "Ana", adnRef: REF, adnRev: 3 }],
            "leo:2": [{ clave: "leo:2", nombre: "Leo" }],
        };
        const ls = lecturasDePresencia(cache, estado, "yo:0");
        expect(ls).toEqual([{ ref: REF, rev: 3 }]);
    });
});

describe("evento adn · del lote al canal", () => {
    it("lote() → evento con la revisión del ADN tras aplicar los cambios", () => {
        const adn: AdnAvatar = adnPorDefecto("adn-uno", "Ana", { tipo: "perfil", id: "p1" });
        const cola = crearColaEnvio();
        encolar(cola, { op: "morfologia", clave: "altura", valor: 0.1 });
        encolar(cola, { op: "morfologia", clave: "altura", valor: 0.9 });
        const cs = lote(cola, 1000, 2);
        expect(cs).not.toBeNull();
        const tras = aplicarCambios(adn, cs!); // el editor local así sube la revisión
        const e = eventoAdnDeLote(REF, tras, cs!);
        expect(e).toEqual({ ref: REF, rev: tras.rev, cambios: [{ op: "morfologia", clave: "altura", valor: 0.9 }] });
        expect(e!.rev).toBe(2); // dos cambios aplicados al ADN de rev 0
    });

    it("rechaza ref externa o lote vacío", () => {
        const adn = adnPorDefecto("adn-uno", "Ana", { tipo: "perfil", id: "p1" });
        expect(eventoAdnDeLote("https://otro", adn, [{ op: "nombre", valor: "Ana" }])).toBeNull();
        expect(eventoAdnDeLote(REF_DOS, adn, [])).toBeNull();
    });
});

describe("XR · el nivel de avatar sale de la calidad actual", () => {
    it("calidad mínima → orbe; calidad alta → malla completa del ADN", () => {
        const adn: AdnAvatar = {
            ...adnPorDefecto("adn-uno", "Ana", { tipo: "perfil", id: "p1" }),
            base: { tipo: "vrm", ref: REF },
            esqueleto: { tipo: "vrm-humanoide", articulaciones: 55 },
            expresionBase: { neutral: 0.5, aa: 0.4, blink: 1 },
        };
        const min = adnParaXR(adn, "minima");
        expect(min.adn.base.tipo).toBe("orbe");
        expect(min.adn.piezas).toEqual([]);
        expect(min.presupuesto.forma).toBe("orbe");
        const alta = adnParaXR(adn, "alta");
        expect(alta.adn.base.tipo).toBe("vrm");
        expect(alta.adn.base.ref).toBe(REF);
        expect(Object.keys(alta.adn.expresionBase).length).toBeGreaterThan(0);
        expect(alta.presupuesto.triangulos).toBe(60_000);
    });
});
