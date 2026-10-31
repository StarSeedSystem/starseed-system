/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · Salas · Pruebas de propiedad por épocas (Ola 1025R · INF1025J).
 * Fuzzer con semilla fija (mulberry32, sin Math.random) para las invariantes
 * de `fusionarPropiedades`, y casos guiados para reclamación, cesión,
 * escritura por épocas, rol + propiedad y traspaso forzado. PURO: sin red,
 * sin disco, sin reloj.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from "vitest";

import {
    reclamar,
    traspasar,
    aceptarEscritura,
    explicar,
    fusionarPropiedades,
    puedeEscribir,
    forzarTraspaso,
    type Propiedades,
} from "@/lib/salas/propiedad-sala";
import { type Sala } from "@/lib/salas/sala";

/** Sala mínima de pruebas con los cuatro roles representados. */
function sala(): Sala {
    return {
        id: "sala-1",
        tipo: "escena3d",
        titulo: "Escena de la Protomolécula",
        visibilidad: "privada",
        transporte: "local",
        miembros: { "u-dueno": "dueno", "u-editor": "editor", "u-comenta": "comentarista" },
        creadaEn: 1_757_000_000_000,
    };
}

/* ───────── Fuzzer determinista (mulberry32, como el de INF1025I) ───────── */

/** Generador con semilla: mismo azar en cada corrida, sin Math.random. */
function mulberry32(semilla: number): () => number {
    let a = semilla >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), a | 1);
        t = Math.imul(t ^ (t >>> 7), t | 61) + t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const PERSONAS = ["ana", "bruno", "carla", "dani"] as const;
const IDS = "abcdefgh".split("");
const SEMILLA = 1025;
const CASOS = 200;

const entero = (rnd: () => number, min: number, max: number) =>
    min + Math.floor(rnd() * (max - min + 1));

/** Mapa de propiedad aleatorio: 1–8 elementos, épocas 1–4, duenos de la flota. */
function propiedadesAleatorias(rnd: () => number): Propiedades {
    const p: Propiedades = {};
    for (let n = entero(rnd, 1, IDS.length); n > 0; n -= 1) {
        const id = IDS[entero(rnd, 0, IDS.length - 1)];
        p[id] = { dueno: PERSONAS[entero(rnd, 0, PERSONAS.length - 1)], epoca: entero(rnd, 1, 4) };
    }
    return p;
}

/** Canon serializa con claves ordenadas: compara sin depender del orden. */
const canon = (p: Propiedades) => JSON.stringify(Object.keys(p).sort().map((k) => p[k]));

/* ─────────────────────── Reclamar, ceder y escribir ─────────────────────── */

describe("reclamar y traspasar", () => {
    it("reclamar da el elemento sin dueño a quien lo reclama, con época 1", () => {
        const r = reclamar({}, "avatar-1", "u-ana");
        expect(r["avatar-1"]).toEqual({ dueno: "u-ana", epoca: 1 });
    });

    it("reclamar no roba lo que ya tiene dueño", () => {
        const p: Propiedades = { "avatar-1": { dueno: "u-bruno", epoca: 3 } };
        const r = reclamar(p, "avatar-1", "u-ana");
        expect(r["avatar-1"]).toEqual({ dueno: "u-bruno", epoca: 3 });
    });

    it("traspasar sube la época en 1 y cambia el dueño; sólo del dueño actual", () => {
        const p: Propiedades = { "ficha-2": { dueno: "u-ana", epoca: 2 } };
        const r = traspasar(p, "ficha-2", "u-ana", "u-bruno");
        expect(r["ficha-2"]).toEqual({ dueno: "u-bruno", epoca: 3 });
        // Un impostor no puede ceder: el mapa queda igual.
        expect(traspasar(p, "ficha-2", "u-bruno", "u-carla")["ficha-2"]).toEqual({ dueno: "u-ana", epoca: 2 });
        expect(traspasar(p, "ficha-2", "u-ana", "u-bruno")).not.toBe(p);
        expect(p["ficha-2"]).toEqual({ dueno: "u-ana", epoca: 2 });
        expect(traspasar({} as Propiedades, "ficha-2", "u-ana", "u-bruno")).toEqual({});
    });
});

describe("aceptarEscritura y explicar", () => {
    it("un elemento sin dueño se escribe libre, pero no con una época ya citada", () => {
        expect(aceptarEscritura({}, "av-1", "u-ana", 0)).toEqual({ ok: true });
        expect(aceptarEscritura({}, "av-1", "u-ana", 1)).toEqual({ ok: false, motivo: "sin-dueno" });
    });

    it("sólo el dueño escribe, y con la época corriente; la vieja se rechaza", () => {
        const p: Propiedades = { "av-1": { dueno: "u-ana", epoca: 4 } };
        expect(aceptarEscritura(p, "av-1", "u-ana", 4)).toEqual({ ok: true });
        expect(aceptarEscritura(p, "av-1", "u-ana", 3)).toEqual({ ok: false, motivo: "epoca-vieja" });
        expect(aceptarEscritura(p, "av-1", "u-bruno", 4)).toEqual({ ok: false, motivo: "no-es-dueno" });
    });

    it("explicar habla en claro: pide la pieza, sin tecnicismos", () => {
        const prohibidas = ["época", "epóca", "id", "mapa", "registro", "propiedades", "record", "undefined", "null"];
        for (const motivo of ["sin-dueno", "no-es-dueno", "epoca-vieja"] as const) {
            const frase = explicar(motivo, "Ana");
            const min = frase.toLowerCase();
            for (const w of prohibidas) expect(min.includes(w)).toBe(false);
        }
        expect(explicar("no-es-dueno", "Ana")).toContain("Esa pieza la tiene Ana; pídesela");
        expect(explicar("epoca-vieja")).toContain("versión antigua");
        expect(explicar("sin-dueno")).toContain("reclámala");
    });
});
/** ── Aquí continúa la fusión ── */

