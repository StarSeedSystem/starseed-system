import { describe, it, expect } from "vitest";
import {
  sugerirVariaciones,
  evaluarPruebasAdn,
  ESCALERA_LOCAL_PRIMERO,
  type AdnContexto,
  type CandidatoSugerido,
  type PeticionSugerencias,
} from "../sugerir-astraura";

const ADN: AdnContexto = {
  slug: "starseed-os",
  nombre: "StarSeed OS",
  pruebas: [
    { id: "p1", comprobacion: "acento 20-30%", auto: true },
    { id: "p7", comprobacion: "contraste >=4.5:1", auto: true },
    { id: "p6", comprobacion: "jugada rara 1 vez", auto: false },
  ],
};

const candidato = (extra: Partial<CandidatoSugerido> = {}): CandidatoSugerido => ({
  titulo: "Cristal cardinal",
  payload: { tokens: { accent: "var(--zenith)" } },
  licencia: "CC-BY-4.0",
  metricas: { acento_porcentaje: 25, contraste: 7 },
  ...extra,
});

function falso(candidatos: CandidatoSugerido[], visto?: PeticionSugerencias[]) {
  return async (peticion: PeticionSugerencias) => {
    visto?.push(peticion);
    return candidatos;
  };
}

const contexto = { payload: { tokens: { accent: "var(--zenith)" } } };

describe("sugerirVariaciones", () => {
  it("pide 3 variaciones con la escalera local primero y solo devuelve las que pasan", async () => {
    const visto: PeticionSugerencias[] = [];
    const resultado = await sugerirVariaciones(
      "widget:clima",
      contexto,
      {
        adn: ADN,
        enrutador: falso(
          [
            candidato(),
            candidato({ titulo: "Fuera de paleta", metricas: { acento_porcentaje: 50, contraste: 7 } }),
            candidato({ titulo: "Esmeralda", payload: { tokens: { accent: "var(--horizonte)" } } }),
          ],
          visto,
        ),
      },
    );
    expect(visto[0].cuantas).toBe(3);
    expect(visto[0].gratisPrimero).toBe(true);
    expect(visto[0].escalera).toEqual([...ESCALERA_LOCAL_PRIMERO]);
    expect(resultado.variaciones.map((v) => v.titulo)).toEqual(["Cristal cardinal", "Esmeralda"]);
    expect(resultado.variaciones[0].motivo).toContain("ADN starseed-os: p1, p7");
    expect(resultado.descartadas[0].motivos[0]).toContain("ADN p1");
  });

  it("no llama a Astraura si la clave o el contexto no valen", async () => {
    let llamadas = 0;
    const enrutador = falso([candidato()], undefined);
    const contar = async (p: PeticionSugerencias) => { llamadas += 1; return enrutador(p); };
    const claveMala = await sugerirVariaciones("Clave Invalida", contexto, { enrutador: contar });
    const contextoPrivado = await sugerirVariaciones("widget:clima", { payload: { "starseed.dock.items.v2": [] } }, { enrutador: contar });
    expect(claveMala.error).toContain("Clave");
    expect(contextoPrivado.error).toContain("Contexto");
    expect(llamadas).toBe(0);
  });

  it("descarta secretos, fichas con token y variaciones sin licencia", async () => {
    const resultado = await sugerirVariaciones("widget:clima", contexto, {
      enrutador: falso([
        candidato({ titulo: "Con secreto", payload: { token: "sk-fake123def456ghi789" } }),
        candidato({ titulo: "Sin licencia", licencia: undefined }),
        candidato({ titulo: "Con nota filtrada", descripcion: "Bearer abcdefgh12345" }),
      ]),
    });
    expect(resultado.variaciones).toHaveLength(0);
    expect(resultado.descartadas).toHaveLength(3);
    expect(resultado.descartadas[0].motivos.join(" ")).toContain("Privacidad");
    expect(resultado.descartadas[1].motivos.join(" ")).toContain("Licencia");
    expect(resultado.descartadas[2].motivos.join(" ")).toContain("token");
  });

  it("marca como aislada una variación de código", async () => {
    const resultado = await sugerirVariaciones("atomo:video-html", contexto, {
      enrutador: falso([candidato({ payload: { html: "<p>hola</p>" } })]),
    });
    expect(resultado.variaciones[0].requiereAislamiento).toBe(true);
    expect(resultado.variaciones[0].motivo).toContain("código aislado");
  });

  it("no se rompe si el enrutador falla o no devuelve una lista", async () => {
    const caido = await sugerirVariaciones("widget:clima", contexto, {
      enrutador: async () => { throw new Error("429 Too Many Requests"); },
    });
    const raro = await sugerirVariaciones("widget:clima", contexto, {
      enrutador: async () => null as unknown as CandidatoSugerido[],
    });
    expect(caido.disponible).toBe(false);
    expect(caido.error).toContain("429");
    expect(raro.disponible).toBe(false);
    expect(raro.variaciones).toHaveLength(0);
  });
});
describe("evaluarPruebasAdn", () => {
  it("mide, suspende y no inventa veredicto cuando falta la métrica o la prueba es manual", () => {
    const veredictos = evaluarPruebasAdn(ADN.pruebas ?? [], { acento_porcentaje: 50 });
    expect(veredictos.find((v) => v.id === "p1")?.estado).toBe("suspenso");
    expect(veredictos.find((v) => v.id === "p7")?.estado).toBe("sin-medir");
    expect(veredictos.find((v) => v.id === "p6")?.estado).toBe("sin-medir");
    const aprobado = evaluarPruebasAdn(ADN.pruebas ?? [], { acento_porcentaje: 25, contraste: 4.5 });
    expect(aprobado.filter((v) => v.estado === "aprobado").map((v) => v.id)).toEqual(["p1", "p7"]);
  });
});
