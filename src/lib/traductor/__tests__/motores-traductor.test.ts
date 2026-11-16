import { describe, expect, it } from "vitest";

import type { MotorTraduccion, AlcanceMotor } from "@/lib/traduccion/motor";
import { construirMotores, crearServicioTraduccion, motoresDeEsteTexto } from "../motores-traductor";

function motorFalso(
    id: MotorTraduccion["id"],
    alcance: AlcanceMotor,
    o: { disponible?: boolean; salir?: (t: string) => string; falla?: boolean } = {}
): MotorTraduccion {
    return {
        id,
        alcance,
        disponible: async () => o.disponible ?? true,
        traducir: async (textos, _origen, _destino) => {
            if (o.falla) throw new Error(`${id} falló`);
            return textos.map((t) => (o.salir ? o.salir(t) : t));
        },
    };
}

describe("construirMotores", () => {
    it("respeta el orden: local › navegador › libretranslate › astraura › malla", () => {
        const deps = {
            local: motorFalso("paquete-local", "aparato"),
            navegador: motorFalso("navegador", "aparato"),
            libretranslate: motorFalso("libretranslate", "cuenta"),
            astraura: motorFalso("astraura", "publico"),
            malla: motorFalso("malla", "malla"),
            permitidos: {},
        };
        expect(construirMotores(deps).map((m) => m.id)).toEqual([
            "paquete-local", "navegador", "libretranslate", "astraura", "malla",
        ]);
    });

    it("excluye motores con permitidos[id] === false", () => {
        const deps = {
            local: motorFalso("paquete-local", "aparato"),
            navegador: motorFalso("navegador", "aparato"),
            libretranslate: motorFalso("libretranslate", "cuenta"),
            astraura: motorFalso("astraura", "publico"),
            malla: motorFalso("malla", "malla"),
            permitidos: { libretranslate: false, malla: false },
        };
        expect(construirMotores(deps).map((m) => m.id)).toEqual(["paquete-local", "navegador", "astraura"]);
    });

    it("salta motores undefined", () => {
        expect(construirMotores({ local: motorFalso("paquete-local", "aparato"), navegador: motorFalso("navegador", "aparato"), permitidos: {} }).map((m) => m.id)).toEqual(["paquete-local", "navegador"]);
    });
});

describe("crearServicioTraduccion", () => {
    it("en modo privado filtra solo aparato, cuenta, cerebro", async () => {
        const servicio = crearServicioTraduccion({ privado: true, motores: [motorFalso("publico", "publico", { salir: (t) => t + "-pub" }), motorFalso("malla", "malla", { salir: (t) => t + "-malla" }), motorFalso("cerebro", "cerebro", { salir: (t) => t + "-cer" })] });
        const [r] = await servicio.traducir(["hola"], "es", "en");
        expect(r.texto).toBe("hola-cer");
        expect(r.motor).toBe("cerebro");
    });

    it("en modo privado sin motor privado lanza error al traducir", async () => {
        const servicio = crearServicioTraduccion({ privado: true, motores: [motorFalso("publico", "publico")] });
        await expect(servicio.traducir(["hola"], "es", "en")).rejects.toThrow(/en modo privado no hay motores de alcance privado disponible/);
        const servicio2 = crearServicioTraduccion({ privado: true, motores: [motorFalso("malla", "malla")] });
        await expect(servicio2.traducir(["hola"], "es", "en")).rejects.toThrow(/en modo privado no hay motores de alcance privado disponible/);
    });

    it("un motor que falla pasa al siguiente y el resultado dice cuál tradujo", async () => {
        const servicio = crearServicioTraduccion({ privado: false, motores: [motorFalso("falla", "aparato", { falla: true }), motorFalso("ok", "cuenta", { salir: (t) => t + "!" })] });
        const [r] = await servicio.traducir(["hola"], "es", "en");
        expect(r.texto).toBe("hola!");
        expect(r.motor).toBe("ok");
    });

    it("sin ningún motor apto lanza error claro", async () => {
        const servicio = crearServicioTraduccion({ privado: false, motores: [motorFalso("apagado", "aparato", { disponible: false })] });
        await expect(servicio.traducir(["hola"], "es", "en")).rejects.toThrow(/Ningún traductor disponible para es → en/);
    });

    it("en modo privado sin motor privado lanza error claro", async () => {
        const servicio = crearServicioTraduccion({ privado: true, motores: [motorFalso("publico", "publico")] });
        await expect(servicio.traducir(["hola"], "es", "en")).rejects.toThrow(/en modo privado/);
    });
});

describe("motoresDeEsteTexto", () => {
    it("devuelve solo motores disponibles con su flag sale", async () => {
        const r = await motoresDeEsteTexto([motorFalso("paquete-local", "aparato"), motorFalso("navegador", "aparato", { disponible: false }), motorFalso("libretranslate", "cuenta"), motorFalso("astraura", "publico"), motorFalso("malla", "malla")], { origen: "es", destino: "en" }, false);
        expect(r.map((x) => x.motor.id)).toEqual(["paquete-local", "libretranslate", "astraura", "malla"]);
        expect(r.map((x) => x.sale)).toEqual([false, false, true, true]);
    });

    it("en modo privado solo devuelve motores de alcance privado", async () => {
        const r = await motoresDeEsteTexto([motorFalso("paquete-local", "aparato"), motorFalso("libretranslate", "cuenta"), motorFalso("astraura", "publico"), motorFalso("malla", "malla")], { origen: "es", destino: "en" }, true);
        expect(r.map((x) => x.motor.id)).toEqual(["paquete-local", "libretranslate"]);
        expect(r.map((x) => x.sale)).toEqual([false, false]);
    });

    it("respeta el orden de los motores pasados", async () => {
        const r = await motoresDeEsteTexto([motorFalso("astraura", "publico"), motorFalso("paquete-local", "aparato")], { origen: "es", destino: "en" }, false);
        expect(r.map((x) => x.motor.id)).toEqual(["astraura", "paquete-local"]);
    });
});