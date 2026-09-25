import { describe, expect, it } from "vitest";

import {
    APPS_OFICIALES,
    dispositivoDesdeUA,
    instalablesDeApp,
    type AssetRelease,
    type ReleaseOficial,
} from "@/lib/apps-oficiales/apps-oficiales";
import { corregirIPad } from "@/lib/apps-oficiales/dispositivo-actual";
import {
    elegirInstaladorOS,
    esAssetDelOS,
    instaladoresPorSistema,
    instalableParaApp,
    instalablesDelOS,
    instruccionesAbrir,
    OS_APP_ID,
    OS_RELEASES_ULTIMA_URL,
    PASOS_IOS,
    planInstalarOS,
    type EntradaPlanOS,
} from "../instalar-os-logica";

const BASE = "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.3.0";
const a = (nombre: string, mb = 50): AssetRelease => ({ nombre, url: `${BASE}/${nombre}`, bytes: mb * 1024 * 1024 });

/** Un release como el real: el OS convive con Nexus, Café, firmas y el latest.json del updater. */
const ASSETS: AssetRelease[] = [
    a("StarSeed.OS_0.3.0_universal.dmg", 30),
    a("StarSeed.OS_universal.app.tar.gz"),
    a("StarSeed.OS_universal.app.tar.gz.sig", 0.001),
    a("StarSeed.OS_0.3.0_x64-setup.exe", 8),
    a("StarSeed.OS_0.3.0_x64-setup.exe.sig", 0.001),
    a("StarSeed.OS_0.3.0_x64_en-US.msi", 9),
    a("StarSeed.OS_0.3.0_amd64.AppImage", 80),
    a("StarSeed.OS_0.3.0_amd64.AppImage.sig", 0.001),
    a("StarSeed.OS_0.3.0_amd64.deb", 7),
    a("StarSeed.OS-0.3.0-1.x86_64.rpm", 7),
    a("StarSeed-os-0.3.0.apk", 12),
    a("latest.json", 0.001),
    a("StarSeed.Nexus_0.3.0_universal.dmg", 30),
    a("StarSeed.Nexus_0.3.0_x64-setup.exe", 8),
    a("StarSeed.Nexus_0.3.0_amd64.AppImage", 80),
    a("StarSeed.Cafe_0.3.0_universal.dmg", 30),
    a("StarSeed.Cafe_0.3.0_amd64.deb", 7),
    a("StarSeed-nexus-0.3.0.apk", 12),
    a("StarSeed-cafe-0.3.0.apk", 12),
];

const RELEASE: ReleaseOficial = {
    tag: "v0.3.0",
    publicado: "2026-10-01T10:00:00Z",
    url: "https://github.com/StarSeedSystem/starseed-system/releases/tag/v0.3.0",
    assets: ASSETS,
};

const elegir = (sistema: Parameters<typeof elegirInstaladorOS>[1]["sistema"], arquitectura: Parameters<typeof elegirInstaladorOS>[1]["arquitectura"], distro?: "debian" | "fedora") =>
    elegirInstaladorOS(ASSETS, { sistema, arquitectura, ...(distro ? { distro } : {}) })?.nombre ?? null;

describe("filtrado de los archivos del OS", () => {
    it("reconoce los tres patrones del OS y descarta Nexus y Café", () => {
        expect(esAssetDelOS("StarSeed.OS_0.3.0_universal.dmg")).toBe(true);
        expect(esAssetDelOS("StarSeed.OS-0.3.0-1.x86_64.rpm")).toBe(true);
        expect(esAssetDelOS("StarSeed-os-0.3.0.apk")).toBe(true);
        expect(esAssetDelOS("StarSeed.Nexus_0.3.0_universal.dmg")).toBe(false);
        expect(esAssetDelOS("StarSeed.Cafe_0.3.0_amd64.deb")).toBe(false);
        expect(esAssetDelOS("StarSeed-nexus-0.3.0.apk")).toBe(false);
        expect(esAssetDelOS("StarSeed-cafe-0.3.0.apk")).toBe(false);
        expect(esAssetDelOS("latest.json")).toBe(false);
    });

    it("se queda con los siete instaladores del OS, sin firmas ni paquetes del actualizador", () => {
        const nombres = instalablesDelOS(ASSETS).map((x) => x.nombre).sort();
        expect(nombres).toEqual(
            [
                "StarSeed-os-0.3.0.apk",
                "StarSeed.OS-0.3.0-1.x86_64.rpm",
                "StarSeed.OS_0.3.0_amd64.AppImage",
                "StarSeed.OS_0.3.0_amd64.deb",
                "StarSeed.OS_0.3.0_universal.dmg",
                "StarSeed.OS_0.3.0_x64-setup.exe",
                "StarSeed.OS_0.3.0_x64_en-US.msi",
            ].sort(),
        );
    });

    it("la entrada «starseed-os» de las apps oficiales aplica el mismo filtro", () => {
        expect(instalablesDeApp(OS_APP_ID, ASSETS).every((x) => esAssetDelOS(x.nombre))).toBe(true);
        // El respaldo sale de os-release.ts: solo archivos del OS, uno por formato.
        const respaldo = APPS_OFICIALES[OS_APP_ID].respaldo;
        expect(respaldo.assets.every((x) => esAssetDelOS(x.nombre))).toBe(true);
        expect(instalablesDeApp(OS_APP_ID, respaldo.assets)).toHaveLength(7);
    });
});

