import { 
  leerConfort, guardarConfort,
  leerCalidad, guardarCalidad,
  leerVinculos, guardarVinculos,
  leerModo, guardarModo,
  sistemaDelNavegador
} from "../prefs-xr";
import { PreferenciasConfort, CONFORT_DEFECTO, sanearConfort } from "../../../../lib/xr/confort";
import { NivelCalidad, ModoXR, EntradaXR } from "../../../../lib/xr/tipos";
import { describe, it, expect, beforeEach } from "vitest";
import type { MapaEntrada } from "../../../../lib/xr/vinculos-xr";
import * as vinculosXr from "../../../../lib/xr/vinculos-xr";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string): string | null => {
      return store[key] ?? null;
    },
    setItem: (key: string, value: string): void => {
      store[key] = value.toString();
    },
    removeItem: (key: string): void => {
      delete store[key];
    },
    clear: (): void => {
      store = {};
    }
  };
})();

// Mock window.matchMedia for sistemaDelNavegador
const matchMediaMock = (query: string) => {
  return {
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  };
};

// Create a mock window if it doesn't exist (for Node.js)
if (typeof window === 'undefined') {
  global.window = {} as any;
}
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  configurable: true,
  writable: true
});
Object.defineProperty(window, 'matchMedia', {
  value: matchMediaMock,
  configurable: true,
  writable: true
});

