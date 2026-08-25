/**
 * Tests de `vinculos-logic.ts` — toda lógica pura, sin red ni React.
 */
import { describe, expect, it } from "vitest";
import type { Vinculo } from "@/lib/astraura/genesis-types";
import {
  FORMULARIO_VINCULO_VACIO,
  TIPOS_VINCULO,
  describirVinculo,
  etiquetaTipoVinculo,
  fuerzaPct,
  ordenarVinculosPorFecha,
  resumirVinculos,
  solicitudDesdeFormulario,
  tonoTipoVinculo,
  validarFormularioVinculo,
  vinculoSeguro,
  vinculosDeSer,
  vinculosSeguros,
  type FormularioVinculo,
} from "../vinculos-logic";

/* ─────────────────────────── Tipo de vínculo ─────────────────────────── */

describe("TIPOS_VINCULO", () => {
  it("son exactamente los ocho tipos del contrato, en el orden en que Alex/el contrato los enumeró", () => {
    expect(TIPOS_VINCULO).toEqual(["mentor", "aprendiz", "pareja", "rival", "aliado", "delegacion", "supervision", "hermandad"]);
  });
});

describe("etiquetaTipoVinculo", () => {
  it("traduce los ocho tipos conocidos", () => {
    for (const t of TIPOS_VINCULO) {
      expect(etiquetaTipoVinculo(t).length).toBeGreaterThan(0);
    }
    expect(etiquetaTipoVinculo("mentor")).toBe("Mentor");
    expect(etiquetaTipoVinculo("hermandad")).toBe("Hermandad");
  });

  it("un tipo desconocido (backend futuro) se enseña tal cual, nunca se esconde", () => {
    expect(etiquetaTipoVinculo("tipo-nuevo-x")).toBe("tipo-nuevo-x");
  });
});

describe("tonoTipoVinculo", () => {
  it("cada uno de los ocho tipos conocidos tiene un tono propio, y son todos distintos entre sí", () => {
    const tonos = new Set(TIPOS_VINCULO.map(tonoTipoVinculo));
    expect(tonos.size).toBe(TIPOS_VINCULO.length);
  });

  it("un tipo desconocido cae a un tono neutro, nunca revienta", () => {
    expect(tonoTipoVinculo("tipo-nuevo-x")).toMatch(/border-white/);
  });
});

/* ─────────────────────────── Fuerza (0–1 → %) ─────────────────────────── */

describe("fuerzaPct", () => {
  it("convierte 0–1 a 0–100 redondeado", () => {
    expect(fuerzaPct(0)).toBe(0);
    expect(fuerzaPct(1)).toBe(100);
    expect(fuerzaPct(0.7)).toBe(70);
    expect(fuerzaPct(0.005)).toBe(1); // redondea, no trunca a 0
  });

  it("recorta fuera de rango, nunca revienta ni devuelve algo fuera de 0–100", () => {
    expect(fuerzaPct(-3)).toBe(0);
    expect(fuerzaPct(7)).toBe(100);
  });

  it("no-numérico (backend roto) ⇒ se trata como 0, nunca NaN", () => {
    expect(fuerzaPct(Number.NaN)).toBe(0);
  });
});

/* ─────────────────────────── Saneado de la lista ─────────────────────────── */

const base: Vinculo = {
  id: "v1", origenId: "s1", destinoId: "s2", tipo: "mentor", fuerza: 0.6, bidireccional: false, motivo: "le enseña astrofísica", creadoEn: 1000,
};

describe("vinculoSeguro", () => {
  it("un vínculo ya limpio pasa con sus valores intactos", () => {
    expect(vinculoSeguro(base)).toEqual(base);
  });

  it("fuerza fuera de 0–1 o no-numérica se recorta/sanea", () => {
    expect(vinculoSeguro({ ...base, fuerza: 5 }).fuerza).toBe(1);
    expect(vinculoSeguro({ ...base, fuerza: -1 }).fuerza).toBe(0);
    expect(vinculoSeguro({ ...base, fuerza: Number.NaN }).fuerza).toBe(0);
  });

  it("bidireccional ambiguo (no es literalmente `true`) ⇒ false, nunca un booleano regalado", () => {
    expect(vinculoSeguro({ ...base, bidireccional: 1 as unknown as boolean }).bidireccional).toBe(false);
  });

  it("motivo vacío/espacios ⇒ null; motivo real se recorta de espacios sobrantes", () => {
    expect(vinculoSeguro({ ...base, motivo: "   " }).motivo).toBeNull();
    expect(vinculoSeguro({ ...base, motivo: undefined }).motivo).toBeNull();
    expect(vinculoSeguro({ ...base, motivo: "  con espacios  " }).motivo).toBe("con espacios");
  });

  it("nunca toca id/origenId/destinoId/tipo/creadoEn — eso lo dice el backend, no esta función", () => {
    const v = vinculoSeguro({ ...base, tipo: "tipo-desconocido" as Vinculo["tipo"] });
    expect(v.tipo).toBe("tipo-desconocido");
    expect(v.id).toBe("v1");
    expect(v.creadoEn).toBe(1000);
  });
});

describe("vinculosSeguros", () => {
  it("forma inesperada (no-array) ⇒ lista vacía, nunca revienta", () => {
    expect(vinculosSeguros(null)).toEqual([]);
    expect(vinculosSeguros(undefined)).toEqual([]);
    expect(vinculosSeguros("no es una lista" as unknown as Vinculo[])).toEqual([]);
  });

  it("sanea cada entrada real", () => {
    const sucio = [{ ...base, fuerza: 9 }];
    expect(vinculosSeguros(sucio)[0].fuerza).toBe(1);
  });
});

