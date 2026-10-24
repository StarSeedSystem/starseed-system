/**
 * TESTS de CNX1020A · servicios del A1 por el túnel de la Mac. Solo funciones puras:
 * entrada → salida, sin red, sin disco y sin `vi.mock` de nada.
 */

import { describe, expect, it } from "vitest";
import {
    SERVICIOS_A1,
    TUNEL_A1,
    esperaFria,
    esMedioLocal,
    urlPorDefecto,
    type ServicioA1,
} from "../servicios-a1";

describe("SERVICIOS_A1 · catálogo medido el 2026-10-20", () => {
    it("declara los cinco servicios instalados", () => {
        expect(Object.keys(SERVICIOS_A1)).toEqual([
            "libretranslate",
            "stirling-pdf",
            "archivebox",
            "comfyui",
            "openhands-agent-server",
        ]);
    });

    it("direcciones del A1 y puertos del túnel en la Mac", () => {
        expect(SERVICIOS_A1.libretranslate.dirA1).toBe("127.0.0.1:5000");
        expect(SERVICIOS_A1.libretranslate.puertoMac).toBe(5100); // el 5000 de la Mac es de AirPlay
        expect(SERVICIOS_A1["stirling-pdf"].puertoMac).toBe(8180);
        expect(SERVICIOS_A1.archivebox.puertoMac).toBe(8001);
        expect(SERVICIOS_A1.comfyui.puertoMac).toBe(8188);
        expect(SERVICIOS_A1["openhands-agent-server"].puertoMac).toBe(8010);
        expect(SERVICIOS_A1.libretranslate.nota).toContain("AirPlay");
    });

    it("versiones medidas, dirección local y una variable de entorno por servicio", () => {
        const ids = Object.getOwnPropertyNames(SERVICIOS_A1) as ServicioA1[];
        expect(new Set(ids.map((s) => SERVICIOS_A1[s].envVar)).size).toBe(ids.length);
        for (const s of ids) {
            expect(SERVICIOS_A1[s].version, `versión de ${s}`).toBeTruthy();
            expect(SERVICIOS_A1[s].topeMemoria, `tope de ${s}`).toBeTruthy();
            expect(SERVICIOS_A1[s].dirA1.startsWith("127.0.0.1"), `dirección de ${s}`).toBe(true);
        }
        // Honestidad: lo que quedó sin medir ese día se dice, no se inventa.
        expect(SERVICIOS_A1.archivebox.ramMedida).toBeUndefined();
        expect(SERVICIOS_A1.archivebox.nota).toContain("sin medir");
        expect(SERVICIOS_A1.libretranslate.ramMedida).toBe("711 MiB");
    });

    it("rama y túnel documentados", () => {
        expect(TUNEL_A1).toBe("com.starseed.tunel-servicios-a1");
    });
});

const NOMBRES = Object.getOwnPropertyNames(SERVICIOS_A1) as ServicioA1[];

describe("esMedioLocal · qué medio puede llamar a 127.0.0.1", () => {
    it("localhost por los tres nombres acostumbrados", () => {
        expect(esMedioLocal({ origen: "http://localhost:3000" })).toBe(true);
        expect(esMedioLocal({ origen: "http://127.0.0.1:9002" })).toBe(true);
        expect(esMedioLocal({ origen: "http://[::1]:3000" })).toBe(true);
    });

    it("la app nativa de la Mac, tenga el origen el origen que tenga", () => {
        expect(esMedioLocal({ nativaMac: true, origen: "https://starseed-os.vercel.app" })).toBe(true);
        expect(esMedioLocal({ nativaMac: true })).toBe(true);
    });

    it("ni la página publicada de vercel ni un medio sin origen", () => {
        expect(esMedioLocal({ origen: "https://starseed-os.vercel.app" })).toBe(false);
        expect(esMedioLocal({})).toBe(false);
    });
});

