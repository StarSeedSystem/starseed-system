import { describe, expect, it } from "vitest";
import { COLORES_NODO } from "@/lib/xr/tokens-3d";
import { capaDe, entenderVoz, type ContextoVoz } from "@/lib/xr/intenciones-voz";
import {
    conNivelVoz, etiquetaCapa, parametrosVisuales, siguienteEstadoOrbe, textoOrbe,
    ORBE_REPOSO, type EstadoOrbe, type EventoOrbe,
} from "../estado-orbe";

const CTX: ContextoVoz = {
    grupos: [{ id: "g1", nombre: "Banda", miembros: 2 }],
    contactos: [{ id: "p1", nombre: "Ana" }],
    estaciones: [{ id: "e1", nombre: "Cumbre" }],
    servidores: [],
    enfoque: null,
    mundoActual: null,
};

const molde: EstadoOrbe = { fase: "reposo", capa: null, nivelVoz: 0, texto: "" };
const paso = (s: EstadoOrbe, ev: EventoOrbe): EstadoOrbe => siguienteEstadoOrbe(s, ev);

describe("siguienteEstadoOrbe · el ciclo completo", () => {
    it("reposo → escuchando → pensando → hablando → reposo", () => {
        const a = paso(ORBE_REPOSO, { tipo: "escucha-inicio" });
        expect(a.fase).toBe("escuchando");
        const b = paso(a, { tipo: "texto-parcial", texto: "crea un mundo" });
        expect(b.fase).toBe("escuchando");
        const c = paso(b, { tipo: "texto-parcial", texto: "crea un mundo con cielo de noche" });
        const d = paso(c, { tipo: "entendido", capa: "razon" });
        expect(d.fase).toBe("pensando");
        const e = paso(d, { tipo: "habla-inicio" });
        expect(e.fase).toBe("hablando");
        const f = paso(e, { tipo: "habla-fin" });
        expect(f.fase).toBe("reposo");
    });

    it("«error» SIEMPRE vuelve a reposo, con texto humano, desde cualquier fase (nunca un bucle)", () => {
        for (const en of ["escuchando", "pensando", "hablando"] as const) {
            const s = paso({ ...ORBE_REPOSO, fase: en }, { tipo: "error", mensaje: "No te he oído." });
            expect(s).toEqual({ fase: "reposo", capa: null, nivelVoz: 0, texto: "No te he oído." });
        }
    });

    it("la escucha acabada sin nada entendido NO deja pensando: vuelve a reposo", () => {
        const s = paso(paso(ORBE_REPOSO, { tipo: "escucha-inicio" }), { tipo: "escucha-fin" });
        expect(s.fase).toBe("reposo");
    });

    it("un «entendido» tardío no retrocede el habla a pensando (guardia de bucle)", () => {
        const hablando = paso(paso(ORBE_REPOSO, { tipo: "habla-inicio" }), { tipo: "entendido", capa: "reflejo" });
        expect(hablando.fase).toBe("hablando");
    });
});

describe("la capa del orbe, llena por `capaDe`", () => {
    it("una creación libre («un bosque de luciérnagas») pide la capa razón y el orbe la nombra", () => {
        const r = entenderVoz("crea un mundo con un bosque de luciérnagas", CTX);
        if (!r.ok) throw new Error(r.razon);
        const capa = capaDe(r.pasos[0].intencion);
        const s = paso({ ...ORBE_REPOSO, fase: "escuchando" }, { tipo: "entendido", capa });
        expect(s.capa).toBe("razon");
        expect(etiquetaCapa(s.capa)).toMatch(/capa razón/);
    });

    it("una orden cerrada («súbelo a la biblioteca») la responde el reflejo", () => {
        const r = entenderVoz("crea un mundo con una isla y súbelo a la biblioteca", CTX);
        if (!r.ok) throw new Error(r.razon);
        expect(capaDe(r.pasos[1].intencion)).toBe("reflejo");
    });

    it("cada escucha nueva borra la capa de la respuesta anterior (no se confunde de capa)", () => {
        const s = paso({ ...ORBE_REPOSO, capa: "razon" }, { tipo: "escucha-inicio" });
        expect(s.capa).toBeNull();
        expect(etiquetaCapa(s.capa)).toBe("");
    });
});

describe("texto parcial y última respuesta", () => {
    it("cada parcial sustituye al anterior y el final se conserva tras hablar", () => {
        const escuchando = paso(ORBE_REPOSO, { tipo: "escucha-inicio" });
        const p1 = paso(escuchando, { tipo: "texto-parcial", texto: "súbelo" });
        const p2 = paso(p1, { tipo: "texto-parcial", texto: "súbelo a la estación" });
        expect(p2.texto).toBe("súbelo a la estación");
        const respondida = paso(
            paso(p2, { tipo: "entendido", capa: "reflejo" }),
            { tipo: "habla-inicio" },
        );
        const fin = paso(respondida, { tipo: "habla-fin" });
        expect(fin.fase).toBe("reposo");
        expect(fin.texto).toBe("súbelo a la estación");
    });
});

describe("conNivelVoz y parámetros visuales", () => {
    it("el nivel de voz se acota a 0..1 y los sin fondo caen en 0 (sin NaN en la escena)", () => {
        expect(conNivelVoz(ORBE_REPOSO, 0.42).nivelVoz).toBe(0.42);
        expect(conNivelVoz(ORBE_REPOSO, 7).nivelVoz).toBe(1);
        expect(conNivelVoz(ORBE_REPOSO, Number.NaN).nivelVoz).toBe(0);
    });

    it("el radio base es 0,12 m; crece con la voz en activo y el color vive con la fase", () => {
        const enVoz = conNivelVoz({ ...ORBE_REPOSO, fase: "hablando" }, 0.8);
        const v = parametrosVisuales(enVoz, false);
        expect(v.radio).toBeCloseTo(0.12 * 1 + 0.12 * 0.8 * 0.35, 8);
        expect(v.color).toBe(COLORES_NODO.zenith.vivo);
        const quieto = parametrosVisuales(ORBE_REPOSO, false);
        expect(quieto.radio).toBe(0.12);
        expect(quieto.color).toBe(COLORES_NODO.zenith.base);
    });

    it("con movimiento reducido NO hay pulso y el radio no se mueve, aunque haya voz", () => {
        const enVoz = conNivelVoz({ ...ORBE_REPOSO, fase: "escuchando" }, 0.9);
        const v = parametrosVisuales(enVoz, true);
        expect(v.pulso).toBe(0);
        expect(v.radio).toBe(0.12);
        expect(parametrosVisuales({ ...ORBE_REPOSO, fase: "hablando" }, true).pulso).toBe(0);
    });
});

describe("textoOrbe · hasta 3 líneas", () => {
    it("el texto largo se enrolla en líneas de 64 y se corta con «…» lo que no cabe", () => {
        const largo = "palabra ".repeat(30).trim();
        const recortado = textoOrbe(largo);
        expect(recortado.split("\n").length).toBeLessThanOrEqual(3);
        expect(recortado.endsWith("…")).toBe(true);
    });

    it("un texto corto sale tal cual y el vacío sale vacío", () => {
        expect(textoOrbe("Hola Astraura")).toBe("Hola Astraura");
        expect(textoOrbe("  ")).toBe("");
        expect(textoOrbe("x", 0)).toBe("");
    });
});
