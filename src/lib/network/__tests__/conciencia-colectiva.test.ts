import { describe, it, expect } from "vitest";
import {
  anonimizar,
  loteDeExperiencias,
  recibidasSinDuplicar,
  fusionarManifiestos,
  type ManifiestoAdaptador,
} from "../conciencia-colectiva";
import type { Experiencia } from "@/lib/astraura/experiencias";

describe("conciencia-colectiva - funciones puras", () => {
  it("anonimizar borra entrada si el dominio es chat o persona", () => {
    const eChat: Experiencia = {
      id: "1",
      t: "2026-09-20 03:00:00",
      medio: "os-web",
      capa: "needle",
      tipo: "intencion",
      dominio: "chat",
      entrada: "mensaje privado",
      salida: "respuesta",
      confianza: 0.9,
      ms: 10,
      resultado: true,
    };
    const ePersona: Experiencia = { ...eChat, id: "2", dominio: "persona" };
    const eOtro: Experiencia = { ...eChat, id: "3", dominio: "general" };

    expect(anonimizar(eChat).entrada).toBe("");
    expect(anonimizar(ePersona).entrada).toBe("");
    expect(anonimizar(eOtro).entrada).toBe("mensaje privado");
  });

  it("loteDeExperiencias filtra resultado conocido, anonimiza y recorta", () => {
    const exps: Experiencia[] = [
      {
        id: "1",
        t: "t1",
        medio: "os-web",
        capa: "needle",
        tipo: "intencion",
        dominio: "chat",
        entrada: "secreto 1",
        salida: "s1",
        confianza: 0.8,
        ms: 5,
        resultado: true,
      },
      {
        id: "2",
        t: "t2",
        medio: "os-web",
        capa: "needle",
        tipo: "intencion",
        dominio: "general",
        entrada: "publico",
        salida: "s2",
        confianza: 0.8,
        ms: 5,
        resultado: null,
      },
      {
        id: "3",
        t: "t3",
        medio: "os-web",
        capa: "needle",
        tipo: "intencion",
        dominio: "persona",
        entrada: "secreto 2",
        salida: "s3",
        confianza: 0.9,
        ms: 5,
        resultado: false,
      },
    ];

    const lote = loteDeExperiencias(exps, 1);
    expect(lote).toHaveLength(1);
    expect(lote[0].id).toBe("1");
    expect(lote[0].entrada).toBe("");

    const loteCompleto = loteDeExperiencias(exps, 10);
    expect(loteCompleto).toHaveLength(2);
    expect(loteCompleto.map((x) => x.id)).toEqual(["1", "3"]);
    expect(loteCompleto[1].entrada).toBe("");
  });

  it("recibidasSinDuplicar ignora elementos ya conocidos o duplicados", () => {
    const e1 = { id: "a" } as Experiencia;
    const e2 = { id: "b" } as Experiencia;
    const e3 = { id: "c" } as Experiencia;

    const mias = [e1];
    const ajenas = [e1, e2, e2, e3];

    const unicas = recibidasSinDuplicar(mias, ajenas);
    expect(unicas.map((x) => x.id)).toEqual(["b", "c"]);
  });

  it("fusionarManifiestos selecciona el manifiesto ganador", () => {
    const base: ManifiestoAdaptador = {
      actual: "v1",
      sha: "sha1",
      t: 100,
      experiencias: 10,
      exactitud_dorado: 0.8,
      base: "needle3",
    };

    // Sin mio previo
    const f1 = fusionarManifiestos(null, base);
    expect(f1.sha).toBe("sha1");
    expect(f1.pendienteDescarga).toBe(true);

    // Mismo SHA -> se conserva mio
    const fMismo = fusionarManifiestos(base, { ...base });
    expect(fMismo).toBe(base);

    // Ajeno más nuevo y mejor exactitud -> gana ajeno
    const mejorAjeno: ManifiestoAdaptador = {
      ...base,
      actual: "v2",
      sha: "sha2",
      t: 200,
      exactitud_dorado: 0.9,
    };
    const f2 = fusionarManifiestos(base, mejorAjeno);
    expect(f2.sha).toBe("sha2");
    expect(f2.pendienteDescarga).toBe(true);

    // Ajeno más viejo / peor exactitud -> se conserva mio
    const peorAjeno: ManifiestoAdaptador = {
      ...base,
      actual: "v0",
      sha: "sha0",
      t: 50,
      exactitud_dorado: 0.7,
    };
    const f3 = fusionarManifiestos(base, peorAjeno);
    expect(f3).toBe(base);

    // Empate en tiempo y exactitud -> decide sha mayor
    const empateMenorSha: ManifiestoAdaptador = {
      ...base,
      sha: "sha0",
    };
    expect(fusionarManifiestos(base, empateMenorSha)).toBe(base);

    const empateMayorSha: ManifiestoAdaptador = {
      ...base,
      sha: "sha2",
    };
    const fEmpate = fusionarManifiestos(base, empateMayorSha);
    expect(fEmpate.sha).toBe("sha2");
    expect(fEmpate.pendienteDescarga).toBe(true);
  });
});
