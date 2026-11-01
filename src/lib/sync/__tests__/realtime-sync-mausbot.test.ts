// @vitest-environment jsdom
/**
 * Mausbot en el motor de sync con la cuenta (Ola MBT1027C2c).
 *
 * La config del Mausbot viaja con la cuenta: la clave `starseed.mausbot.v1`
 * (la de fábrica y la de cuenta rota se resuelven en `normalizarConfigMausbot`,
 * probada en src/lib/mausbot/__tests__/config.test.ts). Aquí se fija el cable
 * con el MOTOR realtime:
 *   · la clave la trata el motor como sincronizada (isSyncedKey);
 *   · su evento es `starseed:mausbot` — el que `guardarConfigMausbot` emite —
 *     y SOLO ese, sin el genérico de Aurora (no es una clave de Aurora).
 */
import { describe, expect, it } from "vitest";
import { isSyncedKey, eventsForKey } from "@/lib/sync/realtime-sync";
import { CLAVE_MAUSBOT, EVENTO_MAUSBOT } from "@/lib/mausbot/config";

describe("realtime-sync · Mausbot", () => {
    it("la clave del Mausbot está entre las sincronizadas", () => {
        expect(isSyncedKey(CLAVE_MAUSBOT)).toBe(true);
    });

    it("llega el valor de otro dispositivo → evento propio, y solo él", () => {
        expect(eventsForKey(CLAVE_MAUSBOT)).toEqual([EVENTO_MAUSBOT]);
        expect(EVENTO_MAUSBOT).toBe("starseed:mausbot");
    });

    it("no es una clave de Aurora: no despacha el evento genérico de config", () => {
        expect(eventsForKey(CLAVE_MAUSBOT)).not.toContain("starseed:aurora-config-updated");
    });
});
