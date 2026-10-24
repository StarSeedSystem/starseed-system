// La puerta única de voz (VZF1015I · `voz-fusionada-astraura.md` §3): prioridades, cola, interrupción
// y un `callar()` que calla a TODOS, también a la voz en vivo. Sin audio, red ni micrófono; reloj virtual.
import { describe, expect, it } from "vitest";
import { crearPuertaVoz, ESPERA_AVISO_MS, type MotoresVoz } from "@/lib/aurora/voz-unica";
/** `duraRt`: lo que suena cada frase en vivo (Infinity = no acaba sola). */
function banco(o: { rtListo?: boolean; cadenaSuena?: boolean; duraRt?: number } = {}, cambios: Partial<MotoresVoz> = {}) {
    const ev: string[] = [];
    const s = { t: 0, rtSuena: false, finRtEn: Infinity, cuando: {} as Record<string, number> };
    const m: MotoresVoz = {
        rt: {
            disponible: async () => o.rtListo ?? true,
            hablando: () => s.rtSuena,
            detener: () => { ev.push("rt.detener"); s.rtSuena = false; },
            decir: async (t) => { ev.push(`rt:${t}`); s.cuando[t] = s.t; s.rtSuena = true; s.finRtEn = s.t + (o.duraRt ?? Infinity); return true; },
        },
        cadena: async (t, c) => { ev.push(`cadena(${c}):${t}`); return o.cadenaSuena ?? true; },
        suelo: async (t) => { ev.push(`suelo:${t}`); return true; },
        callarResto: () => { ev.push("resto.callado"); },
        ahora: () => s.t,
        // Cada espera avanza el reloj y cede el turno de verdad (para poder intercalar órdenes).
        esperar: async (ms) => { s.t += ms; if (s.t >= s.finRtEn) s.rtSuena = false; await new Promise((ok) => setTimeout(ok, 0)); },
        registrar: (x) => { ev.push(`registro:${x}`); },
        ...cambios,
    };
    return { ev, s, puerta: crearPuertaVoz(m) };
}
describe("voz única · elige el motor como hoy", () => {
    it("la conversación va por la voz en vivo y sus frases se encolan sin cortarse (respuesta continua)", async () => {
        const { ev, puerta } = banco();
        const r = await Promise.all([puerta.hablar("Hola.", { contexto: "conversacion" }), puerta.hablar("¿Qué tal?", { contexto: "conversacion" })]);
        expect(r).toEqual([true, true]);
        expect(await puerta.hablar("   ", { contexto: "conversacion" })).toBe(false); // vacío: ni habla ni corta
        expect(ev).toEqual(["rt:Hola.", "rt:¿Qué tal?"]);
    });
    it("sin voz en vivo va por la cadena del registro con su contexto y, si declina, por el suelo", async () => {
        const { ev, puerta } = banco({ rtListo: false, cadenaSuena: false });
        expect(await puerta.hablar("Ventana abierta", { contexto: "ventana" })).toBe(true);
        expect(ev).toEqual(["cadena(ventana):Ventana abierta", "suelo:Ventana abierta"]);
    });
});

