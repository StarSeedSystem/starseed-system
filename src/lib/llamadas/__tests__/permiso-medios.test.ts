import { describe, expect, it } from "vitest";
import {
    diagnosticarMedios,
    plataformaDeAgente,
    plataformaDeTexto,
    type EntornoMedios,
    type PlataformaMedios,
} from "@/lib/llamadas/permiso-medios";

/*
 * MIC1108A · «Este navegador no deja usar el micrófono» se separa en: app instalada sin permiso del
 * sistema (versión anterior), «no» de la persona o del sistema (con dónde se activa y «Abrir
 * ajustes»), sin dispositivo, ocupado, pantalla cancelada o no disponible.
 */

const VOZ = { audio: true, video: false };
const VIDEO = { audio: true, video: true };
const PANTALLA = { audio: false, video: true, pantalla: true };

const web: EntornoMedios = { nativa: false, plataforma: "macos", estado: null };
const vieja = (plataforma: PlataformaMedios): EntornoMedios => ({ nativa: true, plataforma, estado: null });
const nueva = (plataforma: PlataformaMedios, extra: Partial<{ declarados: boolean; abrir_ajustes: boolean }> = {}): EntornoMedios => ({
    nativa: true,
    plataforma,
    estado: { version: 1, plataforma, declarados: true, abrir_ajustes: plataforma !== "linux", ...extra },
});

const SIN_API = { name: "NoMediaDevices" };
const NEGADO = { name: "NotAllowedError" };

