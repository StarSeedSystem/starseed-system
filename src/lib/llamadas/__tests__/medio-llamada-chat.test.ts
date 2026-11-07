/**
 * NEU1107A · por dónde va una llamada de un chat (pura): servidor + enlaces directos de ESTE chat,
 * llamada directa por el enlace sin internet, o el motivo honesto de que no se pueda.
 */
import { describe, expect, it } from "vitest";
import { enlacesDelChat, MAX_DIRECTOS_CHAT, planLlamadaChat, type EnlaceLlamadaChat } from "@/lib/llamadas/medio-llamada-chat";
import type { PreferenciasMedio } from "@/lib/mensajeria/medios/tipos";

const AUTO: PreferenciasMedio = { modo: "auto", elegidos: [], siNinguno: "esperar" };
const elegidos = (...m: PreferenciasMedio["elegidos"]): PreferenciasMedio => ({ modo: "elegidos", elegidos: m, siNinguno: "esperar" });

const YO = "u-yo";
const ANA = "u-ana";
const LUIS = "u-luis";
const enlace = (id: string, uid?: string, abierto = true): EnlaceLlamadaChat => ({ id: `local:${id}`, nombre: `Aparato ${id}`, abierto, ...(uid ? { uid } : {}) });

const base = {
    preferencias: AUTO,
    internet: true,
    sesion: true,
    miembros: [YO, ANA],
    miUid: YO,
    enlaces: [] as EnlaceLlamadaChat[],
    tipoLlamada: "audio",
};

describe("enlacesDelChat", () => {
    it("solo aparatos de este chat, de tu cuenta o sin cuenta dicha; los de otras personas y los cerrados, fuera con motivo", () => {
        const r = enlacesDelChat([enlace("a", ANA), enlace("b", YO), enlace("c"), enlace("d", LUIS), enlace("e", ANA, false), enlace("a", ANA)], [YO, ANA], YO);
        expect(r.utiles.map((e) => e.id)).toEqual(["local:a", "local:b", "local:c"]);
        expect(r.descartados).toEqual([
            { medio: "local", enlaceId: "local:d", etiqueta: "Aparato d", motivo: "ese aparato es de alguien que no está en este chat" },
            { medio: "local", enlaceId: "local:e", etiqueta: "Aparato e", motivo: "el enlace ya no está abierto" },
        ]);
    });
});

