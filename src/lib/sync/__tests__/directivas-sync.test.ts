// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { SYNCED_KEYS, isNeverSyncedKey } from "@/lib/settings-sync";
import { isSyncedKey } from "@/lib/sync/realtime-sync";
import { DIRECTIVAS_KEY } from "@/lib/astraura/capas/directivas-almacen";

describe("directivas Meta^n · la clave viaja con la cuenta", () => {
    it("la clave de directivas está en SYNCED_KEYS", () => {
        expect((SYNCED_KEYS as readonly string[]).includes(DIRECTIVAS_KEY), `${DIRECTIVAS_KEY} no está en SYNCED_KEYS`).toBe(true);
    });

    it("el motor la trata como sincronizada", () => {
        expect(isSyncedKey(DIRECTIVAS_KEY)).toBe(true);
        expect(isNeverSyncedKey(DIRECTIVAS_KEY), "las directivas de las capas nunca son secreto ni estado de dispositivo").toBe(false);
    });
});