describe("voz única · prioridades e interrupción", () => {
    it("un aviso no corta la conversación: espera al silencio y entonces suena", async () => {
        const { ev, s, puerta } = banco();
        s.rtSuena = true;
        s.finRtEn = 3_000; // la conversación en vivo acaba a los 3 s
        expect(await puerta.hablar("Tarea lista", { contexto: "aviso" })).toBe(true);
        expect(ev).toEqual(["rt:Tarea lista"]); // nadie llamó a detener
        expect(s.cuando["Tarea lista"]).toBeGreaterThanOrEqual(3_000);
    });
    it("un aviso sin silencio en 8 s se descarta y queda registrado", async () => {
        const { ev, s, puerta } = banco();
        s.rtSuena = true;
        expect(await puerta.hablar("Tarea lista", { contexto: "aviso" })).toBe(false);
        expect(s.t).toBeGreaterThanOrEqual(ESPERA_AVISO_MS);
        expect(ev).toHaveLength(1);
        expect(ev[0]).toMatch(/^registro:.*«aviso» descartado/);
    });
    it("la conversación manda: corta a la ventana; una ventana sustituye a otra, nunca a la conversación", async () => {
        const { ev, puerta } = banco();
        await puerta.hablar("Ventana uno", { contexto: "ventana" });
        await puerta.hablar("Ventana dos", { contexto: "lectura" });
        await puerta.hablar("Te respondo", { contexto: "conversacion" });
        expect(ev).toEqual(["rt:Ventana uno", "rt.detener", "resto.callado", "rt:Ventana dos", "rt.detener", "resto.callado", "rt:Te respondo"]);
        expect(await puerta.hablar("Ventana tres", { contexto: "mando" })).toBe(false);
        expect(ev.at(-1)).toMatch(/«mando» descartado/);
        expect(await puerta.hablar("Corte urgente", { contexto: "aviso", prioridad: 4 })).toBe(true);
        expect(ev.slice(-3)).toEqual(["rt.detener", "resto.callado", "rt:Corte urgente"]);
    });
    it("una frase de la conversación por la cadena espera al fin de la anterior (no se pisan)", async () => {
        let fin: (() => void) | undefined;
        const { ev, s, puerta } = banco({ rtListo: false }, {
            cadena: async (t, _c, a) => { ev.push(`cadena:${t}`); s.cuando[t] = s.t; fin ??= a.alTerminar; return true; },
            esperar: async (ms) => { s.t += ms; if (s.t >= 1_000) fin?.(); await new Promise((ok) => setTimeout(ok, 0)); },
        });
        const r = await Promise.all([puerta.hablar("Uno.", { contexto: "conversacion" }), puerta.hablar("Dos.", { contexto: "conversacion", persona: "aurora" })]);
        expect(r).toEqual([true, true]);
        expect(ev).toEqual(["cadena:Uno.", "cadena:Dos."]);
        expect(s.cuando["Dos."]).toBeGreaterThanOrEqual(1_000);
        expect(s.cuando["Dos."]).toBeLessThan(8_000); // por su fin, no por el tope de seguridad
    });
});

describe("voz única · cola y callar", () => {
    it("guía y ritos van en cola, en orden, uno detrás de otro sin cortarse", async () => {
        const { ev, s, puerta } = banco({ duraRt: 1_000 });
        const r = await Promise.all([puerta.hablar("Bienvenida", { contexto: "rito" }), puerta.hablar("Primer paso", { contexto: "guia" })]);
        expect(r).toEqual([true, true]);
        expect(ev).toEqual(["rt:Bienvenida", "rt:Primer paso"]);
        expect(s.cuando["Primer paso"]).toBeGreaterThanOrEqual(1_000);
    });
    it("callar() calla a TODOS —también a la voz en vivo— y vacía la cola y las esperas", async () => {
        const { ev, puerta } = banco(); // el rito no acaba solo
        await puerta.hablar("Bienvenida", { contexto: "rito" });
        const pendientes = [puerta.hablar("Paso uno", { contexto: "guia" }), puerta.hablar("Aviso", { contexto: "aviso" })];
        await new Promise((ok) => setTimeout(ok, 5));
        puerta.callar();
        expect(await Promise.all(pendientes)).toEqual([false, false]);
        expect(ev).toEqual(["rt:Bienvenida", "rt.detener", "resto.callado"]);
        expect(puerta.ocupado().p).toBe(0);
        expect(await puerta.hablar("Hola de nuevo", { contexto: "aviso" })).toBe(true);
    });
    it("nunca lanza: un motor roto degrada la voz, no la existencia; callar sigue callando al resto", async () => {
        const roto = () => { throw new Error("roto"); };
        const { ev, puerta } = banco({}, { rt: { disponible: async () => roto(), hablando: roto, detener: roto, decir: async () => roto() }, cadena: async () => roto() });
        expect(await puerta.hablar("Sigo aquí", { contexto: "aviso" })).toBe(true);
        expect(ev).toEqual(["suelo:Sigo aquí"]);
        expect(() => puerta.callar()).not.toThrow();
        expect(ev).toContain("resto.callado");
    });
    it("callar() ni entra en bucle ni se corta a sí misma si quien calla (engine.interrupt) vuelve a callar()", async () => {
        let vueltas = 0;
        const { ev, puerta } = banco({}, { callarResto: () => { vueltas++; puerta.callar(); } });
        await puerta.hablar("Ventana uno", { contexto: "ventana" });
        expect(await puerta.hablar("Te respondo", { contexto: "conversacion" })).toBe(true); // la vuelta no la mata
        puerta.callar();
        expect(vueltas).toBe(2);
        expect(ev).toEqual(["rt:Ventana uno", "rt.detener", "rt:Te respondo", "rt.detener"]);
    });
});
