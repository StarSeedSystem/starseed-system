import { describe, expect, it } from "vitest";
import { adnPorDefecto, type AdnAvatar } from "@/lib/avatares/adn/adn";
import { aplicarCambios, aplicarCambio, type CambioAvatar } from "@/lib/avatares/adn/cambios";
import { sanearMetaAvatar } from "@/lib/vivo/espacial/avatares";
import {
    EVENTO_ADN,
    adnPorPedir,
    aplicarEventoAdn,
    avatarXrPara,
    crearCacheAdn,
    envolverEventoAdn,
    refDeId,
    sanearEventoAdn,
} from "@/lib/avatares/adaptadores/sincronia-adn";

/** ADN válido de prueba (rev 1, altura 0,7). */
const adn = (id: string): AdnAvatar =>
    aplicarCambio(adnPorDefecto(id, "Ana", { tipo: "perfil", id: "u1" }), { op: "morfologia", clave: "altura", valor: 0.7 });
const REF = refDeId("adn-prueba-1");
const ALTURA = (v: number): CambioAvatar => ({ op: "morfologia", clave: "altura", valor: v });
/** Cambios «sucios» de fuera (lo que llega por broadcast puede ser basura). */
const sucio = (cs: unknown): CambioAvatar[] => cs as CambioAvatar[];

describe("evento `adn` del canal de la escena", () => {
    it("el nombre del evento es `adn` y la ref es la del almacén (su id, contrato §12)", () => {
        expect(EVENTO_ADN).toBe("adn");
        expect(refDeId("adn-x")).toBe("biblioteca:adn-x");
    });

    it("envolver: sanea los cambios y rechaza ref externa, rev no entera o lote sin cambios válidos", () => {
        const e = envolverEventoAdn(REF, 2, sucio([ALTURA(1.5), { op: "morfologia", clave: "no-existe", valor: 1 }]));
        expect(e?.cambios).toEqual([ALTURA(1)]);
        expect(envolverEventoAdn("https://fuera.example/a", 2, [ALTURA(1)])).toBeNull();
        expect(envolverEventoAdn(REF, 1.5, [ALTURA(1)])).toBeNull();
        expect(envolverEventoAdn(REF, 2, sucio([{ op: "no-existe" }]))).toBeNull();
    });

    it("sanear: lo corrupto del broadcast no entra nunca", () => {
        expect(sanearEventoAdn(null)).toBeNull();
        expect(sanearEventoAdn("adn")).toBeNull();
        expect(sanearEventoAdn({ ref: REF, rev: 2 })).toBeNull();
        const e = sanearEventoAdn({ ref: REF, rev: 3.2, cambios: [ALTURA(0.1), { op: "nda" }] });
        expect(e).toEqual({ ref: REF, rev: 3, cambios: [ALTURA(0.1)] });
    });
});

describe("aplicarEventoAdn · solo gana la revisión más nueva", () => {
    it("aplica una rev más nueva y deja la base intacta (sin mutar)", () => {
        const base = adn("adn-prueba-1");
        const n = aplicarEventoAdn(base, { ref: REF, rev: 2, cambios: [ALTURA(0.1)] });
        expect(n?.rev).toBe(2);
        expect(n?.morfologia.altura).toBe(0.1);
        expect(base.rev).toBe(1);
        expect(base.morfologia.altura).toBe(0.7);
    });

    it("ignora la misma rev, una más vieja, otra ref y los cambios inválidos", () => {
        const base = adn("adn-prueba-1");
        expect(aplicarEventoAdn(base, { ref: REF, rev: 1, cambios: [ALTURA(0.1)] })).toBeNull();
        expect(aplicarEventoAdn(base, { ref: refDeId("adn-otro"), rev: 9, cambios: [ALTURA(0.1)] })).toBeNull();
        expect(aplicarEventoAdn(base, { ref: REF, rev: 2, cambios: sucio([{ op: "nda" }]) })).toBeNull();
        expect(aplicarEventoAdn(null, { ref: REF, rev: 2, cambios: [ALTURA(0.1)] })).toBeNull();
    });
});

