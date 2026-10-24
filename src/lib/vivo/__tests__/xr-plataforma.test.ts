import { describe, expect, it } from "vitest";
import { plataformaDe } from "@/lib/vivo/xr";

/**
 * XR1010AK · plataformaDe ahora delega en `plataformaDeDatos` del núcleo XR
 * (`src/lib/xr/capacidades.ts`); mantiene su firma y sus 5 salidas
 * (`quest | visionos | android | ios | escritorio`). Cada caso usa una UA real
 * y compara el resultado de la implementación vieja con el nuevo.
 */

/** Copia literal del código que vivía en `plataformaDe` antes de delegar. */
function vieja(ua: string, tactil = false): string {
    const u = ua.toLowerCase();
    if (/oculusbrowser|quest|pico/.test(u)) return "quest";
    if (/visionos|apple vision/.test(u)) return "visionos";
    if (/android/.test(u)) return "android";
    if (/iphone|ipad|ipod/.test(u) || (/macintosh/.test(u) && tactil)) return "ios";
    return "escritorio";
}

interface Caso {
    nombre: string;
    ua: string;
    tactil?: boolean;
    esperado: "quest" | "visionos" | "android" | "ios" | "escritorio";
}

const CASOS: Caso[] = [
    {
        nombre: "Quest 3 (OculusBrowser)",
        ua: "Mozilla/5.0 (X11; Linux x86_64; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/34.4.0.0.241 Safari/537.36",
        esperado: "quest",
    },
    {
        nombre: "Quest 2 (OculusBrowser)",
        ua: "Mozilla/5.0 (Linux; Android 10; Quest 2) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/21.0.0.53.323 Mobile Safari/537.36",
        esperado: "quest",
    },
    {
        nombre: "Quest Pro (OculusBrowser)",
        ua: "Mozilla/5.0 (Linux; Android 11; Quest Pro) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/28.1.0.4.272 Mobile Safari/537.36",
        esperado: "quest",
    },
    {
        nombre: "iPhone (Safari)",
        ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
        esperado: "ios",
    },
    {
        nombre: "iPad (Safari)",
        ua: "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
        esperado: "ios",
    },
    {
        nombre: "iPad con teclado (Safari en «modo Macintosh», táctil)",
        ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
        tactil: true,
        esperado: "ios",
    },
    {
        nombre: "Vision Pro (Safari visionOS)",
        ua: "Mozilla/5.0 (Macintosh; Apple Vision Pro; visionOS 2.0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1",
        esperado: "visionos",
    },
    {
        nombre: "Android móvil (Pixel, Chrome)",
        ua: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
        esperado: "android",
    },
    {
        nombre: "Android XR (Project Moohan; sin sondeo, cae en móvil)",
        ua: "Mozilla/5.0 (Linux; Android 15; Project Moohan) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Mobile Safari/537.36",
        esperado: "android",
    },
    {
        nombre: "Windows (Chrome)",
        ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        esperado: "escritorio",
    },
    {
        nombre: "Linux (Firefox)",
        ua: "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0",
        esperado: "escritorio",
    },
];

describe("plataformaDe · Android XR con sondeo (vr: true)", () => {
    it("android-xr también mapea a «android»: la salida del API antiguo no tiene categoría propia", () => {
        // Con el sondeo completo el núcleo diría «android-xr»; sin datos de WebXR (por
        // la firma vieja) cae en «android-movil». Ambos mapean a «android»: el rótulo
        // antiguo nunca distinguía visor de mano.
        expect(plataformaDe("Mozilla/5.0 (Linux; Android 15; Project Moohan) Chrome/134 Mobile Safari/537.36")).toBe("android");
    });
});

describe("plataformaDe · diferencias aceptadas (documentadas)", () => {
    it("un UA de Pico antes se etiquetaba «quest», ahora «escritorio»", () => {
        const ua = "Mozilla/5.0 (Linux; Android 12; P4 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 PicoBrowser/5.7.0 Mobile Safari/537.36";
        expect(vieja(ua)).toBe("quest");
        expect(plataformaDe(ua)).toBe("escritorio");
    });

    it("un UA de Magic Leap antes se etiquetaba «android», ahora «escritorio»", () => {
        const ua = "Mozilla/5.0 (Linux; Android 11; MagicLeap2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Mobile Safari/537.36 MLBrowser/3.2.1";
        expect(vieja(ua)).toBe("android");
        expect(plataformaDe(ua)).toBe("escritorio");
    });
});

describe("plataformaDe (delega en plataformaDeDatos) · coinciden con la versión vieja", () => {
    it("cada caso da lo mismo con el código nuevo que con el viejo", () => {
        for (const c of CASOS) {
            expect({ caso: c.nombre, nueva: plataformaDe(c.ua, c.tactil), vieja: vieja(c.ua, c.tactil) }).toEqual({
                caso: c.nombre,
                nueva: c.esperado,
                vieja: c.esperado,
            });
        }
    });
});