describe("elegirInstaladorOS por sistema y arquitectura", () => {
    it("macOS: el .dmg universal, sea Apple Silicon, Intel o desconocida", () => {
        expect(elegir("macos", "arm64")).toBe("StarSeed.OS_0.3.0_universal.dmg");
        expect(elegir("macos", "x64")).toBe("StarSeed.OS_0.3.0_universal.dmg");
        expect(elegir("macos", "desconocida")).toBe("StarSeed.OS_0.3.0_universal.dmg");
    });

    it("Windows: el .exe antes que el .msi, también en ARM (emulación x64)", () => {
        expect(elegir("windows", "x64")).toBe("StarSeed.OS_0.3.0_x64-setup.exe");
        expect(elegir("windows", "desconocida")).toBe("StarSeed.OS_0.3.0_x64-setup.exe");
        expect(elegir("windows", "arm64")).toBe("StarSeed.OS_0.3.0_x64-setup.exe");
        const soloMsi = ASSETS.filter((x) => !x.nombre.endsWith(".exe"));
        expect(elegirInstaladorOS(soloMsi, { sistema: "windows", arquitectura: "x64" })?.nombre).toBe("StarSeed.OS_0.3.0_x64_en-US.msi");
    });

    it("Linux: AppImage por defecto, .deb en Debian/Ubuntu y .rpm en Fedora", () => {
        expect(elegir("linux", "x64")).toBe("StarSeed.OS_0.3.0_amd64.AppImage");
        expect(elegir("linux", "x64", "debian")).toBe("StarSeed.OS_0.3.0_amd64.deb");
        expect(elegir("linux", "x64", "fedora")).toBe("StarSeed.OS-0.3.0-1.x86_64.rpm");
    });

    it("Linux ARM no recibe un archivo x64 que no arrancaría", () => {
        expect(elegir("linux", "arm64")).toBeNull();
    });

    it("Android: el .apk del OS, nunca el de Nexus o Café", () => {
        expect(elegir("android", "arm64")).toBe("StarSeed-os-0.3.0.apk");
        const sinOS = ASSETS.filter((x) => x.nombre !== "StarSeed-os-0.3.0.apk");
        expect(elegirInstaladorOS(sinOS, { sistema: "android", arquitectura: "arm64" })).toBeNull();
    });

    it("iPhone/iPad y sistemas desconocidos: ningún archivo", () => {
        expect(elegir("ios", "arm64")).toBeNull();
        expect(elegir("otro", "desconocida")).toBeNull();
    });

    it("instalableParaApp usa esta elección para el OS y la de siempre para las demás", () => {
        expect(instalableParaApp(OS_APP_ID, RELEASE, { sistema: "linux", arquitectura: "x64", distro: "debian" })?.nombre).toBe(
            "StarSeed.OS_0.3.0_amd64.deb",
        );
        const omni = APPS_OFICIALES.omnifrecuencias.respaldo;
        expect(instalableParaApp("omnifrecuencias", omni, { sistema: "android", arquitectura: "arm64" })?.nombre).toBe("OmniFrequency.apk");
        expect(instalableParaApp(undefined, RELEASE, { sistema: "macos", arquitectura: "arm64" })).toBeNull();
        expect(instalableParaApp(OS_APP_ID, null, { sistema: "macos", arquitectura: "arm64" })).toBeNull();
    });
});

describe("detección del dispositivo", () => {
    it("deduce la distribución de Linux cuando el navegador la escribe", () => {
        const ubuntu = "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0";
        const fedora = "Mozilla/5.0 (X11; Fedora; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0";
        const chrome = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
        expect(dispositivoDesdeUA(ubuntu)).toEqual({ sistema: "linux", arquitectura: "x64", distro: "debian" });
        expect(dispositivoDesdeUA(fedora)).toEqual({ sistema: "linux", arquitectura: "x64", distro: "fedora" });
        expect(dispositivoDesdeUA(chrome).distro).toBeUndefined();
    });

    it("un iPad que se hace pasar por Mac vuelve a ser iPad (tiene pantalla táctil)", () => {
        const mac = { sistema: "macos" as const, arquitectura: "desconocida" as const };
        expect(corregirIPad(mac, 5)).toEqual({ sistema: "ios", arquitectura: "arm64" });
        expect(corregirIPad(mac, 0)).toEqual(mac);
    });
});