describe("diagnosticarMedios — app nativa", () => {
    it("app anterior a MIC1108A en macOS: sin getUserMedia → falta el permiso de la app, no del navegador", () => {
        const d = diagnosticarMedios(SIN_API, VOZ, vieja("macos"));
        expect(d.causa).toBe("app-sin-permiso");
        expect(d.mensaje).toMatch(/Esta instalación de la app no tiene permiso del sistema para usar el micrófono/);
        expect(d.mensaje).toMatch(/versión nueva/);
        expect(d.mensaje).not.toMatch(/navegador no deja/);
        expect(d.ajustes).toBeNull();
    });

    it("app anterior en Android: el «no» instantáneo es de la app (permiso sin declarar)", () => {
        expect(diagnosticarMedios(NEGADO, VIDEO, vieja("android")).causa).toBe("app-sin-permiso");
    });

    it("app nueva que no declaró el micro en su instalación (manifiesto sin parchear)", () => {
        const d = diagnosticarMedios(NEGADO, VOZ, nueva("android", { declarados: false }));
        expect(d.causa).toBe("app-sin-permiso");
    });

    it("en Windows las apps anteriores sí preguntaban: un «no» es de la persona", () => {
        const d = diagnosticarMedios(NEGADO, VOZ, vieja("windows"));
        expect(d.causa).toBe("denegado");
        expect(d.mensaje).toMatch(/Configuración › Privacidad y seguridad › Micrófono/);
        expect(d.ajustes).toBeNull(); // la app vieja no sabe abrir ajustes
    });

    it("macOS dijo que no: dónde se activa y «Abrir ajustes» del micrófono", () => {
        const d = diagnosticarMedios(NEGADO, VOZ, nueva("macos"));
        expect(d.causa).toBe("denegado");
        expect(d.mensaje).toMatch(/^macOS no deja a StarSeed usar el micrófono\./);
        expect(d.mensaje).toMatch(/Ajustes del Sistema › Privacidad y seguridad › Micrófono/);
        expect(d.ajustes).toBe("microfono");
    });

    it("videollamada denegada en macOS: micrófono y cámara, y se abre el del micrófono", () => {
        const d = diagnosticarMedios(NEGADO, VIDEO, nueva("macos"));
        expect(d.mensaje).toMatch(/el micrófono y la cámara/);
        expect(d.mensaje).toMatch(/› Micrófono y Cámara/);
        expect(d.ajustes).toBe("microfono");
    });

    it("solo cámara denegada: ajustes de la cámara", () => {
        expect(diagnosticarMedios(NEGADO, { audio: false, video: true }, nueva("windows")).ajustes).toBe("camara");
    });

    it("Android dijo que no: Ajustes › Aplicaciones › StarSeed › Permisos", () => {
        const d = diagnosticarMedios({ name: "SecurityError" }, VOZ, nueva("android"));
        expect(d.causa).toBe("denegado");
        expect(d.mensaje).toMatch(/Android no deja/);
        expect(d.mensaje).toMatch(/Aplicaciones › StarSeed › Permisos/);
        expect(d.ajustes).toBe("microfono");
    });

    it("Linux: sin botón (no hay ajustes que abrir) y sin MediaStream lo dice", () => {
        const d = diagnosticarMedios(NEGADO, VOZ, nueva("linux"));
        expect(d.causa).toBe("denegado");
        expect(d.ajustes).toBeNull();
        const sinApi = diagnosticarMedios(SIN_API, VOZ, nueva("linux"));
        expect(sinApi.causa).toBe("no-soportado");
        expect(sinApi.mensaje).toMatch(/WebKitGTK con MediaStream y WebRTC/);
    });

    it("sin dispositivo y ocupado: los textos de siempre, sin botón", () => {
        const sin = diagnosticarMedios({ name: "NotFoundError" }, VOZ, nueva("macos"));
        expect(sin.causa).toBe("sin-dispositivo");
        expect(sin.mensaje).toMatch(/ningún micrófono/);
        expect(sin.ajustes).toBeNull();
        const ocupado = diagnosticarMedios({ name: "NotReadableError" }, VOZ, nueva("windows"));
        expect(ocupado.causa).toBe("ocupado");
        expect(ocupado.mensaje).toMatch(/Otra aplicación/);
        // Aunque la app sea vieja, «no hay micro» sigue siendo «no hay micro».
        expect(diagnosticarMedios({ name: "NotFoundError" }, VOZ, vieja("macos")).causa).toBe("sin-dispositivo");
    });

    it("pantalla: cancelada o sin «Grabación de pantalla» en macOS (con botón)", () => {
        const d = diagnosticarMedios(NEGADO, PANTALLA, nueva("macos"));
        expect(d.causa).toBe("cancelado");
        expect(d.mensaje).toMatch(/No se compartió la pantalla/);
        expect(d.mensaje).toMatch(/Grabación de pantalla/);
        expect(d.ajustes).toBe("pantalla");
        // Fuera de macOS no hay ajuste de pantalla que abrir.
        expect(diagnosticarMedios(NEGADO, PANTALLA, nueva("windows")).ajustes).toBeNull();
    });

    it("pantalla que el motor no trae (Android WebView): se dice claro, aun en la app vieja", () => {
        const d = diagnosticarMedios(SIN_API, PANTALLA, nueva("android"));
        expect(d.causa).toBe("no-soportado");
        expect(d.mensaje).toMatch(/Android no deja compartir la pantalla/);
        expect(diagnosticarMedios(SIN_API, PANTALLA, vieja("macos")).causa).toBe("no-soportado");
    });
});

describe("diagnosticarMedios — navegador", () => {
    it("mantiene los textos del navegador (candado, https) y nunca ofrece «Abrir ajustes»", () => {
        const d = diagnosticarMedios(NEGADO, VOZ, web);
        expect(d.causa).toBe("denegado");
        expect(d.mensaje).toMatch(/candado/);
        expect(d.ajustes).toBeNull();
        expect(diagnosticarMedios(SIN_API, VOZ, web).mensaje).toMatch(/https/);
        expect(diagnosticarMedios(SIN_API, PANTALLA, web).mensaje).toMatch(/no permite compartir la pantalla desde el navegador/);
    });
});

describe("plataforma", () => {
    it("por el agente del navegador", () => {
        expect(plataformaDeAgente("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15")).toBe("macos");
        expect(plataformaDeAgente("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 wv")).toBe("android");
        expect(plataformaDeAgente("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/130")).toBe("windows");
        expect(plataformaDeAgente("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15")).toBe("linux");
        expect(plataformaDeAgente("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe("ios");
        expect(plataformaDeAgente("")).toBe("otra");
    });

    it("por lo que dice la app", () => {
        expect(plataformaDeTexto("macos")).toBe("macos");
        expect(plataformaDeTexto(" Android ")).toBe("android");
        expect(plataformaDeTexto("freebsd")).toBe("otra");
    });
});
