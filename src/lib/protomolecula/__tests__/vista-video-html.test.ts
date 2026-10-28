import { describe, expect, it } from "vitest";
import {
  BASE_SERVICIO_VIDEO,
  elegirVista,
  urlSegura,
  type AtomoVideoHtml,
} from "@/components/protomolecula/vista-video-html";
import { VISTAS_DE_ATOMO, vistaDeAtomo } from "../bloque-protomolecula";

const POSTER = "https://cdn.ejemplo/poster.png";
const RENDER = "https://cdn.ejemplo/final.mp4";
const VIVO = "http://127.0.0.1:4490/vista/at-1";

describe("elegirVista · qué enseña el átomo video-html en el bloque", () => {
  it("prefiere el vídeo ya renderizado, aunque haya póster y servicio vivo", () => {
    expect(elegirVista({ poster: POSTER }, VIVO, RENDER)).toEqual({ tipo: "render", url: RENDER });
  });

  it("sin render, enseña la vista previa en vivo del servicio local", () => {
    expect(elegirVista({ poster: POSTER }, VIVO, null)).toEqual({ tipo: "directo", url: VIVO });
  });

  it("con `servicioVivo: true` arma la ruta /vista/:id de esta neurona", () => {
    expect(elegirVista({ id: "at-7" }, true, false)).toEqual({
      tipo: "directo",
      url: `${BASE_SERVICIO_VIDEO}/vista/at-7`,
    });
  });

  it("sin render ni servicio, cae al póster", () => {
    expect(elegirVista({ poster: POSTER }, false, null)).toEqual({ tipo: "poster", url: POSTER });
  });

  it("sin nada que enseñar lo dice en español, sin URL", () => {
    const vista = elegirVista({}, null, null);
    expect(vista.tipo).toBe("vacio");
    expect(vista.url).toBeNull();
    expect(vista.motivo).toContain("póster");
  });

  it("lee el render y el póster de los valores de la molécula", () => {
    expect(elegirVista({ valores: { render: RENDER } }, null, null)).toEqual({ tipo: "render", url: RENDER });
    expect(elegirVista({ valores: { poster: POSTER } }, null, null)).toEqual({ tipo: "poster", url: POSTER });
  });

  it("es pura: no muta la entrada y repite la misma decisión", () => {
    const atomo: AtomoVideoHtml = { id: "at-1", valores: { video: RENDER }, poster: POSTER };
    const copia = structuredClone(atomo);
    expect(elegirVista(atomo, true, false)).toEqual(elegirVista(atomo, true, false));
    expect(atomo).toEqual(copia);
  });

  it("rechaza URLs peligrosas y no las pinta", () => {
    expect(urlSegura("javascript:alert(1)")).toBeNull();
    expect(urlSegura("//malo.ejemplo/video.mp4")).toBeNull();
    expect(urlSegura("data:text/html,<script>")).toBeNull();
    expect(elegirVista({ poster: "javascript:alert(1)" }, null, "javascript:alert(2)")).toEqual({
      tipo: "vacio",
      url: null,
      motivo: expect.stringContaining("póster"),
    });
  });
});

describe("correspondencia átomo video-html → vista", () => {
  it("reconoce el nombre estable y el herramientaId real del átomo", () => {
    expect(VISTAS_DE_ATOMO["video-html"]).toBe("video-html");
    expect(VISTAS_DE_ATOMO.hyperframes).toBe("video-html");
    expect(vistaDeAtomo({ herramientaId: "hyperframes" })).toBe("video-html");
    expect(vistaDeAtomo("video-html")).toBe("video-html");
  });

  it("no inventa vista para un átomo desconocido", () => {
    expect(vistaDeAtomo({ herramientaId: "sintetizador-web-audio" })).toBeNull();
  });
});
