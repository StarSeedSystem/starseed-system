// @vitest-environment jsdom
/**
 * CTL1118M · en Linux, si WebRTC no es utilizable, `control_capacidades` lo dice en «falta» («webrtc-linux»), deja UNA línea en enlaces.log
 * con la orden exacta y la fila de ENLACES_CONTROL la enseña con esa orden. En otros sistemas no se toca nada.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { capacidadesNativas } from "../nativo";
import { ORDEN_APT_WEBRTC } from "../webrtc-linux";
import { ENLACES_CONTROL } from "@/lib/nativa/permisos-enlaces";
import { PALABRAS_FALTA } from "../palabras";

type G = { __TAURI__?: unknown };
let llamadas: { cmd: string; args?: Record<string, unknown> }[];
let ua = "";
let gst: unknown;

function instalar(userAgent: string, peer: boolean) {
    ua = userAgent;
    Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });
    (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection = peer ? function () { /* falso */ } : undefined;
    (globalThis as G).__TAURI__ = {
        core: {
            invoke: async (cmd: string, args?: Record<string, unknown>) => {
                llamadas.push({ cmd, args });
                if (cmd === "control_capacidades") return { ok: true, pantalla: { accesibilidad: true }, entrada: { gestos: true, max_dedos: 1, teclas: [], volumen: false, brillo: false, texto: true }, falta: [] };
                if (cmd === "webrtc_linux_estado") return gst;
                return { ok: true };
            },
        },
    };
}

beforeEach(() => {
    llamadas = [];
    gst = { linux: true, sabido: true, faltan: ["nice", "webrtcbin"] };
});
afterEach(() => {
    delete (globalThis as G).__TAURI__;
    delete (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection;
});

describe("CTL1118M · falta «webrtc-linux»", () => {
    it("Linux con peer pero sin elementos de GStreamer: falta + una línea en enlaces.log con la orden exacta", async () => {
        instalar("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15", true);
        const c = await capacidadesNativas();
        expect(c?.falta).toContain("webrtc-linux");
        const l = llamadas.filter((x) => x.cmd === "ble_registro_anexar");
        expect(l).toHaveLength(1);
        const linea = (l[0].args as { lineas: string[] }).lineas[0];
        expect(linea).toContain("llamada webrtc-linux");
        expect(linea).toContain("faltan=nice,webrtcbin");
        expect(linea).toContain(`orden=${ORDEN_APT_WEBRTC}`);
        await capacidadesNativas(); // la misma línea no se repite
        expect(llamadas.filter((x) => x.cmd === "ble_registro_anexar")).toHaveLength(1);
    });
    it("Linux con todo bien: no falta nada", async () => {
        gst = { linux: true, sabido: true, faltan: [] };
        instalar("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15", true);
        expect((await capacidadesNativas())?.falta).not.toContain("webrtc-linux");
    });
    it("Linux sin RTCPeerConnection: falta aunque no se haya podido medir", async () => {
        gst = { linux: true, sabido: false, faltan: [] };
        instalar("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15", false);
        expect((await capacidadesNativas())?.falta).toContain("webrtc-linux");
    });
    it("en Android o Mac no se pregunta ni se añade nada", async () => {
        instalar("Mozilla/5.0 (Linux; Android 14) Chrome/120", true);
        expect((await capacidadesNativas())?.falta).not.toContain("webrtc-linux");
        instalar("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15", true);
        expect((await capacidadesNativas())?.falta).not.toContain("webrtc-linux");
        expect(llamadas.some((x) => x.cmd === "webrtc_linux_estado")).toBe(false);
    });
    it("la fila de ENLACES_CONTROL y la palabra de la falta llevan la orden", () => {
        const fila = ENLACES_CONTROL["webrtc-linux"];
        expect(fila).toBeTruthy();
        expect(JSON.stringify(fila)).toContain(ORDEN_APT_WEBRTC);
        expect(JSON.stringify(PALABRAS_FALTA["webrtc-linux"])).toContain("gstreamer1.0-nice");
        expect(JSON.stringify(fila) + JSON.stringify(PALABRAS_FALTA["webrtc-linux"])).not.toMatch(/Mando/);
    });
});
