import { describe, it, expect } from "vitest";
import {
    firmarCuerpo,
    verificarFirma,
    validarTimestamp,
    construirCabeceraFirma,
    construirCabeceraTimestamp,
    CABECERA_FIRMA,
    CABECERA_TIMESTAMP,
    PREFIJO,
} from "../ganchos-ambito";

describe("ganchos-ambito (funciones puras)", () => {
    const secreto = "mi-secreto-123";
    const cuerpo = "hola mundo";

    describe("firmarCuerpo", () => {
        it("devuelve un hexadecimal de 64 caracteres", () => {
            const firma = firmarCuerpo(cuerpo, secreto);
            expect(typeof firma).toBe("string");
            expect(firma.length).toBe(64);
            expect(/^[0-9a-f]{64}$/.test(firma)).toBe(true);
        });
    });

    describe("verificarFirma", () => {
        it("devuelve true para una firma válida", () => {
            const firma = firmarCuerpo(cuerpo, secreto);
            const cabecera = `${PREFIJO}${firma}`;
            expect(verificarFirma(cuerpo, cabecera, secreto)).toBe(true);
        });

        it("devuelve false para una firma inválida", () => {
            const cabecera = `${PREFIJO}0000000000000000000000000000000000000000000000000000000000000000`;
            expect(verificarFirma(cuerpo, cabecera, secreto)).toBe(false);
        });

        it("devuelve false si la cabecera es nula", () => {
            expect(verificarFirma(cuerpo, null, secreto)).toBe(false);
        });

        it("devuelve false si el secreto es undefined", () => {
            const firma = firmarCuerpo(cuerpo, secreto);
            const cabecera = `${PREFIJO}${firma}`;
            expect(verificarFirma(cuerpo, cabecera, undefined)).toBe(false);
        });

        it("devuelve false si la cabecera no tiene el prefijo esperado", () => {
            const firma = firmarCuerpo(cuerpo, secreto);
            const cabecera = `sha256=${firma}`; // sin el prefijo exacto? Actually PREFIJO is "sha256=", so this is the same.
            // Let's test without the prefix
            expect(verificarFirma(cuerpo, `md5=${firma}`, secreto)).toBe(false);
        });
    });

    describe("validarTimestamp", () => {
        const ahora = Date.now();

        it("devuelve el timestamp si es válido y dentro de la ventana", () => {
            const valido = validarTimestamp(String(ahora), ahora);
            expect(valido).toBe(ahora);
        });

        it("devuelve null si el timestamp está fuera de la ventana (más de 5 minutos)", () => {
            const fuera = ahora - 6 * 60 * 1000; // 6 minutos atrás
            expect(validarTimestamp(String(fuera), ahora)).toBe(null);
        });

        it("devuelve null si el timestamp no es un número", () => {
            expect(validarTimestamp("no-es-un-numero", ahora)).toBe(null);
        });

        it("devuelve null si la cabecera es nula", () => {
            expect(validarTimestamp(null, ahora)).toBe(null);
        });
    });

    describe("construirCabeceraFirma", () => {
        it("devuelve una cadena con el formato correcto", () => {
            const cabecera = construirCabeceraFirma(cuerpo, secreto);
            expect(cabecera).toBe(`${CABECERA_FIRMA}: ${PREFIJO}${firmarCuerpo(cuerpo, secreto)}`);
        });
    });

    describe("construirCabeceraTimestamp", () => {
        it("devuelve una cadena con el timestamp actual", () => {
            const ahora = new Date();
            const cabecera = construirCabeceraTimestamp(ahora);
            expect(cabecera).toBe(`${CABECERA_TIMESTAMP}: ${ahora.getTime()}`);
        });
    });
});