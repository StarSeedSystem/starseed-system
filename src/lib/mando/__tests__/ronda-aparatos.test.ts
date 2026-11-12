import { describe, expect, it } from "vitest";

import { sanearEnMarcha, vistaEnMarcha } from "../en-marcha";
import { cuerpoDePeticion, leePeticionesDeRonda, validarControl, vistaDirector } from "../pruebas-vivas";
import { leerRonda, rondaParaEnviar, sanearRonda, vistaRonda } from "../ronda-aparatos";

// RON1112C · todo con el reloj dado: ninguna prueba mira la hora de verdad.
const T0 = Date.parse("2026-11-12T10:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
const min = (n: number) => n * 60_000;

function archivo(extra: Record<string, unknown> = {}, ronda: Record<string, unknown> | null = {}) {
    return {
        formato: 1,
        t: iso(T0 + min(5)),
        cada_s: 60,
        ronda: ronda === null ? null : { activa: true, quien: "alex", motivo: "llamadas de prueba con la tableta", desde: iso(T0), hasta: iso(T0 + min(30)), tope: iso(T0 + min(90)), renovaciones: 0, fin: null, fin_por: null, ...ronda },
        silencio: { t: iso(T0 + min(5)), tranquila: true, carga1: 2.1, linea: "la Mac está tranquila: ningún trabajo pesado conocido y carga 2,1", pesados: [] },
        ...extra,
    };
}

describe("leerRonda", () => {
    it("lo que no es un archivo de ronda sale null y nunca lanza", () => {
        for (const x of [null, undefined, 3, "x", [], true]) expect(leerRonda(x)).toBeNull();
    });
    it("un archivo sin ronda es válido y dice que no hay", () => {
        const a = leerRonda(archivo({}, null));
        expect(a?.ronda).toBeNull();
    });
    it("el fin efectivo nunca pasa de 90 min desde que empezó, aunque el archivo diga más", () => {
        const a = leerRonda(archivo({}, { hasta: iso(T0 + min(600)) }));
        expect(a?.ronda?.hastaMs).toBe(T0 + min(90));
    });
    it("limpia rutas del disco del motivo y de las líneas", () => {
        const a = leerRonda(archivo({ silencio: { t: iso(T0), tranquila: false, linea: "mira /Users/alex/secreto/x", pesados: [{ tipo: "tsc", que: "tsc en /home/claude/z", lleva_s: 30 }] } }, { motivo: "probar /Users/alex/Documents/x" }));
        expect(JSON.stringify(a)).not.toMatch(/\/Users\/|\/home\//);
    });
});

describe("vistaRonda: manda la hora, no la bandera", () => {
    it("activa a mitad: dice quién, para qué, cuánto queda y que lo que corre sigue", () => {
        const v = vistaRonda(leerRonda(archivo({ t: iso(T0 + min(11)), silencio: { t: iso(T0 + min(11)), tranquila: true, carga1: 2.1, linea: "la Mac está tranquila: ningún trabajo pesado conocido y carga 2,1", pesados: [] } })), T0 + min(12));
        expect(v.activa).toBe(true);
        expect(v.estado).toBe("activa");
        expect(v.quedaS).toBe(18 * 60);
        expect(v.quedaTexto).toBe("quedan 18 min");
        expect(v.texto).toMatch(/alex la pidió para «llamadas de prueba con la tableta»/);
        expect(v.texto).toMatch(/lo que ya corría sigue/);
        expect(v.silencio?.estado).toBe("tranquila");
    });
    it("con la bandera activa pero la hora pasada, está acabada (el director puede estar parado)", () => {
        const v = vistaRonda(leerRonda(archivo()), T0 + min(31));
        expect(v.activa).toBe(false);
        expect(v.texto).toMatch(/ya venció/);
    });
    it("con la bandera apagada pero la hora vigente y un `fin` vacío sigue activa; con `fin` no", () => {
        expect(vistaRonda(leerRonda(archivo({}, { activa: false })), T0 + min(1)).activa).toBe(true);
        const terminada = vistaRonda(leerRonda(archivo({}, { fin: iso(T0 + min(3)), fin_por: "alex" })), T0 + min(4));
        expect(terminada.activa).toBe(false);
        expect(terminada.texto).toMatch(/la terminó alex/);
    });
    it("la que el director marcó como caducada dice que caducó sola", () => {
        const v = vistaRonda(leerRonda(archivo({}, { fin: iso(T0 + min(30)), fin_por: "caducó" })), T0 + min(40));
        expect(v.activa).toBe(false);
        expect(v.texto).toMatch(/caducó sola/);
        expect(v.texto).not.toMatch(/la terminó/);
    });
    it("un hasta lejano no alarga: a los 91 min se acabó", () => {
        expect(vistaRonda(leerRonda(archivo({}, { hasta: iso(T0 + min(600)) })), T0 + min(91)).activa).toBe(false);
    });
    it("en su tope no se puede renovar más", () => {
        const v = vistaRonda(leerRonda(archivo({}, { hasta: iso(T0 + min(90)) })), T0 + min(60));
        expect(v.enSuTope).toBe(true);
        expect(vistaRonda(leerRonda(archivo()), T0 + min(1)).enSuTope).toBe(false);
    });
    it("sin archivo y archivo ilegible: sin ronda, y el ilegible lo dice", () => {
        expect(vistaRonda(null, T0)).toMatchObject({ estado: "sin-archivo", activa: false });
        const i = vistaRonda("ilegible", T0);
        expect(i).toMatchObject({ estado: "ilegible", activa: false });
        expect(i.texto).toMatch(/No pude leer/);
    });
    it("la medición vieja no se da por calma", () => {
        const v = vistaRonda(leerRonda(archivo({ t: iso(T0), silencio: { t: iso(T0), tranquila: true, linea: "la Mac está tranquila", pesados: [] } })), T0 + min(20));
        expect(v.silencio?.estado).toBe("sin-medir");
        expect(v.silencio?.viejo).toBe(true);
        expect(v.silencio?.texto).toMatch(/no sé si está tranquila ahora/);
    });
    it("un trabajo pesado en marcha se cuenta tal cual lo midió el director", () => {
        const v = vistaRonda(leerRonda(archivo({ silencio: { t: iso(T0 + min(5)), tranquila: false, carga1: 41, linea: "espera a que termine las pruebas de TypeScript, unos 4 min", pesados: [{ tipo: "tsc", que: "las pruebas de TypeScript", lleva_s: 90, suele_s: 330, faltan_s: 240 }] } })), T0 + min(5));
        expect(v.silencio?.estado).toBe("ocupada");
        expect(v.silencio?.texto).toBe("Espera a que termine las pruebas de TypeScript, unos 4 min.");
    });
    it("sin medición alguna lo dice en vez de callar", () => {
        const a = leerRonda({ ...archivo(), silencio: null });
        expect(vistaRonda(a, T0 + min(1)).silencio?.estado).toBe("sin-medir");
    });
});

describe("lo que viaja a las otras neuronas", () => {
    it("sólo la ronda en vigor a esa hora, sólo quién, para qué y cuándo", () => {
        const a = leerRonda(archivo());
        expect(rondaParaEnviar(a, T0 + min(1))).toEqual({ quien: "alex", motivo: "llamadas de prueba con la tableta", desdeMs: T0, hastaMs: T0 + min(30) });
        expect(rondaParaEnviar(a, T0 + min(31))).toBeNull();
        expect(rondaParaEnviar("ilegible", T0)).toBeNull();
        expect(rondaParaEnviar(null, T0)).toBeNull();
    });
    it("lo recibido pasa por la lista blanca", () => {
        expect(sanearRonda({ quien: "alex", motivo: "x /Users/alex/a", desdeMs: T0, hastaMs: T0 + min(30), extra: "no" })).toEqual({ quien: "alex", motivo: "x [ruta]", desdeMs: T0, hastaMs: T0 + min(30) });
        expect(sanearRonda({ desdeMs: T0, hastaMs: T0 - 1 })).toBeNull();
        expect(sanearRonda("basura")).toBeNull();
        expect(sanearRonda({ quien: "a", desdeMs: T0, hastaMs: T0 + min(900) })?.hastaMs).toBe(T0 + min(90));
    });
    it("llega a «Qué corre ahora»: lo primero que dice la frase, sin contarla como proceso vivo", () => {
        const e = sanearEnMarcha({ generadoMs: T0, ronda: { quien: "alex", motivo: "llamadas", desdeMs: T0, hastaMs: T0 + min(30) } });
        expect(e?.ronda?.quien).toBe("alex");
        const v = vistaEnMarcha(e, T0 + min(10));
        expect(v.ronda?.quedaS).toBe(20 * 60);
        expect(v.frase).toMatch(/^Ronda de aparatos activa \(alex: llamadas\): nada pesado empieza; quedan 20 min\. No corre nada ahora\./);
        expect(v.algoCorre).toBe(false);
        expect(v.vivos).toBe(0);
    });
    it("vencida a esa hora ya no aparece, y sin ronda la frase es la de siempre", () => {
        const e = sanearEnMarcha({ generadoMs: T0, ronda: { quien: "alex", motivo: "llamadas", desdeMs: T0, hastaMs: T0 + min(30) } });
        expect(vistaEnMarcha(e, T0 + min(31)).ronda).toBeNull();
        expect(vistaEnMarcha(null, T0).frase).toMatch(/^No corre nada ahora\./);
        expect(vistaEnMarcha(null, T0).ronda).toBeNull();
    });
});

describe("peticiones de la ronda (validarControl y el archivo que lee el director)", () => {
    it("iniciar pide motivo; minutos 1 a 90 o 30 por defecto", () => {
        expect(validarControl({ accion: "ronda-iniciar" })).toMatchObject({ error: expect.stringMatching(/motivo/) });
        expect(validarControl({ accion: "ronda-iniciar", nota: "   " })).toMatchObject({ error: expect.stringMatching(/motivo/) });
        expect(validarControl({ accion: "ronda-iniciar", nota: "x".repeat(201) })).toMatchObject({ error: expect.stringMatching(/largo/) });
        for (const m of [0, 91, 1.5, "30", -3]) expect(validarControl({ accion: "ronda-iniciar", nota: "llamadas", minutos: m })).toMatchObject({ error: expect.stringMatching(/1 a 90/) });
        expect(validarControl({ accion: "ronda-iniciar", nota: " llamadas   de   prueba ", minutos: 45 })).toMatchObject({ accion: "ronda-iniciar", nota: "llamadas de prueba", minutos: 45 });
        expect(validarControl({ accion: "ronda-iniciar", nota: "llamadas" })).toMatchObject({ minutos: null });
    });
    it("terminar no lleva nada más", () => {
        expect(validarControl({ accion: "ronda-terminar", nota: "x", minutos: 5, sha: "a".repeat(40) })).toMatchObject({ accion: "ronda-terminar", nota: null, sha: null });
    });
    it("el archivo trae el motivo en `nota` y los minutos sólo al iniciar", () => {
        const ini = validarControl({ accion: "ronda-iniciar", nota: "llamadas", minutos: 45 });
        if ("error" in ini) throw new Error(ini.error);
        expect(cuerpoDePeticion(ini, "pet-1-abcd", "2026-11-12T10:00:00Z")).toMatchObject({ accion: "ronda-iniciar", nota: "llamadas", minutos: 45, sha: null, numero: null, prueba: null });
        const fin = validarControl({ accion: "ronda-terminar" });
        if ("error" in fin) throw new Error(fin.error);
        expect("minutos" in cuerpoDePeticion(fin, "pet-2-abcd", "2026-11-12T10:00:00Z")).toBe(false);
    });
    it("el resto de acciones sigue escribiendo el mismo archivo de antes (sin `minutos`)", () => {
        const c = validarControl({ accion: "cancelar", numero: 39 });
        if ("error" in c) throw new Error(c.error);
        expect("minutos" in cuerpoDePeticion(c, "pet-3-abcd", "2026-11-12T10:00:00Z")).toBe(false);
    });
    it("el director en pausa lee las de la ronda; parado, sin archivo o ilegible no", () => {
        const base = { formato: 1, t: iso(T0), cadaS: 60, pasada: 1, pidOk: true, enCurso: null, esperando: null, ultimas: [], peticiones: [], avisos: [] };
        const vivo = (extra: Record<string, unknown>) => vistaDirector({ ...base, pausado: false, pausaMotivo: null, ...extra } as never, T0 + 5_000);
        expect(leePeticionesDeRonda(vivo({}))).toBe(true);
        expect(leePeticionesDeRonda(vivo({ pausado: true, pausaMotivo: "mantenimiento" }))).toBe(true);
        expect(vivo({ pausado: true }).leePeticiones).toBe(false); // lo demás sigue sin leerse en pausa
        expect(leePeticionesDeRonda(vivo({ pidOk: false }))).toBe(false);
        expect(leePeticionesDeRonda(vistaDirector(null, T0))).toBe(false);
        expect(leePeticionesDeRonda(vistaDirector("ilegible", T0))).toBe(false);
    });
});
