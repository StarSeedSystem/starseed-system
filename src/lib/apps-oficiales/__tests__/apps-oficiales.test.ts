import { describe, expect, it } from "vitest";

import {
    APPS_OFICIALES,
    clasificarAsset,
    dispositivoDesdeUA,
    instalables,
    mejorInstalable,
    releaseDesdeGithub,
    tamanoLegible,
    type AssetRelease,
} from "../apps-oficiales";

const MB = 1024 * 1024;
const a = (nombre: string, mb = 1): AssetRelease => ({ nombre, url: `https://example.org/${nombre}`, bytes: Math.round(mb * MB) });

// Forma real del release v1.2.0 de Audiomorphic: cada archivo subido dos veces, uno con «_AR_».
const AUDIOMORPHIC = [
    a("Audiomorphic_v1.2.0.apk", 5.4),
    a("Audiomorphic_AR_v1.2.0.apk", 5.4),
    a("Audiomorphic_v1.2.0_macOS_arm64.dmg", 213.2),
    a("Audiomorphic_AR_v1.2.0_macOS_arm64.dmg", 213.2),
    a("Audiomorphic_v1.2.0_Windows.zip", 134),
    a("Audiomorphic_AR_v1.2.0_Windows.zip", 134),
    a("Audiomorphic_v1.2.0_Linux_x64.tar.gz", 773.7),
    a("Audiomorphic_AR_v1.2.0_Linux_x64.tar.gz", 773.7),
    a("Audiomorphic_v1.2.0_Linux_arm64.tar.gz", 693.7),
    a("Audiomorphic_AR_v1.2.0_Linux_arm64.tar.gz", 693.7),
    a("latest.json"),
];

const OMNI = [
    a("OmniFrequency.apk", 5.9),
    a("OmniFrequency.dmg", 120.5),
    a("OmniFrequency-Setup.exe", 195.8),
    a("OmniFrequency.AppImage", 127.3),
    a("OmniFrequency-win.zip", 190),
    a("OmniFrequency-mac.zip", 118),
];

describe("clasificarAsset", () => {
    it("reconoce sistema, formato y arquitectura", () => {
        expect(clasificarAsset(a("X_macOS_arm64.dmg"))).toMatchObject({ sistema: "macos", arquitectura: "arm64", prioridad: 0 });
        expect(clasificarAsset(a("X-Setup.exe"))).toMatchObject({ sistema: "windows", formato: "instalador .exe" });
        expect(clasificarAsset(a("X_Linux_x64.tar.gz"))).toMatchObject({ sistema: "linux", arquitectura: "x64", prioridad: 2 });
        expect(clasificarAsset(a("X.AppImage"))).toMatchObject({ sistema: "linux", arquitectura: "desconocida" });
    });

    it("descarta lo que no es instalable (firmas, manifiestos, código)", () => {
        expect(clasificarAsset(a("X.dmg.sig"))).toBeNull();
        expect(clasificarAsset(a("latest.json"))).toBeNull();
        expect(clasificarAsset(a("source.tar.gz"))).toBeNull();
    });
});

describe("instalables", () => {
    it("quita los duplicados «_AR_» y se queda con el nombre sin él", () => {
        const lista = instalables(AUDIOMORPHIC);
        expect(lista).toHaveLength(5);
        expect(lista.every((x) => !/_AR_/.test(x.nombre))).toBe(true);
        expect(lista.map((x) => x.sistema).sort()).toEqual(["android", "linux", "linux", "macos", "windows"]);
    });

    it("el respaldo de las dos apps oficiales produce instaladores para los cuatro sistemas", () => {
        for (const app of Object.values(APPS_OFICIALES)) {
            const sistemas = new Set(instalables(app.respaldo.assets).map((x) => x.sistema));
            expect([...sistemas].sort()).toEqual(["android", "linux", "macos", "windows"]);
        }
    });
});

