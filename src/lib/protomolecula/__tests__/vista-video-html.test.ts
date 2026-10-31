import { describe, expect, it } from "vitest";
import {
    ATOMO_VIDEO_HTML,
    elegirVista,
    ID_VISTA_VIDEO_HTML,
    urlVistaViva,
    vistaVideoHtmlDe,
} from "../bloque-protomolecula";
import { VIDEO_HTML } from "../atomos/video-html";

describe("átomo video-html → vista", () => {
    it("la ficha del átomo y la correspondencia apuntan a la misma vista", () => {
        expect(ATOMO_VIDEO_HTML).toBe("hyperframes");
        expect(VIDEO_HTML.herramientaId).toBe(ATOMO_VIDEO_HTML);
        expect(vistaVideoHtmlDe(VIDEO_HTML.herramientaId)).toBe(ID_VISTA_VIDEO_HTML);
        expect(ID_VISTA_VIDEO_HTML).toBe("video-html");
    });

    it("los demás átomos no entran en esta correspondencia", () => {
        expect(vistaVideoHtmlDe("escena3d")).toBeNull();
        expect(vistaVideoHtmlDe("")).toBeNull();
        expect(elegirVista({ herramientaId: "escena3d", estado: "activo" }, true, true)).toBeNull();
    });
});

describe("elegirVista", () => {
    const activo = { herramientaId: ATOMO_VIDEO_HTML, estado: "activo" as const };
    const suspendido = { herramientaId: ATOMO_VIDEO_HTML, estado: "suspendido" as const };

    it("el vídeo ya renderizado manda, vivo o no el servicio", () => {
        expect(elegirVista(activo, false, true)).toBe("render");
        expect(elegirVista(activo, true, true)).toBe("render");
    });

    it("sin render, la vista previa en vivo si el servicio local responde", () => {
        expect(elegirVista(activo, true, false)).toBe("vivo");
    });

    it("sin render ni servicio, solo el póster", () => {
        expect(elegirVista(activo, false, false)).toBe("poster");
    });

    it("un átomo suspendido no se reproduce: póster siempre", () => {
        expect(elegirVista(suspendido, true, true)).toBe("poster");
        expect(elegirVista(suspendido, false, false)).toBe("poster");
    });

    it("es pura: la entrada no se muta y la salida es determinista", () => {
        const atomo = { ...suspendido };
        expect(elegirVista(atomo, true, true)).toBe(elegirVista({ herramientaId: ATOMO_VIDEO_HTML, estado: "suspendido" }, true, true));
        expect(atomo).toEqual(suspendido);
    });
});

describe("urlVistaViva", () => {
    it("arma la URL del reproductor del servicio local con un id válido", () => {
        expect(urlVistaViva("abc123_X")).toBe("http://127.0.0.1:4490/vista/abc123_X");
    });

    it("rechaza ids que no sirven, incluidos los que escapan del proyecto", () => {
        expect(urlVistaViva("")).toBeNull();
        expect(urlVistaViva("a/b")).toBeNull();
        expect(urlVistaViva("../x")).toBeNull();
        expect(urlVistaViva("a b")).toBeNull();
        expect(urlVistaViva("id".padEnd(80, "a"))).toBeNull();
    });
});
