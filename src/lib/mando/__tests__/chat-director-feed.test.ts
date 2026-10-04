import { describe, it, expect } from "vitest";

import {
    desdeBitacora,
    desdeCanal,
    desdeEvento,
    epochDe,
    filtrarFeed,
    fusionarFeed,
    plegarEntregas,
    rolDeDirector,
} from "@/lib/mando/chat-director-feed";

import type { MensajeDirector } from "@/lib/mando/chat-director-tipos";

function mensaje(parcial: Partial<MensajeDirector>): MensajeDirector {
    return {
        id: "md-1760000000000-ab12",
        t: "2026-10-04T10:00:00-06:00",
        de: "astra",
        rol: "director",
        tipo: "mensaje",
        texto: "Texto de prueba del feed del Director.",
        canal: "mando",
        ...parcial,
    };
}

describe("epochDe", () => {
    it("lee ISO con zona", () => {
        expect(epochDe("1970-01-01T00:00:10Z")).toBe(10);
    });
    it("lee «2026-10-03 23:07:42» como hora local", () => {
        expect(epochDe("2026-10-03 23:07:42"))
            .toBe(new Date(2026, 9, 3, 23, 7, 42).getTime() / 1000);
    });
    it("ilegible → 0", () => {
        expect(epochDe("ayer por la tarde")).toBe(0);
    });
});

describe("rolDeDirector", () => {
    it("clasifica los paneles del contrato", () => {
        expect(rolDeDirector("vigia-medidores")).toBe("verificador");
        expect(rolDeDirector("claude-cowork")).toBe("supervisor");
        expect(rolDeDirector("desatascador")).toBe("restaurador");
        expect(rolDeDirector("gobernador")).toBe("protector");
        expect(rolDeDirector("orquestador")).toBe("procesos");
        expect(rolDeDirector("fulanito", "fallo_tsc")).toBe("pruebas");
        expect(rolDeDirector("informe-pruebas")).toBe("informes");
        expect(rolDeDirector("jev")).toBe("usos");
        expect(rolDeDirector("fulanito")).toBe("agente");
    });
});

describe("desdeCanal", () => {
    it("convierte una fila real del canal común", () => {
        const m = desdeCanal({
            t: "2026-10-03 23:07:42",
            epoch: 1759532862,
            quien: "hermes",
            tipo: "hecho",
            texto: "zN4 en verde: 14 tests, salas.ts listo",
            tarea: "zN4",
        });
        expect(m).toMatchObject({
            id: "cn-1759532862000-hermes",
            de: "hermes",
            rol: "director",
            tipo: "informe",
            canal: "mando",
            tarea: "zN4",
        });
    });
    it("telegram-puente habla como Alex por el canal telegram", () => {
        const m = desdeCanal({ t: "2026-10-04T08:00:00-06:00", epoch: 1759530000, quien: "telegram-puente", tipo: "mensaje", texto: "Hola" });
        expect(m && [m.rol, m.canal]).toEqual(["alex", "telegram"]);
    });
    it("error → aviso; basura → null", () => {
        expect(desdeCanal({ epoch: 1, quien: "astra", tipo: "error", texto: "x" })?.tipo).toBe("aviso");
        expect(desdeCanal({ epoch: 1, tipo: "mensaje", texto: "sin quien" })).toBeNull();
        expect(desdeCanal(42)).toBeNull();
    });
});

describe("desdeEvento", () => {
    it("admite los eventos del enjambre del contrato", () => {
        const m = desdeEvento({ t: "2026-10-04T09:15:00-06:00", quien: "orquestador", tipo: "esperando_aprobacion", tarea: "CDB1004", texto: "CDB1004 espera aprobación" });
        expect(m).toMatchObject({ id: "ev-2026-10-04T09:15:00-06:00-CDB1004-esperando_aprobacion", de: "enjambre", rol: "agente", tipo: "actualizacion", canal: "mando" });
        expect(desdeEvento({ t: "x", tipo: "fallo_tests", texto: "tsc rojo" })).not.toBeNull();
        expect(desdeEvento({ t: "x", tipo: "aviso", texto: "cola terminada sin pendientes" })).not.toBeNull();
    });
    it("el ruido devuelve null", () => {
        expect(desdeEvento({ t: "x", tipo: "latido", texto: "vivo" })).toBeNull();
        expect(desdeEvento(null)).toBeNull();
    });
});

describe("desdeBitacora", () => {
    it("claude habla como director; el resto como agente", () => {
        const m = desdeBitacora({ t: "2026-10-04T07:30:00-06:00", quien: "claude", tipo: "relevo", texto: "Cierro la ola con todo integrado." });
        expect(m && [m.id, m.rol, m.tipo]).toEqual(["rb-2026-10-04T07:30:00-06:00-claude", "director", "mensaje"]);
        expect(desdeBitacora({ t: "2026-10-04T07:31:00Z", quien: "hermes", tipo: "relevo", texto: "Recibo." })?.rol).toBe("agente");
        expect(desdeBitacora({ tipo: "relevo" })).toBeNull();
    });
});

describe("plegarEntregas", () => {
    it("manda el último estado por (de_id, canal)", () => {
        const r = plegarEntregas([
            { tipo: "entrega", de_id: "md-1-ab12", canal: "telegram", estado: "pendiente", t: "2026-10-04T01:00:00Z" },
            { tipo: "entrega", de_id: "md-1-ab12", canal: "telegram", estado: "entregado", t: "2026-10-04T01:02:00Z" },
            { tipo: "entrega", de_id: "md-2-cd34", canal: "hermes", estado: "respondido", t: "2026-10-04T01:03:00Z" },
            { no: "entrega" },
        ]);
        expect(r).toEqual({
            "md-1-ab12": { telegram: "entregado" },
            "md-2-cd34": { hermes: "respondido" },
        });
    });
});

describe("fusionarFeed", () => {
    it("ordena por tiempo, estable y sin duplicar ids", () => {
        const a = mensaje({ id: "a", t: "2026-10-04T03:00:00Z" });
        const b = mensaje({ id: "b", t: "2026-10-04T01:00:00Z" });
        const bDup = mensaje({ id: "b", texto: "copia" });
        const c = mensaje({ id: "c", t: "2026-10-04T01:00:00Z" });
        expect(fusionarFeed([a, b], [bDup, c]).map((m) => m.id)).toEqual(["b", "c", "a"]);
    });
});

describe("filtrarFeed", () => {
    const lista = [
        mensaje({ id: "md-1-aaaa", rol: "alex", tipo: "mensaje", de: "alex" }),
        mensaje({ id: "md-2-bbbb", tipo: "respuesta" }),
        mensaje({ id: "ev-3", rol: "agente", tipo: "actualizacion", de: "enjambre" }),
        mensaje({ id: "rb-4", rol: "agente", tipo: "informe" }),
        mensaje({ id: "cn-5-x", tipo: "uso" }),
    ];
    it("cada filtro deja pasar lo suyo", () => {
        expect(filtrarFeed(lista, "todo")).toHaveLength(5);
        expect(filtrarFeed(lista, "conversacion").map((m) => m.id)).toEqual(["md-1-aaaa", "md-2-bbbb"]);
        expect(filtrarFeed(lista, "informes").map((m) => m.id)).toEqual(["rb-4"]);
        expect(filtrarFeed(lista, "enjambre").map((m) => m.id)).toEqual(["ev-3"]);
        expect(filtrarFeed(lista, "usos").map((m) => m.id)).toEqual(["cn-5-x"]);
    });
});