describe("instrucciones para abrir el archivo", () => {
    it("dice lo que cada sistema pide la primera vez", () => {
        expect(instruccionesAbrir("StarSeed.OS_0.3.0_universal.dmg")).toMatch(/Aplicaciones.*clic derecho.*Abrir/);
        expect(instruccionesAbrir("StarSeed.OS_0.3.0_x64-setup.exe")).toMatch(/Más información.*Ejecutar de todas formas/);
        expect(instruccionesAbrir("StarSeed.OS_0.3.0_x64_en-US.msi")).toMatch(/Ejecutar de todas formas/);
        expect(instruccionesAbrir("StarSeed-os-0.3.0.apk")).toMatch(/instale apps desconocidas/);
        expect(instruccionesAbrir("StarSeed.OS_0.3.0_amd64.AppImage")).toMatch(/Permitir ejecutar como programa/);
        expect(instruccionesAbrir("StarSeed.OS_0.3.0_amd64.deb")).toMatch(/doble clic/);
    });
});

const entrada = (parcial: Partial<EntradaPlanOS>): EntradaPlanOS => ({
    release: RELEASE,
    origen: "github",
    dispositivo: { sistema: "macos", arquitectura: "arm64" },
    esNativa: false,
    esStandalone: false,
    puedePwa: false,
    ...parcial,
});

describe("planInstalarOS", () => {
    it("en un Mac descarga el .dmg de la última versión y explica cómo abrirlo", () => {
        const plan = planInstalarOS(entrada({}));
        expect(plan.tipo).toBe("descargar");
        if (plan.tipo !== "descargar") return;
        expect(plan.asset.nombre).toBe("StarSeed.OS_0.3.0_universal.dmg");
        expect(plan.version).toBe("v0.3.0");
        expect(plan.accion).toBe("Descargar para macOS");
        expect(plan.instrucciones).toMatch(/Aplicaciones/);
        expect(plan.nota).toBeNull();
        expect(plan.otrosUrl).toBe(OS_RELEASES_ULTIMA_URL);
    });

    it("avisa cuando la versión es la de respaldo (GitHub no contestó)", () => {
        const plan = planInstalarOS(entrada({ origen: "respaldo" }));
        expect(plan.tipo === "descargar" && plan.nota).toMatch(/última versión conocida/);
    });

    it("Windows ARM recibe el x64 con la nota de la emulación", () => {
        const plan = planInstalarOS(entrada({ dispositivo: { sistema: "windows", arquitectura: "arm64" } }));
        expect(plan.tipo === "descargar" && plan.nota).toMatch(/emulación/);
    });

    it("dentro de la app nativa no ofrece descargarla otra vez", () => {
        expect(planInstalarOS(entrada({ esNativa: true })).tipo).toBe("ya-instalada");
    });

    it("en iPhone/iPad enseña los pasos de Safari (y nada si ya está en la pantalla de inicio)", () => {
        const plan = planInstalarOS(entrada({ dispositivo: { sistema: "ios", arquitectura: "arm64" } }));
        expect(plan.tipo).toBe("web");
        if (plan.tipo !== "web") return;
        expect(plan.pasos).toBe(PASOS_IOS);
        expect(plan.usarPwa).toBe(false);
        expect(plan.accion).toBe("Añadir a pantalla de inicio");
        expect(planInstalarOS(entrada({ dispositivo: { sistema: "ios", arquitectura: "arm64" }, esStandalone: true })).tipo).toBe("ya-instalada");
    });

    it("sin archivo para el procesador (Linux ARM) ofrece la web y su diálogo si existe", () => {
        const plan = planInstalarOS(entrada({ dispositivo: { sistema: "linux", arquitectura: "arm64" }, puedePwa: true }));
        expect(plan.tipo).toBe("web");
        if (plan.tipo !== "web") return;
        expect(plan.detalle).toMatch(/Linux con procesador ARM/);
        expect(plan.usarPwa).toBe(true);
        expect(plan.accion).toBe("Instalar como app web");
    });

    it("sin release (nada que leer) cae a la web sin romperse", () => {
        expect(planInstalarOS(entrada({ release: null })).tipo).toBe("web");
    });
});

describe("instaladoresPorSistema", () => {
    it("agrupa los archivos del OS por sistema, el recomendado primero", () => {
        const grupos = instaladoresPorSistema(RELEASE);
        expect(grupos.map((g) => g.sistema)).toEqual(["macos", "windows", "linux", "android"]);
        expect(grupos.find((g) => g.sistema === "linux")?.archivos.map((x) => x.nombre)).toEqual([
            "StarSeed.OS_0.3.0_amd64.AppImage",
            "StarSeed.OS_0.3.0_amd64.deb",
            "StarSeed.OS-0.3.0-1.x86_64.rpm",
        ]);
        expect(grupos.flatMap((g) => g.archivos).every((x) => esAssetDelOS(x.nombre))).toBe(true);
        expect(instaladoresPorSistema(null)).toEqual([]);
    });
});
