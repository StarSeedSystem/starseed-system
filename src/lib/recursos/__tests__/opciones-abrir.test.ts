import { describe, it, expect } from "vitest";
import type { OfertaNeurona } from "../oferta";
import { opcionesAbrir, comoAbrir, type AppAbrir } from "../opciones-abrir";

/** Oferta completa por defecto: presta de todo a la cuenta PROPIA, cargando y libre. */
function oferta(parches: Partial<OfertaNeurona> = {}): OfertaNeurona {
  return {
    nodoId: "neurona-x",
    cuentaId: "c-propia",
    medio: "neurona",
    computo: { nucleos: 4, ramLibreMb: 4096, gpu: false, motores: [] },
    almacen: { prestaMb: 1024, volumenes: [] },
    apps: [{ id: "pizarra", version: "1.0" }],
    enlaces: {},
    energia: { bateriaPct: 80, cargando: true, enUso: false },
    presta: {
      cuenta: true,
      grupos: [],
      publico: false,
      topes: { cpuPct: 100, ramMb: 4096, discoMb: 1024, soloCargando: false },
    },
    t: Date.parse("2026-10-17T10:00:00Z"),
    ...parches,
  };
}

const PROPIA = { nodoId: "propia-1", nucleos: 8, ramLibreMb: 8192 };
const APP_SIMPLE: AppAbrir = { id: "pizarra", nombre: "Pizarra" };

describe("opciones-abrir.ts", () => {
  describe("comoAbrir (contrato §5)", () => {
    it("app sencilla con recursos: local, cumple", () => {
      const r = comoAbrir(APP_SIMPLE, { nucleos: 8, ramLibreMb: 8192 }, false);
      expect(r).toEqual({ modo: "local", motivo: "Esta neurona cumple lo que la app pide" });
    });

    it("app pesada: por-bandas, solo lo que se abre", () => {
      const r = comoAbrir({ ...APP_SIMPLE, pesada: true }, { nucleos: 1, ramLibreMb: 512 }, false);
      expect(r.modo).toBe("por-bandas");
      expect(r.motivo).toContain("verificada");
    });

    it("app nativa: montada, conserva permisos y firma", () => {
      const r = comoAbrir({ ...APP_SIMPLE, nativa: true }, { nucleos: 8, ramLibreMb: 8192 }, false);
      expect(r.modo).toBe("montada");
      expect(r.motivo).toContain("permisos");
    });

    it("faltan recursos y hay vecinos: ramificada y nombra lo que falta", () => {
      const r = comoAbrir({ ...APP_SIMPLE, minNucleos: 10, minRamMb: 9000 }, { nucleos: 8, ramLibreMb: 8192 }, true);
      expect(r.modo).toBe("ramificada");
      expect(r.motivo).toContain("2 núcleos");
      expect(r.motivo).toContain("808 MB de RAM");
    });

    it("faltan recursos sin vecinos: suelo de §4, se abre lo que se pueda", () => {
      const r = comoAbrir({ ...APP_SIMPLE, minNucleos: 10 }, { nucleos: 8, ramLibreMb: 8192 }, false);
      expect(r.modo).toBe("local");
      expect(r.motivo).toContain("Se abre lo que se pueda");
      expect(r.motivo).toContain("2 núcleos");
    });
  });

  describe("opcionesAbrir (menú «Abrir en…»)", () => {
    it("«Aquí» va primero, siempre disponible, con su modo según la app", () => {
      const opciones = opcionesAbrir(APP_SIMPLE, [], PROPIA);
      expect(opciones.length).toBe(1);
      const aqui = opciones[0];
      expect(aqui.etiqueta).toBe("Aquí");
      expect(aqui.modo).toBe("local");
      expect(aqui.destino).toBe("propia-1");
      expect(aqui.disponible).toBe(true);
      const pesada = opcionesAbrir({ ...APP_SIMPLE, pesada: true }, [], PROPIA)[0];
      expect(pesada.modo).toBe("por-bandas");
    });

    it("una neurona que tiene la app aparece como «Transmitida desde…» disponible", () => {
      const opciones = opcionesAbrir(APP_SIMPLE, [oferta()], PROPIA);
      expect(opciones.length).toBe(2);
      const vecina = opciones[1];
      expect(vecina.etiqueta).toBe("Transmitida desde neurona-x");
      expect(vecina.modo).toBe("transmitida");
      expect(vecina.destino).toBe("neurona-x");
      expect(vecina.disponible).toBe(true);
      expect(vecina.motivo).toContain("presta");
      expect(vecina.motivo).toContain("núcleos");
    });

    it("un servidor del grupo se etiqueta distinto y va antes que las neuronas", () => {
      const opciones = opcionesAbrir(APP_SIMPLE, [
        oferta({ nodoId: "vecina-a" }),
        oferta({ nodoId: "srv-1", medio: "servidor" }),
      ], PROPIA);
      expect(opciones.map((o) => o.etiqueta)).toEqual([
        "Aquí",
        "En el servidor del grupo",
        "Transmitida desde vecina-a",
      ]);
      expect(opciones[1].destino).toBe("srv-1");
    });

    it("sin recursos aquí, el modo de «Aquí» pasa a ramificada y nombra a la red", () => {
      const opciones = opcionesAbrir(
        { ...APP_SIMPLE, minNucleos: 10 },
        [oferta({ nodoId: "ayudante" })],
        PROPIA
      );
      expect(opciones[0].modo).toBe("ramificada");
      expect(opciones[0].motivo).toContain("reparte");
    });

    it("vecina con la app pero sin préstamo: aparece no disponible y dice por qué", () => {
      const casos: { parches: Partial<OfertaNeurona>; motivo: string }[] = [
        { parches: { energia: { bateriaPct: 15, cargando: false, enUso: false } }, motivo: "batería" },
        { parches: { energia: { bateriaPct: 90, cargando: false, enUso: true } }, motivo: "usando la neurona" },
        {
          parches: {
            presta: {
              cuenta: true, grupos: [], publico: false,
              topes: { cpuPct: 100, ramMb: 4096, discoMb: 1024, soloCargando: true },
            },
            energia: { bateriaPct: 90, cargando: false, enUso: false },
          },
          motivo: "cargando",
        },
      ];
      for (const { parches, motivo } of casos) {
        const opciones = opcionesAbrir(APP_SIMPLE, [oferta(parches)], PROPIA);
        expect(opciones.length).toBe(2);
        expect(opciones[1].disponible).toBe(false);
        expect(opciones[1].motivo).toContain("no presta ahora");
        expect(opciones[1].motivo).toContain(motivo);
      }
    });

    it("neuronas que no tienen la app no aparecen", () => {
      const opciones = opcionesAbrir(APP_SIMPLE, [
        oferta({ nodoId: "sin-app", apps: [{ id: "otra", version: "2.0" }] }),
        oferta({ nodoId: "con-app" }),
      ], PROPIA);
      expect(opciones.map((o) => o.destino)).toEqual(["propia-1", "con-app"]);
    });
  });
});