describe('prefs-xr', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe('leerConfort', () => {
    it('should return default confort when nothing is stored', () => {
      const result = leerConfort(undefined, localStorageMock);
      expect(result.confort).toEqual(expect.objectContaining({
        giro: "saltos",
        anguloSalto: 30,
        vineta: "auto",
        fuerzaVineta: 0.6,
        locomocion: "teletransporte",
        subtitulos: true,
        movimientoReducido: false,
        contrasteAlto: false,
        reducirTransparencia: false,
        postura: "de-pie",
        manoDominante: "derecha",
        escala: 1,
        alturaOjos: null,
        textoMinGrados: 1,
      }));
      expect(result.avisos).toEqual([]);
    });

     it('should return stored confort with movimiento reducido applied when valid JSON is stored', () => {
       const confort: PreferenciasConfort = {
         giro: "continuo",
         anguloSalto: 60,
         vineta: "siempre",
         fuerzaVineta: 0.8,
         locomocion: "continua",
         subtitulos: false,
         movimientoReducido: true,
         contrasteAlto: true,
         reducirTransparencia: true,
         postura: "sentado",
         manoDominante: "izquierda",
         escala: 1.2,
         alturaOjos: 1.5,
         textoMinGrados: 2,
       };
      localStorageMock.setItem("starseed.xr.confort.v1", JSON.stringify(confort));
      const result = leerConfort(undefined, localStorageMock);
      const expectedConfort = {
        ...confort,
        giro: "saltos",
        locomocion: "teletransporte",
        // fuerzaVineta remains 0.8 because max(0.8, 0.6) = 0.8
        // vineta remains "siempre" because movimiento reducido sets it to "siempre"
      };
      expect(result.confort).toEqual(expectedConfort);
      expect(result.avisos).toContain("El movimiento reducido está activo: el giro es por saltos y no se camina de forma continua.");
    });

    it('should return default confort when stored JSON is invalid', () => {
      localStorageMock.setItem("starseed.xr.confort.v1", "{ invalid json");
      const result = leerConfort(undefined, localStorageMock);
      // Should return default confort (since JSON parse throws and we catch)
      expect(result.confort.giro).toBe("saltos");
      // Avisos should be empty because we caught the error and called sanearConfort with undefined
      expect(result.avisos).toEqual([]);
    });

     it('should apply sistema overrides and then movimiento reducido cuando proporcionado', () => {
       const sistema = { movimientoReducido: true, contrasteAlto: true, reducirTransparencia: true };
       const result = leerConfort(sistema, localStorageMock);
       // Since sistema overrides are all true, the confort should have these true regardless of stored values
       expect(result.confort.movimientoReducido).toBe(true);
       expect(result.confort.contrasteAlto).toBe(true);
       expect(result.confort.reducirTransparencia).toBe(true);
       // Additionally, because movimientoReducido is true, the giro should be "saltos" and locomocion should be "teletransporte" if it was "continua"
       // We didn't store anything in localStorageMock for this test, so we are using the default confort from the storage (which is all false)
       // But we are passing sistema, so the confort should be based on the sistema overrides and the default valores from sanearConfort?
       // Actually, we are not setting any item in localStorageMock, so the storage.getItem will return null, and we will pass undefined to sanearConfort.
       // Then sanearConfort will use the default confort from CONFORT_DEFECTO and override with sistema.
       // Let's compute what we expect:
       //   From CONFORT_DEFECTO: 
       //     giro: "saltos", anguloSalto: 30, vineta: "auto", fuerzaVineta: 0.6, locomocion: "teletransporte", subtitulos: true,
       //     movimientoReducido: false, contrasteAlto: false, reducirTransparencia: false, postura: "de-pie", manoDominante: "derecha",
       //     escala: 1, alturaOjos: null, textoMinGrados: 1
       //   Then we apply sistema overrides in sanearConfort:
       //     movimientoReducido: bool(r.movimientoReducido, d.movimientoReducido) || delSistema.movimientoReducido === true
       //       Since delSistema.movimientoReducido is true, this will be true.
       //     contrasteAlto: similarly true.
       //     reducirTransparencia: true.
       //   So after sanearConfort, before aplicarMovimientoReducido, we have:
       //     movimientoReducido: true, contrasteAlto: true, reducirTransparencia: true, and the other properties from CONFORT_DEFECTO.
       //   Then aplicarMovimientoReducido is called because movimientoReducido is true:
       //     giro: "saltos" (already "saltos" from def)
       //     vineta: "siempre"
       //     fuerzaVineta: max(0.6, 0.6) = 0.6
       //     locomocion: "teletransporte" (because it was "teletransporte" in def, and the condition is: c.locomocion === "continua" ? "teletransporte" : c.locomocion -> since it's not "continua", it remains "teletransporte")
       //     other properties unchanged.
       //   So the expected confort should be:
       //     giro: "saltos",
       //     anguloSalto: 30,
       //     vineta: "siempre",
       //     fuerzaVineta: 0.6,
       //     locomocion: "teletransporte",
       //     subtitulos: true,
       //     movimientoReducido: true,
       //     contrasteAlto: true,
       //     reducirTransparencia: true,
       //     postura: "de-pie",
       //     manoDominante: "derecha",
       //     escala: 1,
       //     alturaOjos: null,
       //     textoMinGrados: 1
       const expectedConfort = {
         giro: "saltos",
         anguloSalto: 30,
         vineta: "siempre",
         fuerzaVineta: 0.6,
         locomocion: "teletransporte",
         subtitulos: true,
         movimientoReducido: true,
         contrasteAlto: true,
         reducirTransparencia: true,
         postura: "de-pie",
         manoDominante: "derecha",
         escala: 1,
         alturaOjos: null,
         textoMinGrados: 1,
       };
       expect(result.confort).toEqual(expectedConfort);
     });
  });

  describe('leerCalidad', () => {
    it('should return { modo: "auto" } when nothing is stored', () => {
      const result = leerCalidad(localStorageMock);
      expect(result).toEqual({ modo: "auto" });
    });

    it('should return stored calidad when valid', () => {
      localStorageMock.setItem("starseed.xr.calidad.v1", JSON.stringify({ modo: "media" }));
      const result = leerCalidad(localStorageMock);
      expect(result).toEqual({ modo: "media" });
    });

    it('should return { modo: "auto" } when stored modo is not auto nor a valid nivel', () => {
      localStorageMock.setItem("starseed.xr.calidad.v1", JSON.stringify({ modo: "invalido" }));
      const result = leerCalidad(localStorageMock);
      expect(result).toEqual({ modo: "auto" });
    });

    it('should return { modo: "auto" } when stored JSON is invalid', () => {
      localStorageMock.setItem("starseed.xr.calidad.v1", "{ invalid json");
      const result = leerCalidad(localStorageMock);
      expect(result).toEqual({ modo: "auto" });
    });
  });

  describe('leerVinculos', () => {
    it('should return default maps when nothing is stored', () => {
      const result = leerVinculos(localStorageMock);
      expect(result).toEqual(expect.objectContaining({
        mandos: expect.any(Object),
        manos: expect.any(Object),
      }));
    });

    it('should return stored vinculos when valid', () => {
      // Create a valid mandos map: start with default and override seleccionar
      const mandosValido = {
        ...vinculosXr.MAPAS_DEFECTO.mandos,
        seleccionar: [{ tipo: "boton", indice: 0, mano: "derecha" }]
      };
      const vinculos = { mandos: mandosValido };
      localStorageMock.setItem("starseed.xr.vinculos.v1", JSON.stringify(vinculos));
      const result = leerVinculos(localStorageMock);
      // Since we stored a valid mandos map, it should be returned; other entradas default
       expect(result.mandos!.seleccionar).toEqual([{ tipo: "boton", indice: 0, mano: "derecha" }]);
      expect(result.manos).toEqual(expect.objectContaining({
        seleccionar: [{ tipo: "gesto", gesto: "pellizco", mano: "cualquiera" }],
      }));
    });

      it('should default to MAPAS_DEFECTO for an entrada when the stored map is invalid', () => {
        // We'll store an invalid map for mandos: default map but with seleccionar set to an invalid gesto (reservado y tipo no permitido para mandos)
        const seleccionarInvalido: vinculosXr.Gatillo[] = [{ tipo: "gesto", gesto: "palma-a-la-cara", mano: "cualquiera" }];
        const mandosInvalido = {
          ...vinculosXr.MAPAS_DEFECTO.mandos,
          seleccionar: seleccionarInvalido
        };
        const vinculos = { mandos: mandosInvalido };
        localStorageMock.setItem("starseed.xr.vinculos.v1", JSON.stringify(vinculos));
        const result = leerVinculos(localStorageMock);
        // The mandos.seleccionar should fall back to the default because the stored one is invalid
         expect(result.mandos!.seleccionar).toEqual(vinculosXr.MAPAS_DEFECTO.mandos.seleccionar);
      });

    it('should return default maps when stored JSON is invalid', () => {
      localStorageMock.setItem("starseed.xr.vinculos.v1", "{ invalid json");
      const result = leerVinculos(localStorageMock);
      expect(result).toEqual(vinculosXr.MAPAS_DEFECTO);
    });
  });

  describe('leerModo', () => {
    it('should return undefined when nothing is stored', () => {
      const result = leerModo(localStorageMock);
      expect(result).toBeUndefined();
    });

    it('should return stored modo when valid', () => {
      localStorageMock.setItem("starseed.xr.modo.v1", JSON.stringify("vr-inmersivo"));
      const result = leerModo(localStorageMock);
      expect(result).toBe("vr-inmersivo");
    });

    it('should return undefined when stored modo is not a valid ModoXR', () => {
      localStorageMock.setItem("starseed.xr.modo.v1", JSON.stringify("modo-invalido"));
      const result = leerModo(localStorageMock);
      expect(result).toBeUndefined();
    });

    it('should return undefined when stored JSON is invalid', () => {
      localStorageMock.setItem("starseed.xr.modo.v1", "{ invalid json");
      const result = leerModo(localStorageMock);
      expect(result).toBeUndefined();
    });
  });

   describe('guardar functions', () => {
     it('should guardarConfort and then be able to read it', () => {
       const confort: PreferenciasConfort = {
         giro: "saltos",
         anguloSalto: 30,
         vineta: "auto",
         fuerzaVineta: 0.6,
         locomocion: "teletransporte",
         subtitulos: true,
         movimientoReducido: false,
         contrasteAlto: false,
         reducirTransparencia: false,
         postura: "de-pie",
         manoDominante: "derecha",
         escala: 1,
         alturaOjos: null,
         textoMinGrados: 1,
       };
       guardarConfort(confort, localStorageMock);
       const result = leerConfort(undefined, localStorageMock);
       expect(result.confort).toEqual(confort);
     });

     it('should guardarCalidad and then be able to read it', () => {
       const calidad: { modo: "auto" | NivelCalidad } = { modo: "alta" };
       guardarCalidad(calidad, localStorageMock);
       const result = leerCalidad(localStorageMock);
       expect(result).toEqual(calidad);
     });

       it('should guardarVinculos and then be able to read it', () => {
         const seleccionar: vinculosXr.Gatillo[] = [{ tipo: "boton", indice: 9, mano: "izquierda" }];
         const vinculos = {
           mandos: {
             ...vinculosXr.MAPAS_DEFECTO.mandos,
             seleccionar,
           },
         };
         guardarVinculos(vinculos, localStorageMock);
         const result = leerVinculos(localStorageMock);
          expect(result.mandos!.seleccionar).toEqual([{ tipo: "boton", indice: 9, mano: "izquierda" } as vinculosXr.Gatillo]);
       });

     it('should guardarModo and then be able to read it', () => {
       const modo: ModoXR = "ar-passthrough";
       guardarModo(modo, localStorageMock);
       const result = leerModo(localStorageMock);
       expect(result).toBe(modo);
     });
  });

  describe('sistemaDelNavegador', () => {
    it('should return false for all when matchMedia throws', () => {
      // We'll mock matchMedia to throw
      const originalMatchMedia = window.matchMedia;
      Object.defineProperty(window, 'matchMedia', {
        value: () => { throw new Error("No matchMedia"); }
      });
      try {
        const result = sistemaDelNavegador();
        expect(result).toEqual({
          movimientoReducido: false,
          contrasteAlto: false,
          reducirTransparencia: false,
        });
      } finally {
        Object.defineProperty(window, 'matchMedia', {
          value: originalMatchMedia
        });
      }
    });
  });
});