/**
 * Rescate de la rama `nube/40121447096` (RTXR1010 · «Unificar plataformaDe»: main lo hizo por otro
 * camino y su rama quedó archivada). De sus casos, main ya cubre con otro nombre los del sondeo
 * (sondeo-navegador.test.ts, sondeo-entorno-real.test.ts), el UA de escritorio y el modo recomendado
 * en mundo-vr (src/lib/xr/__tests__/capacidades.test.ts) y el veto de camera-access
 * (aplicar-perfil.test.ts). Los que abrían una sesión IWER real (enabledFeatures, entrada sin gesto)
 * vale para la librería `@react-three/xr`, no hay función pura del repo que la abra: descartados.
 * Aquí queda lo que faltaba: el encadenado completo de la entrada, de lo concedido al nuevo pedido.
 */
import { describe, expect, it } from "vitest";
import { evaluarCapacidades, refinarFunciones, type DatosNavegador } from "@/lib/xr/capacidades";
import { funcionesAPedir } from "../aplicar-perfil";

const QUEST3 = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/38.0 SamsungBrowser/4.0 Chrome/134.0 VR Safari/537.36 Quest 3";

describe("iwer-entrada · de lo concedido al nuevo pedido", () => {
    /** Rescate 6: `refinarFunciones` sustituye lo esperado por lo concedido y lo desconocido se ignora;
     *  `funcionesAPedir` sobre lo refinado deja local-floor requerida y hand-tracking opcional. */
    it("refinarFunciones sustituye lo esperado por lo concedido y el nuevo pedido lo deja en requeridas/opcionales", () => {
        const d: DatosNavegador = {
            ua: QUEST3, seguro: true, tieneXR: true, vr: true, ar: true,
            ofreceSesion: false, tactil: false, webgl2: false, webgpu: false, instalada: true,
        };
        const esperadas = evaluarCapacidades(d, { contexto: "mundo-vr" });
        expect(esperadas.plataforma).toBe("quest");
        expect(esperadas.recomendado).toBe("vr-inmersivo");
        expect(esperadas.funciones.length).toBeGreaterThan(2);
        const refinadas = refinarFunciones(esperadas, ["local-floor", "hand-tracking", "magia"]);
        expect(refinadas.funciones).toEqual(["local-floor", "hand-tracking"]);
        expect(funcionesAPedir(refinadas)).toEqual({
            opcionales: ["hand-tracking"],
            requeridas: ["local-floor"],
        });
    });
});
