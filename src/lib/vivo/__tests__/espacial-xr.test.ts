import { describe, expect, it } from "vitest";
import { describirSoporteXR, modoXRDe, plataformaDe, rutaSalaLlamada, rutaSalaXr } from "@/lib/vivo/xr";
import { INFO_VIVO_ESCENA3D, rutaEscena } from "@/lib/vivo/escena3d";

describe("sala XR · rutas", () => {
    it("acepta los mismos parámetros que la llamada manda hoy a /xr", () => {
        expect(rutaSalaLlamada("abc", "ar")).toBe("/sala-xr?sesion=abc&modo=ar");
        expect(rutaSalaXr("id-1", "vr")).toBe("/sala-xr/id-1?modo=vr");
        expect(rutaEscena("id 2")).toBe("/escena/id%202");
        expect(modoXRDe("ar")).toBe("ar");
        expect(modoXRDe("mr")).toBeNull();
    });

    it("la ficha usa un icono de lucide, no un emoji", () => {
        expect(INFO_VIVO_ESCENA3D.icono).toBe("Box");
    });
});

describe("sala XR · soporte honesto", () => {
    it("reconoce las plataformas", () => {
        expect(plataformaDe("Mozilla/5.0 (X11; Linux x86_64; Quest 3) OculusBrowser/34")).toBe("quest");
        expect(plataformaDe("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("ios");
        expect(plataformaDe("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", true)).toBe("ios");
        expect(plataformaDe("Mozilla/5.0 (Linux; Android 15; Pixel 9)")).toBe("android");
        expect(plataformaDe("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("escritorio");
    });

    it("en iPhone no promete VR y explica por qué", () => {
        const d = describirSoporteXR({ vr: false, ar: false, seguro: true, plataforma: "ios" }, "vr");
        expect(d.puede).toBe(false);
        expect(d.detalle).toMatch(/iPhone/);
        expect(d.detalle).toMatch(/misma sala/);
    });

    it("sin https no hay WebXR", () => {
        expect(describirSoporteXR({ vr: true, ar: true, seguro: false, plataforma: "quest" }, "vr").puede).toBe(false);
    });

    it("ofrece la alternativa si piden VR y solo hay AR", () => {
        const d = describirSoporteXR({ vr: false, ar: true, seguro: true, plataforma: "android" }, "vr");
        expect(d.puede).toBe(false);
        expect(d.detalle).toMatch(/sí admite AR/);
        expect(describirSoporteXR({ vr: false, ar: true, seguro: true, plataforma: "android" }, "ar").puede).toBe(true);
    });

    it("mientras comprueba, no afirma nada", () => {
        expect(describirSoporteXR({ vr: null, ar: null, seguro: true, plataforma: "escritorio" }, null).puede).toBe(false);
    });
});
