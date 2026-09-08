/**
 * Pruebas de la cuota de Drive en «Drive como almacén grande» (Ola 280 · A7B).
 * En macOS `df` sobre la carpeta de DriveFS informa del disco LOCAL, no de Google
 * Drive; aquí solo se prueban funciones PURAS (sin parchear Node): `esMismoVolumen`
 * (¿el `df` del Drive es el mismo volumen que `/`?) y que `interpretarDf` sigue
 * traduciendo bien los bloques POSIX. Comentarios en español con el porqué.
 */

import { describe, expect, it } from "vitest";
import { esMismoVolumen, interpretarDf } from "../mando/almacenamiento";

describe("esMismoVolumen (Ola 280 · A7B, pura)", () => {
    it("mismo Filesystem en la segunda línea → mismo volumen → true", () => {
        const df = [
            "Filesystem       1024-blocks      Used Available Capacity Mounted on",
            "/dev/disk3s1s1   500000000 250000000 250000000   50%    /",
        ].join("\n");
        // El `df -kP /` de la misma máquina expone el mismo /dev/disk3s1s1.
        expect(esMismoVolumen(df, df)).toBe(true);
    });
    it("Filesystem distinto (com.google.drivefs vs disco local) → false", () => {
        const dfDrive = [
            "Filesystem 1024-blocks Used Available Capacity Mounted on",
            "com.google.drivefs  1 0 1  0%  /Users/x/Library/CloudStorage/GoogleDrive-cuenta",
        ].join("\n");
        const dfRaiz = [
            "Filesystem 1024-blocks Used Available Capacity Mounted on",
            "/dev/disk3s1s1  500000000 250000000 250000000 50%  /",
        ].join("\n");
        expect(esMismoVolumen(dfDrive, dfRaiz)).toBe(false);
    });
    it("mismo punto de montaje aunque difiera el Filesystem → true", () => {
        const dfDrive = [
            "Filesystem 1024-blocks Used Available Capacity Mounted on",
            "com.google.drivefs  1 0 1  0%  /",
        ].join("\n");
        const dfRaiz = [
            "Filesystem 1024-blocks Used Available Capacity Mounted on",
            "/dev/disk3s1s1  500000000 250000000 250000000 50%  /",
        ].join("\n");
        expect(esMismoVolumen(dfDrive, dfRaiz)).toBe(true);
    });
    it("salidas vacías o sin segunda línea → false", () => {
        expect(esMismoVolumen("", "")).toBe(false);
        expect(esMismoVolumen("Filesystem 1024-blocks", "Filesystem 1024-blocks")).toBe(false);
    });
});

describe("interpretarDf (Ola 280 · A7B, pura)", () => {
    it("traduce bloques POSIX a MB correctos (1 GB total, 50 % usado)", () => {
        const salida = [
            "Filesystem       1024-blocks      Used Available Capacity Mounted on",
            "/dev/disk3s1s1   1048576 524288 524288   50%    /",
        ].join("\n");
        expect(interpretarDf(salida)).toEqual({ totalMb: 1024, libreMb: 512, usadoPct: 50 });
    });
});