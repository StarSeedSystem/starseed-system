import { describe, it, expect } from 'vitest';
import { ajustesEfectivos } from '@/lib/cerebros/ajustes';
import type { AjustesCerebro, AjustesObjetivo } from '@/lib/cerebros/ajustes';

describe('ajustesEfectivos', () => {
  it("devuelve el cerebro si objetivo es cerebro", () => {
    const ajustes: AjustesCerebro = {
      cerebro: { privacidad: "privado", cifradoLocal: false, medios: { capacidades: {}, almacenamiento: [] }, sync: { direccion: "ambas", auto: true, destinos: [] }, acceso: [] },
      memorias: {},
      carpetas: {},
    };
    expect(ajustesEfectivos(ajustes, "cerebro").privacidad).toBe("privado");
  });

  it("hereda del cerebro y sobrescribe con memoria", () => {
    const ajustes: AjustesCerebro = {
      cerebro: { privacidad: "privado", cifradoLocal: false, medios: { capacidades: {}, almacenamiento: ["local"] }, sync: { direccion: "ambas", auto: true, destinos: [] }, acceso: [] },
      memorias: { "m1.md": { privacidad: "grupo" } },
      carpetas: {},
    };
    const eff = ajustesEfectivos(ajustes, "m1.md");
    expect(eff.privacidad).toBe("grupo");
    expect(eff.medios.almacenamiento).toContain("local");
  });
});