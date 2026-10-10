/**
 * Pruebas del conserje (CNS1010A, 2026-10-10): `motoresParados`,
 * `driveCorriendo` y `elegirUnidadDrive` son funciones puras — todo se inyecta,
 * nada toca el disco ni los procesos reales.
 */
import { describe, it, expect } from "vitest";

import { motoresParados, driveCorriendo, elegirUnidadDrive } from "@/lib/mando/almacenamiento";

const PS_EJEMPLO = [
    "  101 S    /usr/sbin/syslogd",
    "49217 T    /Users/alex/motores/bin/llama-server --model bitnet",
    "49218 S    /Users/alex/motores/bin/llama-server --model bitnet",
    "50100 T    /opt/voz/tts-server --puerto 4500",
    "50101 Ss   /opt/voz/tts-server --puerto 4500",
    "60200 T    /usr/bin/otro-proceso",
].join("\n");

describe("motoresParados", () => {
    it("devuelve el pid de un llama-server parado (stat con T)", () => {
        expect(motoresParados(PS_EJEMPLO)).toContain(49217);
    });

    it("devuelve el pid de un tts-server parado", () => {
        expect(motoresParados(PS_EJEMPLO)).toContain(50100);
    });

    it("ignora un llama-server vivo (stat S)", () => {
        expect(motoresParados(PS_EJEMPLO)).not.toContain(49218);
    });

    it("ignora un tts-server vivo y procesos parados que no son motores", () => {
        const pids = motoresParados(PS_EJEMPLO);
        expect(pids).not.toContain(50101);
        expect(pids).not.toContain(60200);
    });

    it("devuelve [] con una salida vacía o sin motores", () => {
        expect(motoresParados("")).toEqual([]);
        expect(motoresParados("  1 S    /sbin/launchd")).toEqual([]);
    });

    it("ignora líneas malformadas (sin pid numérico o sin columnas)", () => {
        const sucio = ["abc T /x/llama-server", "50 T", "  ", "777 T /x/llama-server"].join("\n");
        expect(motoresParados(sucio)).toEqual([777]);
    });
});

describe("driveCorriendo", () => {
    it("true si hay un proceso Google Drive", () => {
        expect(driveCorriendo("120 S /Applications/Google Drive.app/Contents/MacOS/Google Drive")).toBe(true);
    });

    it("true si hay un proceso DriveFS", () => {
        expect(driveCorriendo("130 S /Library/DriveFS/driveFS")).toBe(true);
    });

    it("false con la app cerrada", () => {
        expect(driveCorriendo("  101 S    /usr/sbin/syslogd\n49218 S /x/llama-server")).toBe(false);
    });
});

describe("elegirUnidadDrive", () => {
    const entradas = [
        "GoogleDrive-alex@ejemplo.com (16-09-26 restaurado)",
        "GoogleDrive-alex@ejemplo.com",
        "FileProvider",
    ];

    it("elige la unidad sin paréntesis aunque haya restos de cuentas viejas", () => {
        expect(elegirUnidadDrive(entradas)).toBe("GoogleDrive-alex@ejemplo.com");
    });

    it("ignora carpetas con «(» si son las únicas de Drive y devuelve null", () => {
        expect(elegirUnidadDrive(["GoogleDrive-a@b.c (vieja)"])).toBeNull();
    });

    it("devuelve null cuando no hay ninguna unidad Drive", () => {
        expect(elegirUnidadDrive(["FileProvider", "Dropbox"])).toBeNull();
    });
});
