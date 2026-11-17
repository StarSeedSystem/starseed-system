// Proveedor sin filtros de la nube: tabla contexto × caso × interruptor × disponibilidad × clave.
import { describe, expect, it } from "vitest";
import { CASOS_SIN_FILTROS, type ContextoUso } from "../recomendar";
import { CASOS, type CasoUso } from "../tipos";
import { PROVEEDORES_SIN_FILTROS_NUBE, proveedorEsSinFiltros, proveedorSinFiltrosPermitido } from "../sin-filtros-nube";

describe("PROVEEDORES_SIN_FILTROS_NUBE", () => {
  it("lista cerrada con solo 'abliteration'", () => {
    expect(PROVEEDORES_SIN_FILTROS_NUBE).toEqual(["abliteration"]);
    expect(PROVEEDORES_SIN_FILTROS_NUBE).toHaveLength(1);
  });
});

describe("proveedorEsSinFiltros", () => {
  it("true para 'abliteration', false para cualquier otro", () => {
    expect(proveedorEsSinFiltros("abliteration")).toBe(true);
    expect(proveedorEsSinFiltros("openrouter")).toBe(false);
    expect(proveedorEsSinFiltros("nim")).toBe(false);
    expect(proveedorEsSinFiltros("")).toBe(false);
  });
});