describe("ordenarVinculosPorFecha", () => {
  it("más reciente primero", () => {
    const a = { ...base, id: "a", creadoEn: 100 };
    const b = { ...base, id: "b", creadoEn: 300 };
    const c = { ...base, id: "c", creadoEn: 200 };
    expect(ordenarVinculosPorFecha([a, b, c]).map((v) => v.id)).toEqual(["b", "c", "a"]);
  });

  it("no muta la lista original", () => {
    const lista = [{ ...base, id: "a", creadoEn: 1 }, { ...base, id: "b", creadoEn: 2 }];
    const copia = [...lista];
    ordenarVinculosPorFecha(lista);
    expect(lista).toEqual(copia);
  });

  it("creadoEn ausente/no-numérico se trata como el más antiguo, nunca revienta la comparación", () => {
    const sinFecha = { ...base, id: "x", creadoEn: undefined as unknown as number };
    const conFecha = { ...base, id: "y", creadoEn: 50 };
    expect(ordenarVinculosPorFecha([sinFecha, conFecha]).map((v) => v.id)).toEqual(["y", "x"]);
  });
});

describe("vinculosDeSer", () => {
  it("incluye tanto los que origina como los que recibe", () => {
    const v1 = { ...base, id: "v1", origenId: "s1", destinoId: "s2" };
    const v2 = { ...base, id: "v2", origenId: "s3", destinoId: "s1" };
    const v3 = { ...base, id: "v3", origenId: "s2", destinoId: "s3" };
    expect(vinculosDeSer([v1, v2, v3], "s1").map((v) => v.id)).toEqual(["v1", "v2"]);
  });
});

describe("resumirVinculos", () => {
  it("cuenta el total y los bidireccionales", () => {
    const lista = [{ ...base, bidireccional: true }, { ...base, id: "v2", bidireccional: false }];
    expect(resumirVinculos(lista)).toEqual({ total: 2, bidireccionales: 1 });
  });

  it("forma inesperada ⇒ ceros, nunca revienta", () => {
    expect(resumirVinculos(null)).toEqual({ total: 0, bidireccionales: 0 });
  });
});

describe("describirVinculo", () => {
  it("compone la frase con flecha simple cuando no es bidireccional", () => {
    expect(describirVinculo(base, "Ada", "Boro")).toBe("Ada → Boro · Mentor · fuerza 60% · le enseña astrofísica");
  });

  it("usa ↔ cuando es bidireccional", () => {
    expect(describirVinculo({ ...base, bidireccional: true }, "Ada", "Boro")).toContain("↔");
  });

  it("sin motivo, la frase termina en la fuerza — sin un '· ' colgando", () => {
    expect(describirVinculo({ ...base, motivo: null }, "Ada", "Boro")).toBe("Ada → Boro · Mentor · fuerza 60%");
  });
});

/* ─────────────────────────── Formulario de creación ─────────────────────────── */

describe("validarFormularioVinculo", () => {
  const valido: FormularioVinculo = { origenId: "s1", destinoId: "s2", tipo: "mentor", fuerza: 0.5, bidireccional: false, motivo: "" };

  it("un formulario válido no da error", () => {
    expect(validarFormularioVinculo(valido)).toBeNull();
  });

  it("el formulario vacío por defecto SIEMPRE es inválido (nunca se puede enviar en blanco)", () => {
    expect(validarFormularioVinculo(FORMULARIO_VINCULO_VACIO)).not.toBeNull();
  });

  it("exige origen y destino", () => {
    expect(validarFormularioVinculo({ ...valido, origenId: "" })).toMatch(/origina/);
    expect(validarFormularioVinculo({ ...valido, destinoId: "  " })).toMatch(/dirige/);
  });

  it("rechaza un vínculo de un ser consigo mismo", () => {
    expect(validarFormularioVinculo({ ...valido, destinoId: valido.origenId })).toMatch(/consigo mismo/);
  });

  it("rechaza un tipo fuera de los ocho del contrato", () => {
    expect(validarFormularioVinculo({ ...valido, tipo: "compañero-de-piso" })).toMatch(/tipo de vínculo/);
  });

  it("rechaza fuerza fuera de 0–1", () => {
    expect(validarFormularioVinculo({ ...valido, fuerza: 1.5 })).toMatch(/entre 0 y 1/);
    expect(validarFormularioVinculo({ ...valido, fuerza: -0.1 })).toMatch(/entre 0 y 1/);
    expect(validarFormularioVinculo({ ...valido, fuerza: Number.NaN })).toMatch(/entre 0 y 1/);
  });
});

describe("solicitudDesdeFormulario", () => {
  it("traduce el formulario válido al cuerpo exacto de SolicitudVinculo", () => {
    const f: FormularioVinculo = { origenId: "s1", destinoId: "s2", tipo: "aliado", fuerza: 0.8, bidireccional: true, motivo: "  se cubren la espalda  " };
    expect(solicitudDesdeFormulario(f)).toEqual({
      origenId: "s1", destinoId: "s2", tipo: "aliado", fuerza: 0.8, bidireccional: true, motivo: "se cubren la espalda",
    });
  });

  it("motivo vacío ⇒ null, no cadena vacía", () => {
    const f: FormularioVinculo = { origenId: "s1", destinoId: "s2", tipo: "rival", fuerza: 0.3, bidireccional: false, motivo: "   " };
    expect(solicitudDesdeFormulario(f).motivo).toBeNull();
  });

  it("recorta fuerza a 0–1 aunque el formulario traiga algo fuera de rango", () => {
    const f: FormularioVinculo = { origenId: "s1", destinoId: "s2", tipo: "rival", fuerza: 2, bidireccional: false, motivo: "" };
    expect(solicitudDesdeFormulario(f).fuerza).toBe(1);
  });
});
