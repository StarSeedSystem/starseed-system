// Pruebas del cableado de entornos completos en el mando (ENT1020A).
// `entornos-api.ts` ejecuta el módulo puro del núcleo sobre datos que manda un
// cliente y guarda el resultado SOLO si la revisión es instalable. Sin red:
// el almacén es `STARSEED_ROOT` (temporal aislado por `vitest.config.ts`).

import { describe, it, expect } from "vitest";
import {
    capturarYGuardar,
    diferenciaGuardados,
    duplicarGuardado,
    entornoDe,
    listarEntornos,
    leerEntorno,
    paqueteDe,
    volumenesDe,
} from "../entornos-api";
import type { PaqueteSistema } from "@/lib/nucleo/paquete-sistema";
import type { UiSpec } from "@/lib/nucleo/ui-spec";

function paqueteEjemplo(): PaqueteSistema {
    return {
        id: "ent-prueba",
        nombre: "Prueba",
        autor: { perfil: "test", nombre: "Test" },
        creadoEn: 0,
        uiSpec: { version: 1, superficie: "os:test", bloques: [] } satisfies UiSpec,
        permisosPedidos: [],
        requiere: [],
        version: 1,
    };
}

const CLAVE_SYNCED = "appearance-config-v2";

describe("capturarYGuardar", () => {
    it("captura de verdad y guarda solo las claves que ya viajan con la cuenta", async () => {
        const antes = await listarEntornos();
        const alta = await capturarYGuardar(paqueteEjemplo(), {
            [CLAVE_SYNCED]: '{"tema":"oscuro"}',
            "clave.que.no.viaja": "1",
        }, [{ id: "v1", raiz: "biblioteca/fotos" }]);
        expect(alta.guardado).toBe(true);
        expect(alta.id).toMatch(/^[a-f0-9]{12}$/);
        const guardado = await leerEntorno(alta.id ?? "");
        expect(guardado).not.toBeNull();
        expect(guardado?.ajustes).toEqual({ [CLAVE_SYNCED]: { tema: "oscuro" } });
        expect(guardado?.volumenes).toEqual([{ id: "v1", raiz: "biblioteca/fotos" }]);
        expect((await listarEntornos()).length).toBe(antes.length + 1);
    });

    it("una clave prohibida en el medio jamás embarca; el guardado sigue en pie", async () => {
        const alta = await capturarYGuardar(paqueteEjemplo(), {
            [CLAVE_SYNCED]: '{"tema":"claro"}',
            "starseed.connectors.creds.v1": '{"secreto":"1"}',
        }, []);
        expect(alta.guardado).toBe(true);
        const guardado = await leerEntorno(alta.id ?? "");
        expect(guardado?.ajustes).not.toHaveProperty("starseed.connectors.creds.v1");
    });

    it("un secreto dentro de una clave sincronizada bloquea el guardado, enmascarado", async () => {
        const antes = await listarEntornos();
        const alta = await capturarYGuardar(paqueteEjemplo(), {
            [CLAVE_SYNCED]: '{"apiKey":"sk-test1234secreto"}',
        }, []);
        expect(alta.guardado).toBe(false);
        expect(alta.id).toBeNull();
        expect(alta.motivos.some((m) => m.includes("secreto detectado en los ajustes"))).toBe(true);
        for (const motivo of alta.motivos) expect(motivo).not.toContain("sk-test1234secreto");
        expect((await listarEntornos()).length).toBe(antes.length);
    });

    it("un secreto dentro del paquete también bloquea", async () => {
        const alta = await capturarYGuardar(
            { ...paqueteEjemplo(), permisosPedidos: ["sk-larga1234567890"] },
            {},
            [],
        );
        expect(alta.guardado).toBe(false);
        expect(alta.motivos.join("\n")).toContain("secreto detectado en el paquete");
    });
});

describe("duplicarGuardado", () => {
    it("duplica sin compartir referencias: tocar la copia no altera el original", async () => {
        const alta = await capturarYGuardar(paqueteEjemplo(), { [CLAVE_SYNCED]: '{"tema":"oscuro"}' }, []);
        const idOriginal = alta.id ?? "";
        const duplicada = await duplicarGuardado(idOriginal, "Copia");
        expect(duplicada.guardado).toBe(true);
        expect(duplicada.id).not.toBe(idOriginal);

        const copia = await leerEntorno(duplicada.id ?? "");
        (copia?.ajustes[CLAVE_SYNCED] as { tema?: string }).tema = "tocado";
        const originalEnDisco = JSON.parse(
            JSON.stringify(await leerEntorno(idOriginal)),
        ) as typeof copia;
        expect(originalEnDisco?.ajustes[CLAVE_SYNCED]).toEqual({ tema: "oscuro" });
        expect(copia?.nombre).toBe("Copia");
    });

    it("con un id que no existe dice por qué y no guarda nada", async () => {
        const duplicada = await duplicarGuardado("a".repeat(12), "Nada");
        expect(duplicada.guardado).toBe(false);
        expect(duplicada.motivos[0]).toContain("no hay entorno guardado");
    });
});

describe("diferenciaGuardados", () => {
    it("dice qué claves cambian de un entorno guardado a otro", async () => {
        const a = await capturarYGuardar(paqueteEjemplo(), { [CLAVE_SYNCED]: '{"tema":"oscuro"}' }, []);
        const b = await capturarYGuardar(paqueteEjemplo(), { [CLAVE_SYNCED]: '{"tema":"claro"}', "starseed.cursorfx.v1": "on" }, []);
        const d = await diferenciaGuardados(a.id ?? "", b.id ?? "");
        expect(d?.cambiadas).toEqual([CLAVE_SYNCED]);
        expect(d?.anadidas).toEqual(["starseed.cursorfx.v1"]);
        expect(await diferenciaGuardados("0".repeat(12), "1".repeat(12))).toBeNull();
    });
});

describe("datos de cualquier sitio, en forma mínima revisable", () => {
    it("volumenesDe exige solo {id, raiz}: el contenido no viaja", () => {
        expect(volumenesDe([{ id: "v1", raiz: "biblioteca/fotos", contenido: "XXXX" }])).toBeNull();
        expect(volumenesDe([{ id: "v1", raiz: "biblioteca/fotos" }])).toEqual([
            { id: "v1", raiz: "biblioteca/fotos" },
        ]);
    });

    it("paqueteDe y entornoDe rechazan lo que no se puede revisar", () => {
        expect(paqueteDe("nada")).toBeNull();
        expect(paqueteDe({ nombre: "sin id" })).toBeNull();
        expect(paqueteDe(paqueteEjemplo())).not.toBeNull();
        expect(entornoDe(null)).toBeNull();
        expect(entornoDe({ nombre: "Ok", ajustes: "no", volumenes: [] })).toBeNull();
        const ent = entornoDe({ paquete: paqueteEjemplo(), nombre: "Ok", ajustes: {}, volumenes: [] });
        expect(ent?.version).toBe(1);
        expect(ent?.paquete.id).toBe("ent-prueba");
    });
});
