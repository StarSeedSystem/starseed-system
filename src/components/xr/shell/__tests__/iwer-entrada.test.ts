/**
 * Rescate RTXR1010AK · XR1010AK (rama nube/40121447096).
 *
 * De la rama solo se conserva el caso PURO que main no cubre: lo que una sesión concede
 * (`refinarFunciones`) es exactamente lo que se vuelve a pedir (`funcionesAPedir`). Los casos
 * de abrir sesiones con IWER prueban el emulador de terceros (WebGL, gesto, enabledFeatures),
 * no nuestro código, y no se pueden ejecutar sin navegador ni red.
 */
import { describe, expect, it } from "vitest";
import { evaluarCapacidades, refinarFunciones, type DatosNavegador } from "@/lib/xr/capacidades";
import { funcionesAPedir } from "../aplicar-perfil";

const QUEST3 = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/38.0 SamsungBrowser/4.0 Chrome/134.0 VR Safari/537.36 Quest 3";

/** Datos de un Quest con WebXR ya sondeado (sin DOM): lo que IWER pondría en el navegador. */
const QUEST_SONDADO: DatosNavegador = {
    ua: QUEST3,
    seguro: true,
    tieneXR: true,
    vr: true,
    ar: true,
    ofreceSesion: false,
    tactil: false,
    webgl2: true,
    webgpu: false,
    instalada: false,
};

describe("iwer-entrada · lo concedido manda al volver a pedir", () => {
    it("refinarFunciones sustituye lo esperado por lo concedido y funcionesAPedir lo respeta", () => {
        const esperadas = evaluarCapacidades(QUEST_SONDADO);
        expect(esperadas.funciones.length).toBeGreaterThan(2);
        const refinadas = refinarFunciones(esperadas, ["local-floor", "hand-tracking", "magia"]);
        expect(refinadas.funciones).toEqual(["local-floor", "hand-tracking"]);
        expect(funcionesAPedir(refinadas)).toEqual({
            opcionales: ["hand-tracking"],
            requeridas: ["local-floor"],
        });
    });
});