describe("caché · cada presente se lee UNA vez por revisión", () => {
    it("pedir marca en vuelo; olvidar vuelve a permitir la lectura", () => {
        const c = crearCacheAdn();
        expect(c.pedir(REF, 1)).toBe(true);
        expect(c.pedir(REF, 1)).toBe(false);
        c.olvidar(REF);
        expect(c.pedir(REF, 1)).toBe(true);
    });

    it("guardar deja de pedir esa rev, pide rev nuevas y evicta al pasar el tope", () => {
        const c = crearCacheAdn(2);
        const a = adn("adn-a");
        c.guardar(a);
        c.guardar(adn("adn-b"));
        expect(c.pedir(refDeId("adn-a"), a.rev)).toBe(false);
        expect(c.pedir(refDeId("adn-a"), a.rev + 1)).toBe(true);
        expect(c.obtener(refDeId("adn-a"))?.id).toBe("adn-a");
        c.guardar(adn("adn-d"));
        expect(c.tamano()).toBe(2);
        expect(c.obtener(refDeId("adn-a"))).toBeNull();
        c.guardar({ ...adn("adn-d"), id: "" } as unknown as AdnAvatar);
        expect(c.tamano()).toBe(2);
    });

    it("los eventos que llegan sin base quedan pendientes y se aplican al llegar la lectura", () => {
        const c = crearCacheAdn();
        expect(c.recibir({ ref: REF, rev: 3, cambios: [ALTURA(0.9)] })).toBeNull();
        expect(c.recibir({ ref: REF, rev: 2, cambios: [ALTURA(0.2)] })).toBeNull();
        c.guardar(adn("adn-prueba-1")); // rev 1
        const final = c.obtener(REF);
        expect(final?.rev).toBe(3);
        expect(final?.morfologia.altura).toBe(0.9);
    });

    it("con base, recibir aplica solo rev más nuevas", () => {
        const c = crearCacheAdn();
        c.guardar(adn("adn-prueba-1")); // rev 1
        expect(c.recibir({ ref: REF, rev: 1, cambios: [ALTURA(0.3)] })).toBeNull();
        const n = c.recibir({ ref: REF, rev: 5, cambios: [ALTURA(0.3)] });
        expect(n?.rev).toBe(5);
        expect(c.recibir({ ref: REF, rev: 2, cambios: [ALTURA(0.4)] })).toBeNull(); // evento viejo saneado
        expect(c.obtener(REF)?.morfologia.altura).toBe(0.3);
    });
});

describe("adnPorPedir · qué leer al ver a los presentes", () => {
    it("solo con ref+rev válidas, UNA vez, y nada tras guardar", () => {
        const c = crearCacheAdn();
        const presentes = [{}, { adnRef: REF, adnRev: 2 }, { adnRef: "https://x.example/a", adnRev: 1 }, { adnRef: REF, adnRev: 1.5 }];
        expect(adnPorPedir(c, presentes)).toEqual([{ ref: REF, rev: 2 }]);
        expect(adnPorPedir(c, presentes)).toEqual([]); // sigue en vuelo: UNA lectura
        c.guardar({ ...adn("adn-prueba-1"), rev: 2 });
        expect(adnPorPedir(c, presentes)).toEqual([]); // ya la tenemos
    });
});

describe("avatarXrPara · el nivel de avatar sale de la calidad XR actual", () => {
    it("en mínima eres tu orbe; en máxima se dibuja el VRM completo", () => {
        const base = aplicarCambios(adnPorDefecto("adn-xr", "Ana", { tipo: "perfil", id: "u1" }), [
            { op: "base", tipo: "vrm", ref: "biblioteca:vrm1" },
            { op: "pieza", slot: "cabeza", ref: "biblioteca:p1" },
            { op: "expresion", clave: "happy", valor: 1 },
        ]);
        const min = avatarXrPara(base, "minima");
        expect(min.calidad).toBe("orbe-manos");
        expect(min.adn.base.tipo).toBe("orbe");
        expect(min.adn.piezas).toEqual([]);
        const max = avatarXrPara(base, "maxima");
        expect(max.calidad).toBe("vrm-completo");
        expect(max.adn.base.tipo).toBe("vrm");
        expect(max.adn.piezas.some((p) => p.slot === "cabeza")).toBe(true);
        expect(max.adn.expresionBase.happy).toBe(1);
    });
});

describe("MetaAvatar con ADN · opcional y sano", () => {
    it("quien no manda ADN no cambia; quien manda, viaja con su ref y su rev", () => {
        const sin = sanearMetaAvatar({ nombre: "Ana" }, "k:1");
        expect(sin?.adnRef).toBeUndefined();
        expect(sin?.adnRev).toBeUndefined();
        const con = sanearMetaAvatar({ nombre: "Ana", adnRef: REF, adnRev: 4 }, "k:1");
        expect(con?.adnRef).toBe(REF);
        expect(con?.adnRev).toBe(4);
        expect(sanearMetaAvatar({ nombre: "Ana", adnRef: "https://x.example/a", adnRev: 4 }, "k:1")?.adnRef).toBeUndefined();
        expect(sanearMetaAvatar({ nombre: "Ana", adnRef: REF }, "k:1")?.adnRev).toBe(0);
        expect(sanearMetaAvatar({ nombre: "Ana", adnRef: REF, adnRev: -3 }, "k:1")?.adnRev).toBe(0);
    });
});