describe("planLlamadaChat", () => {
    it("automático con internet: el sistema de llamadas y, como canal directo, solo los enlaces de este chat", () => {
        const p = planLlamadaChat({ ...base, enlaces: [enlace("a", ANA), enlace("d", LUIS)] });
        expect(p.via).toBe("sistema-llamadas");
        expect(p.directos).toEqual(["local:a"]);
        expect(p.texto).toBe("por el servidor y por enlace directo (misma red)");
        expect(p.descartados.map((d) => d.enlaceId)).toEqual(["local:d"]);
    });

    it("sin enlaces locales: solo el servidor (WebRTC)", () => {
        const p = planLlamadaChat(base);
        expect(p).toEqual({ via: "sistema-llamadas", directos: [], texto: "por el servidor (WebRTC)", descartados: [] });
    });

    it("si el chat no permite «local», no abre canales directos y lo dice", () => {
        const p = planLlamadaChat({ ...base, preferencias: elegidos("servidor"), enlaces: [enlace("a", ANA)] });
        expect(p.via).toBe("sistema-llamadas");
        expect(p.directos).toEqual([]);
        expect(p.descartados).toContainEqual({ medio: "local", enlaceId: "local:a", etiqueta: "Aparato a", motivo: "el enlace sin internet no está entre los medios elegidos de este chat" });
    });

    it("solo el enlace sin internet elegido: llamada directa 1:1 aunque haya internet (sin servidores)", () => {
        const p = planLlamadaChat({ ...base, preferencias: elegidos("local"), enlaces: [enlace("x"), enlace("a", ANA)] });
        expect(p.via).toBe("enlace-local");
        expect(p.enlaceId).toBe("local:a");
        expect(p.otroUid).toBe(ANA);
        expect(p.descartados).toContainEqual({ medio: "servidor", motivo: "ni el servidor ni el P2P por internet están entre los medios elegidos de este chat" });
    });

    it("sin internet en un 1:1 con enlace a su aparato: llamada directa por él", () => {
        const p = planLlamadaChat({ ...base, internet: false, enlaces: [enlace("a", ANA)] });
        expect(p.via).toBe("enlace-local");
        expect(p.texto).toBe("llamada directa por el enlace sin internet (sin servidores)");
        expect(p.descartados).toContainEqual({ medio: "servidor", motivo: "no hay internet ahora" });
    });

    it("sin internet y sin enlace con su aparato: no hay cómo, y dice cómo vincularlos", () => {
        const p = planLlamadaChat({ ...base, internet: false, enlaces: [enlace("x")] });
        expect(p.via).toBeNull();
        expect(p.aviso).toMatch(/sin internet/);
        expect(p.aviso).toMatch(/Vincular sin internet/);
    });

    it("sin internet en un grupo: la llamada directa es de dos, lo dice", () => {
        const p = planLlamadaChat({ ...base, internet: false, miembros: [YO, ANA, LUIS], enlaces: [enlace("a", ANA), enlace("l", LUIS)] });
        expect(p.via).toBeNull();
        expect(p.aviso).toMatch(/es de dos/);
    });

    it("las salas VR y AR necesitan el servidor", () => {
        const p = planLlamadaChat({ ...base, internet: false, tipoLlamada: "sala-vr", enlaces: [enlace("a", ANA)] });
        expect(p.via).toBeNull();
        expect(p.aviso).toMatch(/salas VR y AR necesitan el servidor/);
    });

    it("medios que no llevan voz (LoRa, relé) se descartan con su motivo; con el servidor también elegido, se llama por él", () => {
        const p = planLlamadaChat({ ...base, preferencias: elegidos("lora", "rele", "servidor") });
        expect(p.via).toBe("sistema-llamadas");
        expect(p.descartados.find((d) => d.medio === "lora")?.motivo).toMatch(/LoRa solo lleva mensajes cortos/);
        expect(p.descartados.find((d) => d.medio === "rele")?.motivo).toMatch(/solo lleva mensajes/);
    });

    it("solo LoRa y relé elegidos: no hay cómo llamar, y dice qué añadir", () => {
        const p = planLlamadaChat({ ...base, preferencias: elegidos("lora", "rele"), enlaces: [enlace("a", ANA)] });
        expect(p.via).toBeNull();
        expect(p.aviso).toMatch(/Enlace directo sin internet/);
    });

    it(`como mucho ${MAX_DIRECTOS_CHAT} canales directos`, () => {
        const muchos = Array.from({ length: 10 }, (_, i) => enlace(`m${i}`, YO));
        expect(planLlamadaChat({ ...base, enlaces: muchos }).directos).toHaveLength(MAX_DIRECTOS_CHAT);
    });

    it("sin sesión pero con internet: directa si hay enlace; si no, pide iniciar sesión", () => {
        expect(planLlamadaChat({ ...base, sesion: false, enlaces: [enlace("a", ANA)] }).via).toBe("enlace-local");
        const p = planLlamadaChat({ ...base, sesion: false });
        expect(p.via).toBeNull();
        expect(p.descartados).toContainEqual({ medio: "servidor", motivo: "inicia sesión para llamar por internet" });
    });

    it("determinista: mismas entradas, mismo plan", () => {
        const e = { ...base, internet: false, enlaces: [enlace("a", ANA), enlace("d", LUIS)] };
        expect(planLlamadaChat(e)).toEqual(planLlamadaChat(e));
    });
});
