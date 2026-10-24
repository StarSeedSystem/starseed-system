import { describe, it, expect } from "vitest";
import {
  sugerirVariaciones,
  type AdnContexto,
  type ContextoVariacion,
  type PeticionSugerencias,
  type VariacionSugerida,
} from "../sugerir-astraura";

const adn: AdnContexto = {
  meta: { slug: "astraura" },
  pruebas: [
    { id: "p1", comprobacion: "acento cian <15%", auto: true },
    { id: "p2", comprobacion: "contraste >=4.5:1", auto: true },
    { id: "p3", comprobacion: "jugada rara 1 vez", auto: false },
  ],
};
const capturado = { paleta: [{ rol: "acento", cobertura: 10 }, { rol: "shell", cobertura: 60 }], contraste: 5 };
const contexto = (extra: Partial<ContextoVariacion> = {}): ContextoVariacion => ({ payload: capturado, adn, ...extra });
const v = (titulo: string, payload: unknown, via: VariacionSugerida["via"] = "local"): VariacionSugerida => ({ titulo, payload, via });

function enrutadorFalso(respuesta: VariacionSugerida[] | Error, anota?: PeticionSugerencias[]) {
  return async (peticion: PeticionSugerencias) => {
    anota?.push(peticion);
    if (respuesta instanceof Error) throw respuesta;
    return respuesta;
  };
}

describe("sugerirVariaciones", () => {
  it("pide 3 variaciones locales primero con el payload capturado y devuelve solo las que pasan, con su motivo", async () => {
    const peticiones: PeticionSugerencias[] = [];
    const r = await sugerirVariaciones("widget:clima", contexto(), {
      enrutador: enrutadorFalso([
        v("Cian sereno", { contraste: 6 }),
        v("Token filtrado", { token: "sk-abcdefghijklmnop" }),
        v("Cian saturado", { paleta: [{ rol: "acento", cobertura: 40 }] }),
      ], peticiones),
    });
    expect(peticiones).toEqual([{ clave: "widget:clima", familia: "widget", payload: capturado, cuantas: 3, localPrimero: true }]);
    expect(r.variaciones).toHaveLength(1);
    expect(r.variaciones[0]).toMatchObject({ titulo: "Cian sereno", via: "local", requiereAislamiento: false });
    expect(r.variaciones[0].motivo).toContain("Local primero");
    expect(r.variaciones[0].motivo).toContain("2 pruebas del ADN");
    expect(r.variaciones[0].motivo).toContain("1 manuales");
  });

  it("descarta secretos, claves privadas y URLs que no son https", async () => {
    const r = await sugerirVariaciones("widget:clima", contexto(), {
      enrutador: enrutadorFalso([
        v("Privada", { clave: "starseed.memoria" }),
        v("Insegura", { enlace: "http://ejemplo.com" }),
        v("JWT", { sesion: "eyJhbGciOiJIUzI1NiJ9.abcdefghijklmnop" }),
      ]),
    });
    expect(r.variaciones).toEqual([]);
    expect(r.motivo).toContain("ninguna");
  });

  it("ordena local, malla y nube y no devuelve más de tres", async () => {
    const r = await sugerirVariaciones("widget:clima", contexto(), {
      enrutador: enrutadorFalso([
        v("Nube", { contraste: 5 }, "nube"),
        v("Local A", { contraste: 5 }, "local"),
        v("Malla", { contraste: 5 }, "malla"),
        v("Local B", { contraste: 5 }, "local"),
      ]),
    });
    expect(r.variaciones.map((x) => x.titulo)).toEqual(["Local A", "Local B", "Malla"]);
  });

  it("fusiona el payload capturado con la variación antes de medir el ADN", async () => {
    const adnFondo: AdnContexto = { pruebas: [{ id: "p1", comprobacion: "fondo >40%", auto: true }] };
    const r = await sugerirVariaciones(
      "tema:aurora",
      { payload: { paleta: [{ rol: "fondo", cobertura: 60 }] }, adn: adnFondo },
      { enrutador: enrutadorFalso([v("Más contraste", { contraste: 7 })]) },
    );
    expect(r.variaciones).toHaveLength(1);
  });

  it("una prueba automática desconocida no deja pasar nada (fail closed)", async () => {
    const r = await sugerirVariaciones("widget:clima", contexto({ adn: { pruebas: [{ id: "px", comprobacion: "brilla bonito", auto: true }] } }), {
      enrutador: enrutadorFalso([v("Brillante", { contraste: 5 })]),
    });
    expect(r.variaciones).toEqual([]);
  });

  it("las pruebas manuales no bloquean y se anuncian en el motivo", async () => {
    const r = await sugerirVariaciones("widget:clima", contexto({ adn: { pruebas: [{ id: "pm", comprobacion: "se ve bien", auto: false }] } }), {
      enrutador: enrutadorFalso([v("A ojo", { contraste: 5 })]),
    });
    expect(r.variaciones).toHaveLength(1);
    expect(r.variaciones[0].motivo).toContain("sin pruebas automáticas de ADN");
    expect(r.variaciones[0].motivo).toContain("1 manuales");
  });

  it("marca el código para abrirse aislado", async () => {
    const r = await sugerirVariaciones("atomo:video-html", contexto({ payload: {}, codigo: true }), {
      enrutador: enrutadorFalso([v("HTML seguro", { html: "<p>hola</p>" })]),
    });
    expect(r.variaciones[0]).toMatchObject({ requiereAislamiento: true });
    expect(r.variaciones[0].motivo).toContain("código aislado");
  });

  it("no consulta con una clave inválida y no rompe si Astraura falla o no devuelve una lista", async () => {
    let llamado = false;
    const enrutador = async () => { llamado = true; return []; };
    expect((await sugerirVariaciones("widget", contexto(), { enrutador })).variaciones).toEqual([]);
    expect(llamado).toBe(false);
    const caido = await sugerirVariaciones("widget:clima", contexto(), { enrutador: enrutadorFalso(new Error("429")) });
    expect(caido.variaciones).toEqual([]);
    expect(caido.motivo).toContain("Astraura");
    const raro = await sugerirVariaciones("widget:clima", contexto(), { enrutador: enrutadorFalso({} as unknown as VariacionSugerida[]) });
    expect(raro.variaciones).toEqual([]);
  });

  it("descarta títulos vacíos o demasiado largos", async () => {
    const r = await sugerirVariaciones("widget:clima", contexto(), {
      enrutador: enrutadorFalso([v("   ", { contraste: 5 }), v("x".repeat(201), { contraste: 5 })]),
    });
    expect(r.variaciones).toEqual([]);
  });
});
