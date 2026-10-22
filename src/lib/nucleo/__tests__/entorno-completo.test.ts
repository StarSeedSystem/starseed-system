// StarSeed OS — Núcleo · Entorno completo: pruebas (ENT1020Ab · Ola 1020U).
// Pruebas del módulo puro: sin red, sin disco, sin `node:*`; la revisión usa los validadores REALES del núcleo.

import { describe, expect, it } from "vitest";
import { validarContraInvariantes } from "@/lib/nucleo/invariantes";
import { validarUiSpec } from "@/lib/nucleo/ui-spec";
import { SYNCED_KEYS } from "@/lib/settings-sync";
import { aplicar, capturarEntorno, diferencia, duplicarEntorno, revisarEntorno, type EntornoCompleto } from "../entorno-completo";
import type { PaqueteSistema } from "../paquete-sistema";

/** Los guardianes reales del núcleo: la revisión no se simula. */
const DEPENDENCIAS = { validarUiSpec, validarContraInvariantes };

/** Un paquete de sistema mínimo y válido. */
function paquete(): PaqueteSistema {
    return {
        id: "p1", nombre: "Entorno de prueba",
        autor: { perfil: "prueba", nombre: "Prueba" }, creadoEn: 0,
        uiSpec: { version: 1, superficie: "os:prueba", bloques: [] },
        permisosPedidos: [], requiere: [], version: 1,
    };
}

/** Un almacén en memoria que guarda el valor CRUDO, como el localStorage. */
function almacen(memory: Record<string, string> = {}) {
    return {
        leer: (clave: string) => memory[clave] ?? null,
        escribir: (clave: string, valor: string | null) => {
            if (valor === null) delete memory[clave]; else memory[clave] = valor;
        },
    };
}

/** Un entorno con los ajustes dados y sin volúmenes. */
function entorno(ajustes: Record<string, unknown>): EntornoCompleto {
    return { version: 1, nombre: "Entorno", paquete: paquete(), ajustes, volumenes: [] };
}

describe("capturarEntorno", () => {
    it("toma solo claves sincronizadas y ninguna clave prohibida", () => {
        const mem = { "appearance-config-v2": '{"tema":"oscuro"}', "starseed.ai.providers": '{"clave":"del aparato"}', "una.clave.que.no.viaja": "nada" };
        const ent = capturarEntorno(almacen(mem), paquete(), []);
        expect(ent.ajustes["appearance-config-v2"]).toEqual({ tema: "oscuro" });
        expect(ent.ajustes).not.toHaveProperty("starseed.ai.providers");
        expect(ent.ajustes).not.toHaveProperty("una.clave.que.no.viaja");
        for (const clave of Object.keys(ent.ajustes)) expect((SYNCED_KEYS as readonly string[]).includes(clave), `${clave} no es una clave sincronizada`).toBe(true);
    });

    it("los volúmenes van por referencia, nunca con su contenido", () => {
        const ent = capturarEntorno(almacen(), paquete(), [{ id: "v1", raiz: "/datos" }]);
        expect(ent.volumenes).toEqual([{ id: "v1", raiz: "/datos" }]); expect(Object.keys(ent.volumenes[0])).toEqual(["id", "raiz"]);
    });
});

describe("revisarEntorno", () => {
    it("un entorno limpio es instalable", () => {
        const rev = revisarEntorno(capturarEntorno(almacen({ "appearance-config-v2": '{"tema":"claro"}' }), paquete(), []), DEPENDENCIAS);
        expect(rev.instalable).toBe(true);
        expect(rev.motivos).toEqual([]);
    });

    it("un secreto en los ajustes bloquea y dice por qué", () => {
        const rev = revisarEntorno(entorno({ "appearance-config-v2": { clave: "sk-abcd1234" } }), DEPENDENCIAS);
        expect(rev.instalable).toBe(false);
        expect(rev.motivos.some((m) => m.includes("secreto en los ajustes"))).toBe(true);
    });

    it("una clave prohibida bloquea y dice por qué", () => {
        const rev = revisarEntorno(entorno({ "starseed.connectors.creds.v1": "{}" }), DEPENDENCIAS);
        expect(rev.instalable).toBe(false);
        expect(rev.motivos.some((m) => m.includes("clave prohibida"))).toBe(true);
    });
});

describe("duplicarEntorno", () => {
    it("no comparte ni una referencia con el original", () => {
        const original = entorno({ "appearance-config-v2": { tema: "oscuro" } });
        original.volumenes = [{ id: "v1", raiz: "/datos" }];
        const copia = duplicarEntorno(original, "Copia");
        expect(copia.nombre).toBe("Copia");
        expect(copia.paquete.nombre).toBe("Copia");
        expect(copia.ajustes).toEqual(original.ajustes);
        expect(copia.ajustes).not.toBe(original.ajustes);
        expect(copia.ajustes["appearance-config-v2"]).not.toBe(original.ajustes["appearance-config-v2"]);
        expect(copia.volumenes).not.toBe(original.volumenes);
        expect(copia.volumenes[0]).not.toBe(original.volumenes[0]);
    });
});

describe("diferencia", () => {
    it("dice qué claves hay que replicar de b sobre a", () => {
        const a = entorno({ "appearance-config-v2": 1, "starseed.cursorfx.v1": 2 });
        const b = entorno({ "starseed.cursorfx.v1": 3, "starseed.dock.folders.v1": 4 });
        const d = diferencia(a, b);
        expect(d.anadidas).toEqual(["starseed.dock.folders.v1"]);
        expect(d.quitadas).toEqual(["appearance-config-v2"]);
        expect(d.cambiadas).toEqual(["starseed.cursorfx.v1"]);
        expect(d.iguales).toEqual([]);
    });
});

describe("aplicar y deshacer", () => {
    it("aplicar y deshacer dejan el almacén igual", () => {
        const mem: Record<string, string> = { "appearance-config-v2": '{"tema":"claro"}' }, antes = { ...mem };
        const ent = entorno({ "appearance-config-v2": { tema: "oscuro" }, "starseed.cursorfx.v1": "on" });
        const { cambios, deshacer } = aplicar(ent, almacen(mem));
        expect(cambios).toEqual(["appearance-config-v2", "starseed.cursorfx.v1"]);
        expect(mem["appearance-config-v2"]).not.toBe(antes["appearance-config-v2"]);
        deshacer();
        expect(mem).toEqual(antes);
    });

    it("no escribe claves prohibidas: el secreto del aparato queda intacto", () => {
        const mem: Record<string, string> = { "starseed.ai.providers": '{"clave":"mía"}' };
        const { cambios, omitidas } = aplicar(entorno({ "starseed.ai.providers": { clave: "ajena" } }), almacen(mem));
        expect(omitidas).toEqual(["starseed.ai.providers"]);
        expect(cambios).toEqual([]);
        expect(mem["starseed.ai.providers"]).toBe('{"clave":"mía"}');
    });
});
