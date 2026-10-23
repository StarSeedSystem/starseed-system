import { describe, expect, it } from "vitest";

import {
    discoParaMedidor,
    disponibleDeVmStat,
    memoriaDeMeminfo,
    swapUsadoMb,
} from "@/lib/mando/memoria-medidor";

// Salida real de la Mac de Alex (2026-10-23 11:44), con el comprobador diciendo «RAM baja: 137 MB».
const VM_STAT = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                                3928.
Pages active:                             61056.
Pages inactive:                           54958.
Pages speculative:                         5354.
Pages throttled:                              0.
Pages wired down:                        205803.
Pages purgeable:                             12.
`;

describe("memoria del medidor", () => {
    it("cuenta libres + inactivas + especulativas, no solo las libres", () => {
        // (3928 + 54958 + 5354) × 16384 B = 1004 MB; las «free» solas eran 61 MB.
        expect(disponibleDeVmStat(VM_STAT)).toBe(1004);
    });

    it("sin tamaño de página no inventa una cifra", () => {
        expect(disponibleDeVmStat("Pages free: 10.")).toBeNull();
        expect(disponibleDeVmStat("")).toBeNull();
    });

    it("lee el swap usado en M y en G", () => {
        expect(swapUsadoMb("total = 8192.00M  used = 7392.31M  free = 799.69M  (encrypted)")).toBe(7392);
        expect(swapUsadoMb("total = 2.00G  used = 1.50G  free = 0.50G")).toBe(1536);
        expect(swapUsadoMb("")).toBeNull();
    });

    it("en Linux usa MemAvailable y el swap usado", () => {
        expect(
            memoriaDeMeminfo("MemTotal: 24000000 kB\nMemAvailable:  6583424 kB\nSwapTotal: 2097148 kB\nSwapFree: 1048574 kB\n"),
        ).toEqual({ libreMb: 6429, swapMb: 1024 });
        expect(memoriaDeMeminfo("MemTotal: 1 kB\n")).toBeNull();
    });

    it("el disco pasa a GB con un decimal y sin dato no hay cifra", () => {
        expect(discoParaMedidor({ libreMb: 8_400, usadoPct: 96 })).toEqual({ libreGb: 8.2, usadoPct: 96 });
        expect(discoParaMedidor(null)).toBeUndefined();
    });
});