/* ─────────────────────── Fusión: invariantes con fuzzer ─────────────────── */

describe("fusionarPropiedades · invariantes (200 casos, semilla fija)", () => {
    it("es conmutativa e idempotente en 200 casos con semilla 1025", () => {
        const rnd = mulberry32(SEMILLA);
        for (let i = 0; i < CASOS; i += 1) {
            const a = propiedadesAleatorias(rnd);
            const b = propiedadesAleatorias(rnd);
            const ab = fusionarPropiedades(a, b);
            const ba = fusionarPropiedades(b, a);
            expect(canon(ab.resultado), `caso ${i}: conmutativa`).toBe(canon(ba.resultado));
            expect(ab.conflictos, `caso ${i}: conflictos iguales`).toEqual(ba.conflictos);
            const soloA = fusionarPropiedades(a, a);
            expect(canon(soloA.resultado), `caso ${i}: idempotente`).toBe(canon(a));
            expect(soloA.conflictos, `caso ${i}: sin conflicto consigo misma`).toEqual([]);
        }
    });

    it("gana la época mayor sin importar el orden de llegada", () => {
        const mia: Propiedades = { "av-1": { dueno: "u-carla", epoca: 7 } };
        const entra: Propiedades = { "av-1": { dueno: "u-ana", epoca: 3 } };
        expect(fusionarPropiedades(mia, entra).resultado["av-1"].dueno).toBe("u-carla");
        expect(fusionarPropiedades(entra, mia).resultado["av-1"].dueno).toBe("u-carla");
        expect(entra["av-1"]).toEqual({ dueno: "u-ana", epoca: 3 });
    });

    it("a igual época y distinto dueño, gana el menor alfabético; igual en ambos órdenes", () => {
        const deAna: Propiedades = { "av-1": { dueno: "ana", epoca: 2 } };
        const deZoe: Propiedades = { "av-1": { dueno: "zoe", epoca: 2 } };
        const ab = fusionarPropiedades(deAna, deZoe);
        const ba = fusionarPropiedades(deZoe, deAna);
        expect(ab.resultado["av-1"].dueno).toBe("ana");
        expect(ba.resultado["av-1"].dueno).toBe("ana");
        expect(ab.conflictos).toEqual(["av-1"]);
        expect(ba.conflictos).toEqual(["av-1"]);
    });

    it("los dos dueños distintos son un conflicto; el mismo dueño con épocas, no", () => {
        const a: Propiedades = { "av-1": { dueno: "ana", epoca: 2 }, "av-2": { dueno: "bruno", epoca: 5 } };
        const b: Propiedades = { "av-1": { dueno: "zoe", epoca: 3 }, "av-2": { dueno: "bruno", epoca: 1 } };
        const f = fusionarPropiedades(a, b);
        expect(f.conflictos).toEqual(["av-1"]);
        expect(f.resultado["av-1"]).toEqual({ dueno: "zoe", epoca: 3 });
        expect(f.resultado["av-2"] ?? null).toEqual({ dueno: "bruno", epoca: 5 });
    });
});
/** ── Aquí cierra el rol y el traspaso forzado ── */

/* ────────────────── Rol + propiedad, y traspaso forzado ────────────────── */

describe("puedeEscribir", () => {
    it("un editor escribe lo suyo o lo que nadie reclamó; no lo ajeno", () => {
        const s = sala();
        const p: Propiedades = { "av-1": { dueno: "u-editor", epoca: 1 }, "av-3": { dueno: "u-dueno", epoca: 1 } };
        expect(puedeEscribir(s, "u-editor", {}, "av-2")).toBe(true);
        expect(puedeEscribir(s, "u-editor", p, "av-1")).toBe(true);
        expect(puedeEscribir(s, "u-editor", p, "av-2")).toBe(true);
        expect(puedeEscribir(s, "u-editor", p, "av-3")).toBe(false);
    });

    it("el rol manda primero: comentarista y quienes no editan, fuera", () => {
        const s = sala();
        expect(puedeEscribir(s, "u-comenta", {}, "av-1")).toBe(false);
        expect(puedeEscribir(s, "u-comenta", { "av-1": { dueno: "u-comenta", epoca: 1 } }, "av-1")).toBe(false);
        expect(puedeEscribir(s, "u-fuera", {}, "av-1")).toBe(false);
    });
});

describe("forzarTraspaso", () => {
    it("sólo el dueño de la sala puede forzar, y queda registrado quién y a quién", () => {
        const s = sala();
        const p: Propiedades = { "av-1": { dueno: "u-editor", epoca: 3 } };
        const no = forzarTraspaso(s, "u-editor", p, "av-1", "u-comenta");
        expect(no.ok).toBe(false);
        expect(no.propiedades["av-1"]).toEqual({ dueno: "u-editor", epoca: 3 });
        const si = forzarTraspaso(s, "u-dueno", p, "av-1", "u-comenta");
        if (!si.ok) throw new Error("el dueño de la sala debería poder");
        expect(si.propiedades["av-1"]).toEqual({ dueno: "u-comenta", epoca: 4 });
        expect(si.porQuien).toBe("u-dueno");
        expect(si.aQuien).toBe("u-comenta");
        expect(p["av-1"]).toEqual({ dueno: "u-editor", epoca: 3 });
    });
});



