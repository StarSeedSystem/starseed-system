import { describe, it, expect } from "vitest";
import type { Decision } from "@/lib/astraura-bots/permisos";
import type { AccionBot } from "@/lib/astraura-bots/acciones";
import { bucleInicial, avanzar, type EstadoBucle, type EventoBucle } from "@/lib/astraura-bots/bucle";
import { estadoOrbeDeBucle } from "@/lib/astraura-bots/estado-orbe";

const SI: Decision = { permitido: true, requiere: "nada", motivo: "Permitido.", indicador: true };
const CONFIRMA: Decision = { permitido: false, requiere: "confirmacion", motivo: "Confirma.", indicador: false };
const BOT = "bot:a";

function navegar(): AccionBot {
    return { tipo: "navegar", args: { ruta: "/dashboard" } };
}

function sim(eventos: EventoBucle[]): EstadoBucle {
    return eventos.reduce((e, ev) => avanzar(e, ev), bucleInicial(BOT));
}

describe("estadoOrbeDeBucle — la fase del bucle manda el estado de la orbe", () => {
    it("sin bucle o en reposo la orbe está en reposo", () => {
        expect(estadoOrbeDeBucle()).toBe("reposo");
        expect(estadoOrbeDeBucle(bucleInicial(BOT))).toBe("reposo");
    });

    it("un sentido abierto pone la orbe a la escucha", () => {
        const e = sim([{ tipo: "observar", sentido: "microfono", decision: SI, at: 1 }]);
        expect(estadoOrbeDeBucle(e)).toBe("escucha");
    });

    it("una propuesta a la espera de confirmación la deja pensando y la confirmación la hace hablar", () => {
        const esperando = sim([
            { tipo: "observar", sentido: "pantalla", decision: SI, at: 1 },
            { tipo: "proponer", accion: navegar(), decision: CONFIRMA, at: 2 },
        ]);
        expect(estadoOrbeDeBucle(esperando)).toBe("piensa");
        const actuando = avanzar(esperando, { tipo: "confirmar", quien: "persona", at: 3 });
        expect(estadoOrbeDeBucle(actuando)).toBe("habla");
    });

    it("aplicada, hecho, rechazado y pausado vuelven al reposo", () => {
        const esperando = sim([{ tipo: "proponer", accion: navegar(), decision: CONFIRMA, at: 1 }]);
        expect(estadoOrbeDeBucle(avanzar(esperando, { tipo: "rechazar", quien: "persona", at: 2 }))).toBe("reposo");
        const enMarcha = avanzar(esperando, { tipo: "confirmar", quien: "persona", at: 2 });
        expect(estadoOrbeDeBucle(avanzar(enMarcha, { tipo: "pausar", quien: "persona", at: 3 }))).toBe("reposo");
    });
});
