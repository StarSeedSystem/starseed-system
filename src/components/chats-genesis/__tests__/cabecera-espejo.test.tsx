import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { CabeceraEspejo, haceTexto, lineaCabecera, motivoNoEnviado, textoEnvio, type EnvioLocal } from "../cabecera-espejo";

const AHORA = Date.parse("2026-11-13T14:30:00Z");
const base = { cargado: true, fallo: null, origen: "mac" as const, queEs: "direccion" as const, ahora: AHORA };
const latidoHace = (s: number) => ({ t: new Date(AHORA - s * 1000).toISOString(), de: "mac" as const });

describe("lineaCabecera", () => {
    it("«En vivo» hasta 90 s exactos; a los 91 s, «no responde» con la hora", () => {
        expect(lineaCabecera({ ...base, latido: latidoHace(90) })).toEqual({ tono: "vivo", texto: "En vivo desde la Mac · copia de hace 90 s" });
        expect(lineaCabecera({ ...base, latido: latidoHace(3) }).texto).toBe("En vivo desde la Mac · copia de hace 3 s");
        const viejo = lineaCabecera({ ...base, latido: latidoHace(91) });
        expect(viejo.tono).toBe("viejo");
        expect(viejo.texto).toMatch(/^La Mac no responde desde las 14:28 \(hace 91 s\)\. Ves la última copia\./);
    });

    it("la puerta caída se dice con su hora y sin respaldo", () => {
        const t = lineaCabecera({ ...base, latido: latidoHace(5), fallo: { estado: 0, error: "x", desde: AHORA - 120_000 } });
        expect(t.tono).toBe("caido");
        expect(t.texto).toBe("La puerta de datos del A1 no responde desde las 14:28. Desde aquí no se pueden leer ni escribir los chats de dirección; en la Mac siguen en /genesis");
    });

    it("sin sesión, sin acceso, sin rol comprobado y otro día", () => {
        expect(lineaCabecera({ ...base, latido: null, fallo: { estado: 401, error: "", desde: AHORA } }).texto).toBe("Inicia sesión para ver los chats de Genesis");
        expect(lineaCabecera({ ...base, latido: null, fallo: { estado: 403, error: "", desde: AHORA } }).texto).toBe("Tu cuenta no tiene acceso a MetaGenesis");
        expect(lineaCabecera({ ...base, latido: null, fallo: { estado: 503, error: "", desde: AHORA } }).tono).toBe("caido");
        expect(lineaCabecera({ ...base, latido: latidoHace(2 * 86400) }).texto).toMatch(/^La Mac no responde desde el 11-11 a las 14:30 \(hace 2 días\)/);
        expect(lineaCabecera({ ...base, origen: "a1", latido: latidoHace(10) }).texto).toBe("En vivo desde el A1 · copia de hace 10 s");
    });

    it("hace N", () => {
        expect(haceTexto(59_000)).toBe("59 s");
        expect(haceTexto(119_000)).toBe("119 s");
        expect(haceTexto(47 * 3_600_000)).toBe("47 h");
        expect(haceTexto(10 * 60_000)).toBe("10 min");
        expect(haceTexto(3 * 3_600_000)).toBe("3 h");
        expect(haceTexto(4 * 86_400_000)).toBe("4 días");
    });
});

describe("envíos", () => {
    const e = (estado: EnvioLocal["estado"], detalle?: string): EnvioLocal => ({ clave: "k", id: 1, texto: "x", iniciado: AHORA - 60_000, estado, detalle, entrada: { fuente: "direccion", accion: "decir", texto: "x" } });
    it("cada estado dice lo que es", () => {
        expect(textoEnvio(e("en-cola"), AHORA, "mac")).toBe("En la puerta del A1 · esperando a la Mac desde las 14:29");
        expect(textoEnvio(e("en-cola"), AHORA, "a1")).toBe("En la puerta del A1 · esperando al A1 desde las 14:29");
        expect(textoEnvio(e("caducado"), AHORA, "mac")).toBe("Caducó sin ejecutarse (la Mac estaba apagada); vuelve a enviarla si aún la quieres");
        expect(textoEnvio(e("rechazado", "falta la lista de cuentas en la Mac"), AHORA, "mac")).toBe("La Mac lo rechazó: falta la lista de cuentas en la Mac");
        expect(textoEnvio(e("hecho"), AHORA, "mac")).toBe("Hecho");
    });
    it("motivos de la puerta", () => {
        expect(motivoNoEnviado({ estado: 403, codigo: "solo-dueno", error: "" })).toBe("Esta orden solo la puede dar un dueño de MetaGenesis");
        expect(motivoNoEnviado({ estado: 503, error: "" })).toBe("No se pudo comprobar tu permiso; no se envió nada");
        expect(motivoNoEnviado({ estado: 409, error: "" })).toMatch(/ya estaba en la puerta/);
    });
});

describe("CabeceraEspejo", () => {
    afterEach(cleanup);
    it("pinta la frase y el tono", () => {
        render(<CabeceraEspejo {...base} latido={latidoHace(600)} />);
        const c = screen.getByTestId("cabecera-espejo");
        expect(c).toHaveAttribute("data-tono", "viejo");
        expect(c).toHaveTextContent("La Mac no responde desde las 14:20 (hace 10 min)");
    });
});

describe("texto de la pestaña", () => {
    // Misma regla que src/lib/__tests__/nombre-genesis.test.ts, aplicada a estos archivos. El nombre
    // viejo se arma por partes para que la guardia general no salte con esta misma prueba.
    const M = String.fromCharCode(77) + "ando";
    const NOMBRE_VIEJO = new RegExp(`[Pp]uente\\s+de\\s+[Mm]ando|Centro de ${M}|(?<![\\p{L}\\p{N}_/.\\-@])${M}s?(?![\\p{L}\\p{N}_@])(?! central de audio)`, "u");
    it("ningún archivo de la pestaña usa el nombre viejo", () => {
        const dir = path.join(__dirname, "..");
        const archivos = [
            ...readdirSync(dir).filter((f) => /\.tsx?$/.test(f)).map((f) => path.join(dir, f)),
            ...readdirSync(__dirname).filter((f) => /\.tsx?$/.test(f) && f !== path.basename(__filename)).map((f) => path.join(__dirname, f)),
        ];
        expect(archivos.length).toBeGreaterThanOrEqual(9);
        for (const a of archivos) {
            readFileSync(a, "utf8").split("\n").forEach((l, i) => expect(NOMBRE_VIEJO.test(l), `${path.basename(a)}:${i + 1}`).toBe(false));
        }
    });
});
