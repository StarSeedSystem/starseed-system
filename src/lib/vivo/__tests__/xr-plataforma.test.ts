/**
 * XR1010AK · Plataforma unificada. `plataformaDe` (etiqueta vieja de 5 valores) delega ahora en
 * `plataformaDeDatos` (núcleo XR, 10). CASOS usa UAs reales y compara el resultado VIEJO (copia
 * literal de antes del cambio) con el nuevo, documentando cada diferencia aceptada (§2.2).
 */
import { describe, it, expect } from "vitest";
import { plataformaDe, type PlataformaXR } from "@/lib/vivo/xr";
import { plataformaDeDatos, type DatosNavegador } from "@/lib/xr/capacidades";

/** Copia exacta del comportamiento ANTES de delegar (2026-09-28), para contrastar lado a lado. */
function plataformaVieja(ua: string, tactil = false): PlataformaXR {
    const u = ua.toLowerCase();
    if (/oculusbrowser|quest|pico/.test(u)) return "quest";
    if (/visionos|apple vision/.test(u)) return "visionos";
    if (/android/.test(u)) return "android";
    if (/iphone|ipad|ipod/.test(u) || (/macintosh/.test(u) && tactil)) return "ios";
    return "escritorio";
}

/** Datos de navegador sin sondeo: `plataformaDe` sólo tiene la UA y si es táctil. */
const SIN_SONDEO: DatosNavegador = {
    ua: "", seguro: true, tieneXR: false, vr: null, ar: null,
    ofreceSesion: false, tactil: false, webgl2: true, webgpu: false, instalada: false,
};

interface Caso {
    nombre: string;
    ua: string;
    tactil?: boolean;
    esperado: PlataformaXR;
    /** Por qué cambia una etiqueta frente al comportamiento viejo (solo en diferencias aceptadas). */
    diferencia?: string;
}

const CASOS: Caso[] = [
    // Los tres Quest: igual que el viejo (OculusBrowser + «Quest n»/«Quest Pro»).
    { nombre: "Meta Quest 3", ua: "Mozilla/5.0 (X11; Linux x86_64; Quest 3) OculusBrowser/34.3 Chrome/125.0.0.0 Mobile VR Safari/537.36", esperado: "quest" },
    { nombre: "Meta Quest 2", ua: "Mozilla/5.0 (Linux; Android 10; Quest 2) OculusBrowser/28.2.0.0.62 Mobile Safari/537.36", esperado: "quest" },
    { nombre: "Meta Quest Pro", ua: "Mozilla/5.0 (X11; Linux x86_64; Quest Pro) OculusBrowser/30.0.0.14.55 Chrome/124.0.0.0 Mobile Safari/537.36", esperado: "quest" },
    // ÚNICA diferencia real de etiqueta: el viejo metía a Pico en «quest» por /pico/.
    { nombre: "Pico 4", ua: "Mozilla/5.0 (Linux; Android 13; PICO 4) PicoBrowser/6.3.28 Chrome/126.0.0.0 Mobile Safari/537.36", esperado: "escritorio", diferencia: "El núcleo lo etiqueta «pico», que aquí no existe, y cae en «escritorio» (antes «quest»): la sesión la abre isSessionSupported, no la etiqueta." },
    { nombre: "iPhone con Safari iOS 18", ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1", esperado: "ios" },
    { nombre: "iPad con teclado (UA sin «iPad»)", ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.6 Safari/605.1.15", tactil: true, esperado: "ios" },
    { nombre: "Apple Vision Pro", ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7; visionOS 1.3 like Mac OS X) AppleWebKit/605.1.15 Version/17.3 Safari/605.1.15", esperado: "visionos" },
    { nombre: "Android móvil (Pixel 9)", ua: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36", esperado: "android" },
    { nombre: "Android XR (ProjectMoohan)", ua: "Mozilla/5.0 (Linux; Android 15; ProjectMoohan) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36", esperado: "android", diferencia: "El núcleo separa «android-xr» (con vr:true) de «android-movil»: sin sesiones que preguntar, los dos colapsan en «android», el único valor antiguo." },
    { nombre: "Windows con Chrome", ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", esperado: "escritorio" },
    { nombre: "Linux con Firefox", ua: "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0", esperado: "escritorio" },
    { nombre: "Sin UA reconocible", ua: "", esperado: "escritorio", diferencia: "El núcleo responde «desconocida», que la API antigua no tiene: colapsa en «escritorio», como la rama final del código viejo." },
];

describe("plataformaDe · delega en plataformaDeDatos (contrato XR §2.2)", () => {
    it.each(CASOS)("$nombre", ({ ua, tactil, esperado, diferencia }) => {
        expect(plataformaDe(ua, tactil ?? false)).toBe(esperado);
    });

    /** Único caso donde viejo y nuevo NO coinciden: tiene que venir documentado en `diferencia`. */
    const EXCEPCIONES = new Set(["Pico 4"]);

    it("el resultado final coincide con el viejo, salvo las diferencias aceptadas", () => {
        for (const caso of CASOS) {
            const viejo = plataformaVieja(caso.ua, caso.tactil ?? false);
            const nuevo = plataformaDe(caso.ua, caso.tactil ?? false);
            if (EXCEPCIONES.has(caso.nombre)) {
                expect(caso.diferencia).toBeDefined();
                expect(`${nuevo}`).not.toBe(`${viejo}`);
            } else {
                expect(`${nuevo} · ${caso.nombre}`).toBe(`${viejo} · ${caso.nombre}`);
            }
        }
    });

    it("lo que la firma vieja no puede ver, el núcleo sí lo separa con el sondeo", () => {
        expect(plataformaDeDatos({ ...SIN_SONDEO, ua: "PicoBrowser/6.3 Mobile Safari/537.36" })).toBe("pico");
        const xr = "Mozilla/5.0 (Linux; Android 15; ProjectMoohan) Chrome/131.0.0.0 Mobile Safari/537.36";
        expect(plataformaDeDatos({ ...SIN_SONDEO, ua: xr, vr: true })).toBe("android-xr");
        expect(plataformaDeDatos({ ...SIN_SONDEO, ua: xr, vr: null })).toBe("android-movil");
        expect(plataformaDe(xr)).toBe("android");
        const mas = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15";
        expect(plataformaDeDatos({ ...SIN_SONDEO, ua: mas, tieneXR: true, vr: true })).toBe("visionos");
        expect(plataformaDe(mas)).toBe("escritorio");
        expect(plataformaVieja(mas)).toBe("escritorio");
    });
});
