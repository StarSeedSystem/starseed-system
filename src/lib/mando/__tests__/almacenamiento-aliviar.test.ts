import { describe, it, expect } from "vitest";
import {
    motoresParados,
    driveCorriendo,
    interpretarDf,
    explicarSwap,
} from "@/lib/mando/almacenamiento";

describe("motoresParados", () => {
    it("detecta llama-server y tts-server con stat T", () => {
        const ps = `49217 T /usr/local/bin/llama-server\n38421 T /usr/local/bin/tts-server\n12345 S /usr/bin/find`;
        expect(motoresParados(ps)).toEqual([49217, 38421]);
    });
    it("ignora procesos vivos (S) y otros nombres", () => {
        const ps = `38421 S /usr/local/bin/llama-server\n12345 R /usr/bin/ls`;
        expect(motoresParados(ps)).toEqual([]);
    });
});

describe("driveCorriendo", () => {
    it("detecta Google Drive o DriveFS", () => {
        expect(driveCorriendo("1234 S /Applications/Google Drive.app/Contents/MacOS/Google Drive")).toBe(true);
        expect(driveCorriendo("5678 S /Applications/DriveFS")).toBe(true);
    });
    it("devuelve false si no existe", () => {
        expect(driveCorriendo("")).toBe(false);
    });
    it("ignora líneas sin stat T para motores", () => {
        expect(driveCorriendo("999 T /usr/bin/other")).toBe(false);
    });
});

describe("carpetas con paréntesis ignoradas", () => {
    it("filtra cuentas antiguas con (", () => {
        const entradas = ["GoogleDrive-ABC", "GoogleDrive-XYZ (16-09-26 algo)", "GoogleDrive-DEF"];
        const unidad = entradas.find((e) => e.startsWith("GoogleDrive-") && !e.includes("("));
        expect(unidad).toBe("GoogleDrive-ABC");
    });
});

describe("interpretarDf", () => {
    it("extrae bloques del formato POSIX", () => {
        const stdout = "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/disk3s1 228000 190000 38000 84% /\n";
        expect(interpretarDf(stdout)).toMatchObject({ totalMb: 228, libreMb: 38, usadoPct: 84 });
    });
    it("devuelve null con menos de 2 líneas", () => {
        expect(interpretarDf("solo una")).toBeNull();
    });
});

describe("explicarSwap", () => {
    it("explica normal y alto", () => {
        expect(explicarSwap(500, 8000)).toContain("dentro de lo normal");
        expect(explicarSwap(5000, 8000)).toContain("Swap alto");
    });
});
