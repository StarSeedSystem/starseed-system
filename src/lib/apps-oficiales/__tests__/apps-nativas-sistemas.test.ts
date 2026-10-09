/**
 * (2026-10-09 · release 0.3.0) StarSeed OS, Nexus y Café comparten Release: cada app de la
 * Biblioteca debe ofrecer SOLO sus instaladores, uno por sistema operativo. Con los nombres
 * reales del Release v0.2.2 (los que produce el CI).
 */
import { describe, expect, it } from "vitest";

import { APPS_OFICIALES, instalablesDeApp, mejorInstalable, type AssetRelease } from "../apps-oficiales";
import { nativeInstallerAssets, NATIVE_TAG, NATIVE_VERSION } from "@/lib/version/os-release";

const NOMBRES_V022 = [
    "latest.json",
    "StarSeed-cafe-0.2.2.apk", "StarSeed-nexus-0.2.2.apk", "StarSeed-os-0.2.2.apk",
    ...["Cafe", "Nexus", "OS"].flatMap((s) => [
        `StarSeed.${s}-0.2.2-1.x86_64.rpm`, `StarSeed.${s}-0.2.2-1.x86_64.rpm.sig`,
        `StarSeed.${s}_0.2.2_amd64.AppImage`, `StarSeed.${s}_0.2.2_amd64.AppImage.sig`,
        `StarSeed.${s}_0.2.2_amd64.deb`, `StarSeed.${s}_0.2.2_amd64.deb.sig`,
        `StarSeed.${s}_0.2.2_universal.dmg`,
        `StarSeed.${s}_0.2.2_x64-setup.exe`, `StarSeed.${s}_0.2.2_x64-setup.exe.sig`,
        `StarSeed.${s}_0.2.2_x64_en-US.msi`, `StarSeed.${s}_0.2.2_x64_en-US.msi.sig`,
        `StarSeed.${s}_universal.app.tar.gz`, `StarSeed.${s}_universal.app.tar.gz.sig`,
    ]),
];
const ASSETS: AssetRelease[] = NOMBRES_V022.map((nombre) => ({ nombre, url: `https://x/${nombre}`, bytes: 1 }));

describe("apps nativas por sistema en el Release compartido", () => {
    it.each([
        ["starseed-os", "StarSeed.OS", "StarSeed-os"],
        ["nexus", "StarSeed.Nexus", "StarSeed-nexus"],
        ["cafe", "StarSeed.Cafe", "StarSeed-cafe"],
    ])("%s ofrece solo sus archivos", (id, escritorio, apk) => {
        const lista = instalablesDeApp(id, ASSETS);
        expect(lista.length).toBeGreaterThan(0);
        for (const a of lista) expect(a.nombre.startsWith(escritorio) || a.nombre.startsWith(apk)).toBe(true);
        const sistemas = new Set(lista.map((a) => a.sistema));
        expect([...sistemas].sort()).toEqual(["android", "linux", "macos", "windows"]);
    });

    it("el mejor instalador para cada dispositivo es el de su app", () => {
        const mac = mejorInstalable(instalablesDeApp("cafe", ASSETS), { sistema: "macos", arquitectura: "arm64" });
        expect(mac?.nombre).toBe("StarSeed.Cafe_0.2.2_universal.dmg");
        const android = mejorInstalable(instalablesDeApp("nexus", ASSETS), { sistema: "android", arquitectura: "desconocida" });
        expect(android?.nombre).toBe("StarSeed-nexus-0.2.2.apk");
        const win = mejorInstalable(instalablesDeApp("starseed-os", ASSETS), { sistema: "windows", arquitectura: "x64" });
        expect(win?.nombre).toBe("StarSeed.OS_0.2.2_x64-setup.exe");
    });

    it("el respaldo sin red apunta a la versión nativa vigente de cada sistema", () => {
        expect(APPS_OFICIALES.nexus.respaldo.tag).toBe(NATIVE_TAG);
        const nexus = nativeInstallerAssets(undefined, undefined, "nexus").map((a) => a.filename);
        expect(nexus).toContain(`StarSeed.Nexus_${NATIVE_VERSION}_universal.dmg`);
        expect(nexus).toContain(`StarSeed-nexus-${NATIVE_VERSION}.apk`);
        const os = nativeInstallerAssets().map((a) => a.filename);
        expect(os).toContain(`StarSeed.OS_${NATIVE_VERSION}_x64-setup.exe`);
        expect(os.every((n) => /^StarSeed(\.OS|-os)/.test(n))).toBe(true);
    });
});