describe("mejorInstalable", () => {
    const am = instalables(AUDIOMORPHIC);
    const om = instalables(OMNI);

    it("elige por sistema y arquitectura", () => {
        expect(mejorInstalable(am, { sistema: "android", arquitectura: "arm64" })?.nombre).toBe("Audiomorphic_v1.2.0.apk");
        expect(mejorInstalable(am, { sistema: "linux", arquitectura: "x64" })?.nombre).toBe("Audiomorphic_v1.2.0_Linux_x64.tar.gz");
        expect(mejorInstalable(am, { sistema: "linux", arquitectura: "arm64" })?.nombre).toBe("Audiomorphic_v1.2.0_Linux_arm64.tar.gz");
    });

    it("con arquitectura desconocida acepta la que haya (Mac con Safari)", () => {
        expect(mejorInstalable(am, { sistema: "macos", arquitectura: "desconocida" })?.nombre).toBe("Audiomorphic_v1.2.0_macOS_arm64.dmg");
    });

    it("no ofrece un instalador de otra arquitectura (Mac Intel con Audiomorphic)", () => {
        expect(mejorInstalable(am, { sistema: "macos", arquitectura: "x64" })).toBeNull();
    });

    it("prefiere el instalador directo al zip", () => {
        expect(mejorInstalable(om, { sistema: "windows", arquitectura: "x64" })?.nombre).toBe("OmniFrequency-Setup.exe");
        expect(mejorInstalable(om, { sistema: "macos", arquitectura: "arm64" })?.nombre).toBe("OmniFrequency.dmg");
    });

    it("sin instalador para el sistema devuelve null (se usará la web)", () => {
        expect(mejorInstalable(om, { sistema: "ios", arquitectura: "arm64" })).toBeNull();
        expect(mejorInstalable(om, { sistema: "otro", arquitectura: "desconocida" })).toBeNull();
    });
});

describe("dispositivoDesdeUA", () => {
    it("detecta sistema y arquitectura del userAgent", () => {
        expect(dispositivoDesdeUA("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toEqual({ sistema: "android", arquitectura: "desconocida" });
        expect(dispositivoDesdeUA("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toEqual({ sistema: "windows", arquitectura: "x64" });
        expect(dispositivoDesdeUA("Mozilla/5.0 (X11; Linux x86_64)")).toEqual({ sistema: "linux", arquitectura: "x64" });
        expect(dispositivoDesdeUA("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)").sistema).toBe("ios");
    });

    it("un Mac dice «Intel» en el userAgent: la arquitectura real sale de UA-CH", () => {
        const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";
        expect(dispositivoDesdeUA(ua)).toEqual({ sistema: "macos", arquitectura: "desconocida" });
        expect(dispositivoDesdeUA(ua, "macOS", "arm")).toEqual({ sistema: "macos", arquitectura: "arm64" });
        expect(dispositivoDesdeUA(ua, "macOS", "x86")).toEqual({ sistema: "macos", arquitectura: "x64" });
    });
});

describe("releaseDesdeGithub y tamanoLegible", () => {
    it("convierte la respuesta de la API y descarta basura", () => {
        const r = releaseDesdeGithub({
            tag_name: "v2.0.0",
            published_at: "2026-09-22T19:46:49Z",
            html_url: "https://github.com/x/y/releases/tag/v2.0.0",
            assets: [{ name: "A.apk", browser_download_url: "https://g/A.apk", size: 10 }, { name: 3 }, null],
        });
        expect(r).toEqual({
            tag: "v2.0.0",
            publicado: "2026-09-22T19:46:49Z",
            url: "https://github.com/x/y/releases/tag/v2.0.0",
            assets: [{ nombre: "A.apk", url: "https://g/A.apk", bytes: 10 }],
        });
        expect(releaseDesdeGithub({ message: "Not Found" })).toBeNull();
        expect(releaseDesdeGithub(null)).toBeNull();
    });

    it("escribe tamaños en español", () => {
        expect(tamanoLegible(5.4 * MB)).toBe("5,4 MB");
        expect(tamanoLegible(2048 * MB)).toBe("2 GB");
        expect(tamanoLegible(0)).toBe("");
    });
});
