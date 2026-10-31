import { describe, expect, it } from "vitest";
import { VISTA_POR_ATOMO, datosDe, elegirVista, conRender, soloPoster, type DatosVideo } from "../atomos/vista-video-html";

describe("el atomo video-html de contrato va a la vista video-html", () => {
  it("asocia video-html con la vista video-html", () => {
    expect(VISTA_POR_ATOMO["video-html"]).toBe("video-html");
  });
});

describe("su herramientaId registrado (hyperframes) manda a la misma vista", () => {
  it("asocia hyperframes con la vista video-html", () => {
    expect(VISTA_POR_ATOMO["hyperframes"]).toBe("video-html");
  });
});

describe("atomos ajenos no tienen vista propia en el bloque", () => {
  it("escena3d no tiene vista definida", () => {
    expect(VISTA_POR_ATOMO["escena3d"]).toBeUndefined();
  });
});

describe("trae el poster y el render cuando son cadenas seguras", () => {
  it("normaliza poster y render validos", () => {
    expect(datosDe({ poster: "https://media/post.png", render: "https://media/v.mp4" })).toEqual({
      poster: "https://media/post.png",
      render: "https://media/v.mp4",
    });
  });
});

describe("acepta rutas propias e imagenes en data:", () => {
  it("acepta rutas relativas y data URLs", () => {
    expect(datosDe({ poster: "/media/post.png", render: "data:image/png;base64,AAA" }).poster).toBe("/media/post.png");
    expect(datosDe({ render: "data:image/png;base64,AAA" }).render).toBe("data:image/png;base64,AAA");
  });
});

describe("rechaza lo que no es URL segura", () => {
  it("descarta javascript y tags invalidos", () => {
    expect(datosDe({ poster: "javascript:alert(1)" }).poster).toBeNull();
    expect(datosDe({ render: "<script>" }).render).toBeNull();
    expect(datosDe({ poster: 42, render: null, renderHecho: true }).render).toBeNull();
    expect(datosDe({}).poster).toBeNull();
  });
});

describe("no muta la entrada", () => {
  it("datosDe no modifica el objeto original", () => {
    const valores = { poster: "/p.png" };
    datosDe(valores);
    expect(valores).toEqual({ poster: "/p.png" });
  });
});

describe("el render terminado manda: se ve el video ya hecho", () => {
  it("prioriza render cuando existe", () => {
    expect(elegirVista(conRender(), false, true)).toBe("render");
  });
});

describe("sin render acabado, un servicio vivo da la vista previa en vivo", () => {
  it("usa vivo cuando hay servicio activo sin render", () => {
    expect(elegirVista(soloPoster(), true, false)).toBe("vivo");
  });
});

describe("el render sigue mandando aunque también haya servicio vivo", () => {
  it("prioriza render sobre servicio", () => {
    expect(elegirVista(conRender(), true, true)).toBe("render");
  });
});

describe("sin render y sin servicio, con poster se ve el poster", () => {
  it("usa poster cuando no hay servicio ni render", () => {
    expect(elegirVista(soloPoster(), false, false)).toBe("poster");
  });
});

describe("sin nada se ve vacio", () => {
  it("devuelve vacio con datos nulos y sin servicio", () => {
    expect(elegirVista({ poster: null, render: null }, false, false)).toBe("vacio");
    expect(elegirVista(null, false, false)).toBe("vacio");
  });
});

describe("renderHecho sin URL de render no afirma: cae al poster o al vivo", () => {
  it("usa poster cuando renderHecho=true y hay poster", () => {
    expect(elegirVista(soloPoster(), false, true)).toBe("poster");
  });
  it("usa vivo cuando renderHecho=true sin poster ni render pero con servicio", () => {
    expect(elegirVista({ poster: null, render: null }, true, true)).toBe("vivo");
  });
});

describe("misma entrada, misma salida; la entrada no se muta", () => {
  it("elegirVista es deterministico y no muta la entrada", () => {
    const a = soloPoster();
    expect(elegirVista(a, false, false)).toBe(elegirVista(a, false, false));
    expect(a).toEqual({ poster: "/media/p.png", render: null });
  });
});

describe("casos de texto", () => {
  const casos: Array<[DatosVideo | null, boolean, boolean, ReturnType<typeof elegirVista>]> = [
    [conRender("/p.png"), true, true, "render"],
    [conRender(), false, true, "render"],
    [soloPoster(), true, false, "vivo"],
    [soloPoster(), false, false, "poster"],
    [null, true, false, "vivo"],
  ];
  
  it("cubre casos de texto con tabla de verificacion", () => {
    for (const [atomo, servicio, hecho, esperado] of casos) {
      expect(elegirVista(atomo, servicio, hecho)).toBe(esperado);
    }
  });
});