describe("urlPorDefecto · la del túnel solo si el medio es local", () => {
    it("en localhost devuelve la del túnel de la Mac para cada servicio", () => {
        const local = { origen: "http://localhost:3000" };
        for (const s of NOMBRES) {
            const r = urlPorDefecto(s, local);
            expect(r).toEqual({ url: `http://127.0.0.1:${SERVICIOS_A1[s].puertoMac}`, motivo: null });
        }
    });

    it("en la app nativa de la Mac también, aunque el origen sea la nube", () => {
        const nativa = { nativaMac: true, origen: "https://starseed-os.vercel.app" };
        for (const s of NOMBRES)
            expect(urlPorDefecto(s, nativa).url).toBe(`http://127.0.0.1:${SERVICIOS_A1[s].puertoMac}`);
    });

    it("en la página publicada devuelve null y dice el motivo", () => {
        const r = urlPorDefecto("comfyui", { origen: "https://starseed-os.vercel.app" });
        expect(r.url).toBeNull();
        expect(r.motivo).toContain("https");
    });

    it("sin origen y sin marca nativa tampoco, con su motivo", () => {
        const r = urlPorDefecto("stirling-pdf", {});
        expect(r.url).toBeNull();
        expect(r.motivo).toContain("origen");
    });
});

describe("urlPorDefecto · prioridad de las variables de entorno", () => {
    it("COMFYUI_URL manda sobre la dirección del túnel", () => {
        const r = urlPorDefecto("comfyui", { origen: "http://localhost:3000" }, { COMFYUI_URL: "http://10.1.2.3:8188" });
        expect(r).toEqual({ url: "http://10.1.2.3:8188", motivo: "manda la variable COMFYUI_URL" });
    });

    it("cada variable manda en su servicio, incluso en un medio donde la por defecto no valdría", () => {
        const envLibre = { LIBRETRANSLATE_URL: "http://192.168.1.9:5000" };
        expect(urlPorDefecto("libretranslate", { nativaMac: true }, envLibre)).toEqual({
            url: "http://192.168.1.9:5000",
            motivo: "manda la variable LIBRETRANSLATE_URL",
        });
        const envVarios = {
            STIRLING_PDF_URL: "http://10.0.0.4:8180",
            ARCHIVEBOX_URL: "http://10.0.0.4:8001",
            OPENHANDS_AGENT_SERVER_URL: "http://10.0.0.4:8010",
        };
        expect(urlPorDefecto("stirling-pdf", {}, envVarios).url).toBe("http://10.0.0.4:8180");
        expect(urlPorDefecto("archivebox", {}, envVarios).url).toBe("http://10.0.0.4:8001");
        expect(urlPorDefecto("openhands-agent-server", {}, envVarios).motivo).toContain("OPENHANDS_AGENT_SERVER_URL");
    });

    it("una variable vacía no manda: cae a la del túnel si el medio es local", () => {
        const r = urlPorDefecto("comfyui", { origen: "http://localhost:3000" }, { COMFYUI_URL: "" });
        expect(r.url).toBe("http://127.0.0.1:8188");
        expect(r.motivo).toBeNull();
    });
});

describe("esperaFria · cuánto aguanta quien llama antes de darlo por caído", () => {
    it("las medidas del 2026-10-20", () => {
        expect(esperaFria("stirling-pdf")).toEqual({ segundos: 109, nota: expect.stringContaining("medido") });
        expect(esperaFria("comfyui").segundos).toBe(22);
        expect(esperaFria("comfyui").nota).toContain("modelo");
        expect(esperaFria("openhands-agent-server").segundos).toBe(14);
    });

    it("lo no medido se dice sin inventar cifra", () => {
        for (const s of ["libretranslate", "archivebox"] as ServicioA1[]) {
            const e = esperaFria(s);
            expect(e.segundos).toBeNull();
            expect(e.nota).toContain("sin medir");
        }
    });
});
