import { describe, expect, it } from "vitest";

import {
    ALCANCES_PRIVADOS,
    MARCAS,
    crearTraductor,
    motorAstraura,
    motorLibreTranslate,
    motorNavegador,
    protegerMarcas,
    restaurarMarcas,
    type MotorTraduccion,
} from "@/lib/traduccion/motor";

function motorFalso(id: string, alcance: MotorTraduccion["alcance"], opciones: { disponible?: boolean; salir?: (t: string) => string; llamadas?: string[][] } = {}): MotorTraduccion {
    return {
        id,
        alcance,
        disponible: async () => opciones.disponible ?? true,
        traducir: async (textos, _origen, _destino) => {
            if (opciones.llamadas) opciones.llamadas.push([...textos]);
            return textos.map((t) => (opciones.salir ? opciones.salir(t) : t));
        },
    };
}

describe("marca protegida", () => {
    it("protege y restaura cada marca, y las largas ganan a las cortas", () => {
        const original = "MetaGenesis y ProtoGenesis comparten Genesis con StarSeed.";
        const protegido = protegerMarcas(original);
        expect(protegido.texto).not.toContain("Genesis");
        expect(restaurarMarcas(protegido.texto, protegido.marcas)).toBe(original);
        expect(MARCAS).toContain("Protomolécula");
        expect(ALCANCES_PRIVADOS).toEqual(["aparato", "cuenta", "cerebro"]);
    });

    it("la traducción de un motor toca los marcadores, no la marca", async () => {
        const trad = crearTraductor([motorFalso("grito", "publico", { salir: (t) => t.toUpperCase() })]);
        const [r] = await trad.traducir(["Bienvenido a StarSeed y Trinity."], "es", "en");
        expect(r?.texto).toBe("BIENVENIDO A StarSeed Y Trinity.");
        expect(r?.motivo).toBe("traducido con grito");
        expect(r?.motor).toBe("grito");
    });
});

describe("orden y disponibilidad", () => {
    it("usa el primero disponible y salta al siguiente si no está o falla", async () => {
        const llamadas: string[][] = [];
        const falla = motorFalso("falla", "cuenta", { salir: () => { throw new Error("pinchó"); } });
        const ok = motorFalso("ok", "cuenta", { salir: (t) => t + "!", llamadas });
        const [r] = await crearTraductor([motorFalso("apagado", "cuenta", { disponible: false }), falla, ok]).traducir(["hola"], "es", "en");
        expect(r?.texto).toBe("hola!");
        expect(r?.motor).toBe("ok");
    });

    it("mensaje honesto cuando ninguno está disponible", async () => {
        const trad = crearTraductor([motorFalso("nada", "malla", { disponible: false })]);
        await expect(trad.traducir(["hola"], "es", "pt")).rejects.toThrow("Ningún traductor disponible para es → pt");
    });
});

describe("privacidad y caché", () => {
    it("con privado:true solo alcanza aparato, cuenta o cerebro", async () => {
        const trad = crearTraductor([
            motorFalso("publico", "publico"),
            motorFalso("malla", "malla"),
            motorFalso("cerebro", "cerebro", { salir: (t) => t + "·" }),
        ], { privado: true });
        const [r] = await trad.traducir(["hola"], "es", "en");
        expect(r?.motor).toBe("cerebro");
    });

    it("sin motor privado no traduce y lo dice", async () => {
        const trad = crearTraductor([motorFalso("publico", "publico")], { privado: true });
        await expect(trad.traducir(["hola"], "es", "en")).rejects.toThrow("en modo privado");
    });

    it("caché sirve lo guardado y es acotada", async () => {
        const llamadas: string[][] = [];
        const trad = crearTraductor([motorFalso("m", "cuenta", { llamadas })]);
        await trad.traducir(["a", "b"], "es", "en");
        expect(llamadas).toHaveLength(1);
        expect((await trad.traducir(["a"], "es", "en"))[0]?.motivo).toBe("desde la caché");
        expect(llamadas).toHaveLength(1);
        const acotada = crearTraductor([motorFalso("m", "cuenta", { llamadas })], { topeCache: 1 });
        await acotada.traducir(["uno", "dos", "tres"], "es", "en");
        expect((await acotada.traducir(["tres"], "es", "en"))[0]?.motivo).toBe("desde la caché");
        expect((await acotada.traducir(["uno"], "es", "en"))[0]?.motivo).toBe("traducido con m");
    });
});

describe("fábricas", () => {
    it("navegador: disponible con availability «available», no sin Translator", async () => {
        const translator: unknown = {
            availability: async () => "available",
            create: async () => ({ translate: async (t: string) => t + "!" }),
        };
        const motor = motorNavegador({ Translator: translator });
        expect(motor.alcance).toBe("aparato");
        expect(await motor.disponible("es", "en")).toBe(true);
        expect(await motor.traducir(["Astraura saluda"], "es", "en")).toEqual(["Astraura saluda!"]);
        const sinApi = motorNavegador({});
        expect(await sinApi.disponible("es", "en")).toBe(false);
        await expect(sinApi.traducir(["x"], "es", "en")).rejects.toThrow("no trae la Translator API");
    });

    it("LibreTranslate (TRD1020A) y Astraura con función inyectada", async () => {
        const cliente = {
            traducir: async (p: { q: string[] }) => ({ translatedText: p.q.map((t) => t + "«lt»") }),
            salud: async () => true,
        };
        const lt = motorLibreTranslate(cliente, "malla");
        expect(lt.alcance).toBe("malla");
        expect(await lt.disponible("es", "en")).toBe(true);
        const astraura = motorAstraura(async (textos) => textos.map((t) => t + "«as»"));
        const [texto] = await astraura.traducir(["ProtoGenesis"], "es", "en");
        expect(texto).toBe("ProtoGenesis«as»");
        expect(await lt.traducir(["hola"], "es", "en")).toEqual(["hola«lt»"]);
    });
});
