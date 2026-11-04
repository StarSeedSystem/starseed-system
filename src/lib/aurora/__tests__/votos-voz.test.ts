import { describe, expect, it } from "vitest";
import { anotarVoto, leerVotos, MAX_VOTOS_TOTAL, type Voto, type DepsVotos } from "../votos-voz";

const AHORA = 1700000000000;

function almacenMemoria(): DepsVotos {
    let datos: Voto[] = [];
    return {
        leer: () => JSON.stringify(datos),
        escribir: (texto) => {
            datos = JSON.parse(texto);
            return true;
        },
        ahora: () => AHORA,
    };
}

type Banco = { deps: DepsVotos; guardadas: () => Voto[] };

function banco(ahora?: number): Banco {
    const deps: DepsVotos = {
        leer: () => null,
        escribir: () => undefined,
        ahora: () => (ahora ?? AHORA),
    };
    let almacenamiento: Voto[] = [];
    deps.leer = () => JSON.stringify(almacenamiento);
    deps.escribir = (texto) => {
            almacenamiento = JSON.parse(texto);
            return true;
        };
    return {
        deps,
        guardadas: () => almacenamiento,
    };
}

describe("anotarVoto", () => {
    it("anotarVoto guarda un 👍/👎 con la hora del reloj (in “yectable)”, por motor", () => {
        const b = banco(AHORA);
        expect(anotarVoto({ motor: "kokoro", voto: 1 }, b.deps)).toBe(true);
        expect(anotarVoto({ motor: "kokoro", voto: -1 }, b.deps)).toBe(true);
        expect(b.guardadas()).toEqual([
            { motor: "kokoro", voto: 1, timestamp: AHORA },
            { motor: "kokoro", voto: -1, timestamp: AHORA },
        ]);
        expect(leerVotos(b.deps)).toHaveLength(2);
    });

    it("el motor queda limpio y lo no votable no se guarda", () => {
        const b = banco(AHORA);
        expect(anotarVoto({ motor: "  omnivoice  ", voto: -1 }, b.deps)).toBe(true);
        expect(b.guardadas()[0].motor).toBe("omnivoice");
        expect(anotarVoto({ motor: "   ", voto: 1 }, b.deps)).toBe(false);
        expect(anotarVoto({ motor: "kokoro", voto: 0 as 1 }, b.deps)).toBe(false);
        expect(b.guardadas()).toHaveLength(1);
    });

    it("leerVotos descarta lo ilegible y no lanza con el almacén roto", () => {
        const roto: DepsVotos = { leer: () => "{no es json", escribir: () => true, ahora: () => AHORA };
        expect(leerVotos(roto)).toEqual([]);
        const lanzador: DepsVotos = { leer: () => { throw new Error("boom"); }, escribir: () => true, ahora: () => AHORA };
        expect(leerVotos(lanzador)).toEqual([]);
        const mezcla: DepsVotos = {
            leer: () => JSON.stringify([
                { motor: "kokoro", voto: 1, timestamp: 10 },
                { motor: "kokoro", voto: 7, timestamp: 11 },
                { motor: "kokoro", timestamp: 12 },
                { motor: "   ", voto: 1, timestamp: 13 },
                "x", null,
            ]),
            escribir: () => true,
            ahora: () => AHORA,
        };
        expect(leerVotos(mezcla)).toEqual([{ motor: "kokoro", voto: 1, timestamp: 10 }]);
    });

    it("sin almacenamiento no se anota nada: la voz sigue igual", () => {
        const b = banco(AHORA);
        expect(
            anotarVoto({ motor: "kokoro", voto: 1 }, { ...b.deps, escribir: () => false }),
        ).toBe(false);
        expect(b.guardadas()).toEqual([]);
    });

    it("el recorte deja solo los MAX_VOTOS_TOTAL más recientes", () => {
        let t = 0;
        const b = banco();
        const deps = { ...b.deps, ahora: () => t++ };
        for (let i = 0; i < MAX_VOTOS_TOTAL + 5; i++) {
            anotarVoto({ motor: "kokoro", voto: i % 2 ? 1 : -1 }, deps);
        }
        const votos = leerVotos(deps);
        expect(votos).toHaveLength(MAX_VOTOS_TOTAL);
        expect(votos[0].timestamp).toBe(5);
        expect(votos[votos.length - 1].timestamp).toBe(MAX_VOTOS_TOTAL + 4);
    });
});