describe("proveedorSinFiltrosPermitido: tabla completa contexto × caso × interruptor × disponibilidad × clave", () => {
  const base = {
    activado: true,
    disponible: true,
    caso: "conversacion" as CasoUso,
    contexto: "privado-propio" as ContextoUso,
    claveDeLaCuenta: true,
  };

  const CASOS_PERMITIDOS: CasoUso[] = [...CASOS_SIN_FILTROS];
  const CASOS_DENEGADOS: CasoUso[] = CASOS.filter((c) => !CASOS_SIN_FILTROS.has(c));
  const CONTEXTOS: ContextoUso[] = ["privado-propio", "compartido", "publico", "segundo-plano", "malla-ajena"];

  it("caso por defecto (sin declarar contexto) niega: se trata como 'compartido'", () => {
    const r = proveedorSinFiltrosPermitido({ ...base, contexto: undefined });
    expect(r.permitido).toBe(false);
    expect(r.aviso).toMatch(/bots, dots o asistentes de grupo/);
  });

  it("perfil no disponible niega (comprobado antes que el interruptor, como en aplicarEleccionManual)", () => {
    for (const caso of CASOS) {
      for (const ctx of CONTEXTOS) {
        for (const act of [true, false]) {
          for (const clave of [true, false]) {
            const r = proveedorSinFiltrosPermitido({ ...base, disponible: false, activado: act, caso, contexto: ctx, claveDeLaCuenta: clave });
            expect(r.permitido, `!disp · ${act} · ${caso} · ${ctx} · clave=${clave}`).toBe(false);
            expect(r.aviso).toMatch(/no están disponibles en este perfil/);
          }
        }
      }
    }
  });

  it("interruptor apagado niega (cuando disponible=true)", () => {
    for (const caso of CASOS) {
      for (const ctx of CONTEXTOS) {
        for (const clave of [true, false]) {
          const r = proveedorSinFiltrosPermitido({ ...base, activado: false, disponible: true, caso, contexto: ctx, claveDeLaCuenta: clave });
          expect(r.permitido, `apagado · ${caso} · ${ctx} · clave=${clave}`).toBe(false);
          expect(r.aviso).toMatch(/apagado/);
          expect(r.aviso).not.toMatch(/\n/);
        }
      }
    }
  });

  it("contexto distinto de 'privado-propio' niega (cuando disponible=true y activado=true)", () => {
    for (const caso of CASOS) {
      for (const ctx of ["compartido", "publico", "segundo-plano"] as ContextoUso[]) {
        const r = proveedorSinFiltrosPermitido({ ...base, activado: true, disponible: true, caso, contexto: ctx, claveDeLaCuenta: true });
        expect(r.permitido, `${ctx} · ${caso}`).toBe(false);
        expect(r.aviso).toMatch(/solo se usan en/);
      }
    }
  });

  it("bots, dots y asistentes de grupo ('compartido') niegan siempre", () => {
    for (const caso of CASOS) {
      const r = proveedorSinFiltrosPermitido({ ...base, contexto: "compartido", caso });
      expect(r.permitido, `compartido · ${caso}`).toBe(false);
      expect(r.aviso).toMatch(/bots, dots o asistentes de grupo/);
    }
  });

  it("caso fuera de CASOS_SIN_FILTROS niega aunque contexto sea privado", () => {
    for (const caso of CASOS_DENEGADOS) {
      const r = proveedorSinFiltrosPermitido({ ...base, contexto: "privado-propio", caso });
      expect(r.permitido, caso).toBe(false);
      expect(r.aviso).toMatch(/habla con otras personas o corre sin ti delante/);
    }
    expect(CASOS_DENEGADOS.sort()).toEqual(["bots-dots", "capas-conciencia", "segundo-plano", "voz"]);
  });

  it("cuenta sin clave propia niega", () => {
    for (const caso of CASOS_PERMITIDOS) {
      const r = proveedorSinFiltrosPermitido({ ...base, claveDeLaCuenta: false, caso });
      expect(r.permitido, `sin clave · ${caso}`).toBe(false);
      expect(r.aviso).toMatch(/propia clave/);
    }
  });

  it("contexto 'malla-ajena' niega explícitamente (nunca se sirve a otra cuenta)", () => {
    for (const caso of CASOS_PERMITIDOS) {
      const r = proveedorSinFiltrosPermitido({ ...base, contexto: "malla-ajena", caso });
      expect(r.permitido, `malla-ajena · ${caso}`).toBe(false);
      expect(r.aviso).toMatch(/nunca se sirve a otra cuenta por la malla/);
    }
  });

  it("permitido: interruptor encendido + disponible + contexto privado + caso permitido + clave propia", () => {
    for (const caso of CASOS_PERMITIDOS) {
      const r = proveedorSinFiltrosPermitido({ ...base, caso });
      expect(r.permitido, caso).toBe(true);
      expect(r.aviso).toBeNull();
    }
    expect(CASOS_PERMITIDOS.sort()).toEqual(["archivos-privados", "codigo-agentes", "conversacion", "vision"]);
  });

  it("cada negativa trae UNA línea en español sin saltos de línea", () => {
    const combinaciones = [
      { activado: false, disponible: true, contexto: "privado-propio" as ContextoUso, caso: "conversacion" as CasoUso, claveDeLaCuenta: true },
      { activado: true, disponible: false, contexto: "privado-propio" as ContextoUso, caso: "conversacion" as CasoUso, claveDeLaCuenta: true },
      { activado: true, disponible: true, contexto: "compartido" as ContextoUso, caso: "conversacion" as CasoUso, claveDeLaCuenta: true },
      { activado: true, disponible: true, contexto: "privado-propio" as ContextoUso, caso: "voz" as CasoUso, claveDeLaCuenta: true },
      { activado: true, disponible: true, contexto: "privado-propio" as ContextoUso, caso: "conversacion" as CasoUso, claveDeLaCuenta: false },
      { activado: true, disponible: true, contexto: "malla-ajena" as ContextoUso, caso: "conversacion" as CasoUso, claveDeLaCuenta: true },
    ];
    for (const c of combinaciones) {
      const r = proveedorSinFiltrosPermitido(c);
      expect(r.permitido).toBe(false);
      expect(r.aviso).toBeTruthy();
      expect(r.aviso).not.toMatch(/\n/);
      expect(r.aviso?.length).toBeGreaterThan(10);
    }
  });

  it("PROPIEDAD: en toda combinación, solo se permite si TODAS las reglas se cumplen", () => {
    let permitidas = 0;
    for (const activado of [false, true]) {
      for (const disponible of [false, true]) {
        for (const contexto of CONTEXTOS) {
          for (const caso of CASOS) {
            for (const claveDeLaCuenta of [false, true]) {
              const r = proveedorSinFiltrosPermitido({ activado, disponible, contexto, caso, claveDeLaCuenta });
              const debePermitir = activado && disponible && contexto === "privado-propio" && CASOS_SIN_FILTROS.has(caso) && claveDeLaCuenta;
              if (debePermitir) {
                expect(r.permitido, `${contexto} · ${caso} · act=${activado} · disp=${disponible} · clave=${claveDeLaCuenta}`).toBe(true);
                expect(r.aviso).toBeNull();
                permitidas++;
              } else {
                expect(r.permitido, `${contexto} · ${caso} · act=${activado} · disp=${disponible} · clave=${claveDeLaCuenta}`).toBe(false);
                expect(r.aviso).toBeTruthy();
              }
            }
          }
        }
      }
    }
    expect(permitidas).toBeGreaterThan(0);
  });
});