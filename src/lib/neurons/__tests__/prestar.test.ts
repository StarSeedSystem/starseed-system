import { describe, it, expect } from "vitest";
import { aOferta, type NeuronPrestarPrefs, type NeuronMedidas } from "../prestar";

describe("aOferta", () => {
  it("should return offer with default prefs and medidas", () => {
    const prefs: NeuronPrestarPrefs = {
      computacion: true,
      almacenamiento: true,
      apps: [],
      ancho: 0,
      aQuien: {
        cuenta: true,
        grupos: false,
        publico: false,
      },
      topes: {
        cpu: 50,
        ram: 1024,
        disco: 2048,
        soloCargando: false,
      },
    };
    const medidas: NeuronMedidas = {
      nodoId: '',
      medio: 'navegador',
      ramLibreMb: 0,
      cpu: 0,
    };

    const offer = aOferta(prefs, medidas);
    expect(offer).toEqual({
      nodoId: '',
      medio: 'navegador',
      offeredRam: 0,
      offeredCpu: 0,
      apps: [],
      ancho: 0,
      aQuien: {
        cuenta: true,
        grupos: false,
        publico: false,
      },
      topes: {
        cpu: 50,
        ram: 1024,
        disco: 2048,
        soloCargando: false,
      },
    });
  });

  it("should respect prefs overrides", () => {
    const prefs: NeuronPrestarPrefs = {
      computacion: false,
      almacenamiento: false,
      apps: ['app1', 'app2'],
      ancho: 10,
      aQuien: {
        cuenta: false,
        grupos: true,
        publico: true,
      },
      topes: {
        cpu: 30,
        ram: 512,
        disco: 1024,
        soloCargando: true,
      },
    };
    const medidas: NeuronMedidas = {
      nodoId: '',
      medio: 'navegador',
      ramLibreMb: 0,
      cpu: 0,
    };

    const offer = aOferta(prefs, medidas);

    expect(offer).toEqual({
      nodoId: '',
      medio: 'navegador',
      offeredRam: 0, // because almacenamiento is false
      offeredCpu: 0, // because computacion is false
      apps: ['app1', 'app2'],
      ancho: 10,
      aQuien: {
        cuenta: false,
        grupos: true,
        publico: true,
      },
      topes: {
        cpu: 30,
        ram: 512,
        disco: 1024,
        soloCargando: true,
      },
    });
  });

  it("should limit offered resources by measures and topes", () => {
    const prefs: NeuronPrestarPrefs = {
      computacion: true,
      almacenamiento: true,
      apps: [],
      ancho: 5,
      aQuien: {
        cuenta: true,
        grupos: false,
        publico: false,
      },
      topes: {
        cpu: 50,
        ram: 1024,
        disco: 2048,
        soloCargando: false,
      },
    };
    const medidas: NeuronMedidas = {
      nodoId: 'node123',
      medio: 'mac',
      ramLibreMb: 2048, // 2GB free
      cpu: 80, // 80% usage
    };

    const offer = aOferta(prefs, medidas);

    expect(offer).toEqual({
      nodoId: 'node123',
      medio: 'mac',
      offeredRam: 1024, // min(2048, 1024) = 1024
      offeredCpu: 50,   // min(80, 50) = 50
      apps: [],
      ancho: 5,
      aQuien: {
        cuenta: true,
        grupos: false,
        publico: false,
      },
      topes: {
        cpu: 50,
        ram: 1024,
        disco: 2048,
        soloCargando: false,
      },
    });
  });

  it("should handle zero measures", () => {
    const prefs: NeuronPrestarPrefs = {
      computacion: true,
      almacenamiento: true,
      apps: [],
      ancho: 0,
      aQuien: {
        cuenta: true,
        grupos: false,
        publico: false,
      },
      topes: {
        cpu: 50,
        ram: 1024,
        disco: 2048,
        soloCargando: false,
      },
    };
    const medidas: NeuronMedidas = {
      nodoId: 'node456',
      medio: 'android',
      ramLibreMb: 0,
      cpu: 0,
    };

    const offer = aOferta(prefs, medidas);

    expect(offer).toEqual({
      nodoId: 'node456',
      medio: 'android',
      offeredRam: 0,
      offeredCpu: 0,
      apps: [],
      ancho: 0,
      aQuien: {
        cuenta: true,
        grupos: false,
        publico: false,
      },
      topes: {
        cpu: 50,
        ram: 1024,
        disco: 2048,
        soloCargando: false,
      },
    });
  });
});