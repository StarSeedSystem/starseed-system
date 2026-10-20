import { afterEach, describe, expect, it, vi } from "vitest";
import { detectCurrentDeviceType } from "../dashboard-devices";

const QUEST3 = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/38.0 SamsungBrowser/4.0 Chrome/134.0 VR Safari/537.36 Quest 3";
const PICO4 = "Mozilla/5.0 (Linux; Android 12; Pico 4 Build/SQ3A) AppleWebKit/537.36 Chrome/114.0 PicoBrowser/4.0 Mobile VR Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const PIXEL = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36";
const WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36";

/** Un navegador simulado: UA, ancho, puntero grueso y si expone `navigator.xr` (Chrome lo expone sin visor). */
function navegador(ua: string, o: { xr?: boolean; ancho?: number; tactil?: boolean } = {}) {
    vi.stubGlobal("navigator", { userAgent: ua, ...(o.xr ? { xr: { isSessionSupported: async () => false } } : {}) });
    vi.stubGlobal("window", { innerWidth: o.ancho ?? 1440, matchMedia: () => ({ matches: o.tactil === true }) });
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("detectCurrentDeviceType · «Dispositivo actual» ya no llama VR a todo Chrome", () => {
    it("Chrome de Mac CON navigator.xr es escritorio (antes decía «vr»)", () => {
        navegador(MAC, { xr: true });
        expect(detectCurrentDeviceType()).toBe("desktop");
    });

    it("Chrome de Windows con navigator.xr (hay visor conectable, pero no lleva uno puesto) es escritorio", () => {
        navegador(WIN, { xr: true });
        expect(detectCurrentDeviceType()).toBe("desktop");
    });

    it("un Pixel con navigator.xr y puntero grueso es teléfono (antes «vr»)", () => {
        navegador(PIXEL, { xr: true, ancho: 412, tactil: true });
        expect(detectCurrentDeviceType()).toBe("phone");
    });

    it("Meta Quest 3 y Pico 4 sí son «vr», con o sin navigator.xr", () => {
        navegador(QUEST3, { xr: true, ancho: 1280 });
        expect(detectCurrentDeviceType()).toBe("vr");
        navegador(PICO4, { ancho: 1280 });
        expect(detectCurrentDeviceType()).toBe("vr");
    });

    it("un iPad (UA de Mac, táctil, pantalla media) es tablet", () => {
        navegador(MAC, { xr: false, ancho: 820, tactil: true });
        expect(detectCurrentDeviceType()).toBe("tablet");
    });

    it("Chrome sin navigator.xr sigue siendo escritorio", () => {
        navegador(WIN);
        expect(detectCurrentDeviceType()).toBe("desktop");
    });

    it("sin window cae a escritorio sin lanzar", () => {
        expect(detectCurrentDeviceType()).toBe("desktop");
    });
});
