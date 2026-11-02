/**
 * Pruebas del comando para instalar keepalive (keep-alive v2, Go, MIT) por
 * sistema operativo: SOLO funciones puras exportadas de device-install.ts.
 */

import { describe, expect, it } from "vitest";

import { comandoKeepalive, OS_KEEPALIVE_URL } from "@/lib/install/device-install";

describe("comandoKeepalive", () => {
    it("en macOS el comando es el cask de Homebrew", () => {
        const info = comandoKeepalive("macos");
        expect(info.comando).toBe("brew install --cask stigoleg/tap/keepalive");
        expect(info.url).toBe(OS_KEEPALIVE_URL);
        expect(info.nota).toContain("aserciones");
    });

    it("en Windows el comando es el de scoop", () => {
        const info = comandoKeepalive("windows");
        expect(info.comando).toBe("scoop install keepalive");
    });

    it("en Linux sin gestor nativo: comando null y paquete de releases", () => {
        const info = comandoKeepalive("linux");
        expect(info.comando).toBeNull();
        expect(info.url).toContain("/releases");
        expect(info.nota).toContain(".deb");
    });

    it("en móvil lo dice tal cual: no aplica", () => {
        expect(comandoKeepalive("android").comando).toBeNull();
        expect(comandoKeepalive("ios").comando).toBeNull();
        expect(comandoKeepalive("ios").nota).toContain("no");
    });

    it("en SO desconocido la vía general es go install", () => {
        expect(comandoKeepalive("unknown").comando).toContain("go install");
    });
});
