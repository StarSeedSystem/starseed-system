/**
 * Tests de filasAPublicar (MRA5b/MAP1116B).
 */

import { describe, it, expect } from "vitest";
import { DEFAULT_MESH_PRIVACY, type MeshPrivacySettings } from "@/ai/astraura/mesh/privacy";
import { filasAPublicar, type EntradaPublicacion, type FilaPublicable } from "../publicacion";
import type { SenalEspectro, Medio, OrigenDato, CapaRed } from "../tipos";

const AHORA = 1_700_000_000_000;

function privacidadBase(overrides: Partial<MeshPrivacySettings> = {}): MeshPrivacySettings {
  return { ...DEFAULT_MESH_PRIVACY, ...overrides };
}

function senalPropia(overrides: Partial<SenalEspectro> = {}): SenalEspectro {
  return {
    id: "s1",
    medio: "lora",
    banda: "EU 868",
    frecuenciaKhz: 868100,
    anchoKhz: 125000,
    fuerzaDbm: -85,
    calidad: 0.7,
    origen: "medida",
    capa: "propia",
    fuente: "radio Meshtastic",
    medidoEn: AHORA - 10_000,
    zona: null,
    compatibles: [],
    ...overrides,
  };
}

function senalOcupacion(overrides: Partial<SenalEspectro> = {}): SenalEspectro {
  return {
    id: "o1",
    medio: "wifi",
    banda: "2.4 GHz",
    frecuenciaKhz: 2437000,
    anchoKhz: 20000,
    fuerzaDbm: -65,
    calidad: 0.8,
    origen: "medida",
    capa: "publica",
    fuente: "escaneo de Wi-Fi del sistema",
    medidoEn: AHORA - 20_000,
    zona: null,
    compatibles: [],
    ...overrides,
  };
}

function entradaBase(overrides: Partial<EntradaPublicacion> = {}): EntradaPublicacion {
  return {
    privacidad: privacidadBase(),
    internetPublico: true,
    eleccion: {
      publicar: { lora: "publica", wifi: "publica" },
      comunidades: ["comunidad-alpha"],
      incluirZona: false,
    },
    propias: [],
    ocupacion: [],
    zonaGruesa: null,
    deviceId: "device-1",
    ahora: AHORA,
    ...overrides,
  };
}

describe("filasAPublicar", () => {
  describe("regla 1: radar off / sesión privada → nada en capa pública", () => {
    it("publicRadar = off: no emite faro → capa pública vacía", () => {
      const entrada = entradaBase({
        privacidad: privacidadBase({ publicRadar: "off" }),
        propias: [senalPropia({ medio: "lora", id: "s1" })],
        eleccion: { publicar: { lora: "publica" }, comunidades: ["c1"], incluirZona: false },
      });
      const filas = filasAPublicar(entrada);
      const publicas = filas.filter((f) => f.capa === "publica");
      expect(publicas).toHaveLength(0);
    });

    it("internetPublico = false: sesión pública apagada → capa pública vacía", () => {
      const entrada = entradaBase({
        internetPublico: false,
        propias: [senalPropia({ medio: "lora", id: "s1" })],
        eleccion: { publicar: { lora: "publica" }, comunidades: ["c1"], incluirZona: false },
      });
      const filas = filasAPublicar(entrada);
      const publicas = filas.filter((f) => f.capa === "publica");
      expect(publicas).toHaveLength(0);
    });

    it("visibility = private: neurona en privado → capa pública vacía", () => {
      const entrada = entradaBase({
        privacidad: privacidadBase({ visibility: "private" }),
        propias: [senalPropia({ medio: "lora", id: "s1" })],
        eleccion: { publicar: { lora: "publica" }, comunidades: ["c1"], incluirZona: false },
      });
      const filas = filasAPublicar(entrada);
      const publicas = filas.filter((f) => f.capa === "publica");
      expect(publicas).toHaveLength(0);
    });

    it("modo anónimo (por defecto): señales propias van a comunidad, no a pública", () => {
      const entrada = entradaBase({
        privacidad: privacidadBase({ publicRadar: "anonymous" }),
        propias: [senalPropia({ medio: "lora", id: "s1" })],
        eleccion: { publicar: { lora: "publica" }, comunidades: ["c1"], incluirZona: false },
      });
      const filas = filasAPublicar(entrada);
      const publicas = filas.filter((f) => f.capa === "publica");
      const comunidad = filas.filter((f) => f.capa === "comunidad");
      expect(publicas).toHaveLength(0);
      expect(comunidad).toHaveLength(1);
    });
  });

  describe("regla 2: solo medios con elección distinta de 'no'", () => {
    it("medio con elección 'no' no produce filas", () => {
      const entrada = entradaBase({
        propias: [senalPropia({ medio: "lora", id: "s1" })],
        eleccion: { publicar: { lora: "no" }, comunidades: ["c1"], incluirZona: false },
      });
      const filas = filasAPublicar(entrada);
      expect(filas).toHaveLength(0);
    });

    it("medio sin elección no produce filas", () => {
      const entrada = entradaBase({
        propias: [senalPropia({ medio: "lora", id: "s1" })],
        eleccion: { publicar: {}, comunidades: ["c1"], incluirZona: false },
      });
      const filas = filasAPublicar(entrada);
      expect(filas).toHaveLength(0);
    });

    it("medio con elección 'comunidad' produce fila en comunidad", () => {
      const entrada = entradaBase({
        propias: [senalPropia({ medio: "lora", id: "s1" })],
        eleccion: { publicar: { lora: "comunidad" }, comunidades: ["c1"], incluirZona: false },
      });
      const filas = filasAPublicar(entrada);
      expect(filas).toHaveLength(1);
      expect(filas[0].capa).toBe("comunidad");
    });

    it("medio con elección 'publica' y radar visible produce fila en pública", () => {
      const entrada = entradaBase({
        privacidad: privacidadBase({ publicRadar: "visible" }),
        propias: [senalPropia({ medio: "lora", id: "s1" })],
        eleccion: { publicar: { lora: "publica" }, comunidades: ["c1"], incluirZona: false },
      });
      const filas = filasAPublicar(entrada);
      expect(filas).toHaveLength(1);
      expect(filas[0].capa).toBe("publica");
    });
  });

  describe("regla 3: ocupación agregada por banda (sin SSID, MAC, nombres, posiciones)", () => {
    it("una señal oída produce una fila de ocupación agregada", () => {
      const entrada = entradaBase({
        ocupacion: [senalOcupacion({ medio: "wifi", banda: "2.4 GHz", id: "o1" })],
        eleccion: { publicar: { wifi: "publica" }, comunidades: ["c1"], incluirZona: false },
      });
      const filas = filasAPublicar(entrada);
      expect(filas).toHaveLength(1);
      expect(filas[0].id).toContain("ocupacion");
      expect(filas[0].fuente).toContain("ocupación agregada");
      expect(filas[0].origen).toBe("estimada");
    });

    it("varias señales oídas en la misma banda se agregan (conteo y fuerza máxima)", () => {
      const entrada = entradaBase({
        ocupacion: [
          senalOcupacion({ id: "o1", fuerzaDbm: -65 }),
          senalOcupacion({ id: "o2", fuerzaDbm: -55 }),
          senalOcupacion({ id: "o3", fuerzaDbm: -70 }),
        ],
        eleccion: { publicar: { wifi: "publica" }, comunidades: ["c1"], incluirZona: false },
      });
      const filas = filasAPublicar(entrada);
      expect(filas).toHaveLength(1);
      expect(filas[0].fuente).toContain("3 señales");
      expect(filas[0].fuerzaDbm).toBe(-55); // fuerza máxima
    });

    it("la fila de ocupación NO contiene SSID, MAC, nombres ni posiciones", () => {
      const entrada = entradaBase({
        ocupacion: [senalOcupacion({ medio: "wifi", banda: "2.4 GHz", id: "o1" })],
        eleccion: { publicar: { wifi: "publica" }, comunidades: ["c1"], incluirZona: false },
      });
      const filas = filasAPublicar(entrada);
      const fila = filas[0];
      // Verificar que las claves prohibidas no existen en el objeto
      expect("ssid" in fila).toBe(false);
      expect("mac" in fila).toBe(false);
      expect("lat" in fila).toBe(false);
      expect("lon" in fila).toBe(false);
      // Verificar que la fuente no menciona SSID/MAC
      expect(fila.fuente.toLowerCase()).not.toContain("ssid");
      expect(fila.fuente.toLowerCase()).not.toContain("mac");
    });

    it("ocupación de medio sin elección no produce filas", () => {
      const entrada = entradaBase({
        ocupacion: [senalOcupacion({ medio: "wifi", id: "o1" })],
        eleccion: { publicar: { lora: "publica" }, comunidades: ["c1"], incluirZona: false }, // wifi no elegido
      });
      const filas = filasAPublicar(entrada);
      expect(filas).toHaveLength(0);
    });
  });

  describe("regla 4: zona solo si incluirZona y zonaGruesa ≤5 caracteres", () => {
    it("incluirZona = false → filas sin zona", () => {
      const entrada = entradaBase({
        propias: [senalPropia({ medio: "lora", id: "s1" })],
        eleccion: { publicar: { lora: "comunidad" }, comunidades: ["c1"], incluirZona: false },
        zonaGruesa: "A1B2C",
      });
      const filas = filasAPublicar(entrada);
      expect(filas[0].zona).toBeNull();
    });

    it("incluirZona = true y zonaGruesa ≤5 → fila con zona (radar visible)", () => {
      const entrada = entradaBase({
        privacidad: privacidadBase({ publicRadar: "visible" }),
        propias: [senalPropia({ medio: "lora", id: "s1" })],
        eleccion: { publicar: { lora: "comunidad" }, comunidades: ["c1"], incluirZona: true },
        zonaGruesa: "A1B2C",
      });
      const filas = filasAPublicar(entrada);
      expect(filas[0].zona).toBe("A1B2C");
    });

    it("zonaGruesa de 6 caracteres → se descarta la zona", () => {
      const entrada = entradaBase({
        propias: [senalPropia({ medio: "lora", id: "s1" })],
        eleccion: { publicar: { lora: "comunidad" }, comunidades: ["c1"], incluirZona: true },
        zonaGruesa: "A1B2C3", // 6 caracteres
      });
      const filas = filasAPublicar(entrada);
      expect(filas[0].zona).toBeNull();
    });

    it("zonaGruesa null → fila sin zona", () => {
      const entrada = entradaBase({
        propias: [senalPropia({ medio: "lora", id: "s1" })],
        eleccion: { publicar: { lora: "comunidad" }, comunidades: ["c1"], incluirZona: true },
        zonaGruesa: null,
      });
      const filas = filasAPublicar(entrada);
      expect(filas[0].zona).toBeNull();
    });

    it("nunca hay claves lat/lon en las filas", () => {
      const entrada = entradaBase({
        propias: [senalPropia({ medio: "lora", id: "s1" })],
        eleccion: { publicar: { lora: "comunidad" }, comunidades: ["c1"], incluirZona: true },
        zonaGruesa: "A1B2C",
      });
      const filas = filasAPublicar(entrada);
      for (const fila of filas) {
        expect("lat" in fila).toBe(false);
        expect("lon" in fila).toBe(false);
      }
    });
  });

  describe("regla 5: cada fila lleva origen, medidoEn, capa, comunidad", () => {
    it("fila propia lleva origen 'medida'", () => {
      const entrada = entradaBase({
        propias: [senalPropia({ medio: "lora", id: "s1", origen: "medida" })],
        eleccion: { publicar: { lora: "comunidad" }, comunidades: ["c1"], incluirZona: false },
      });
      const filas = filasAPublicar(entrada);
      expect(filas[0].origen).toBe("medida");
    });

    it("fila de ocupación lleva origen 'estimada'", () => {
      const entrada = entradaBase({
        ocupacion: [senalOcupacion({ medio: "wifi", id: "o1" })],
        eleccion: { publicar: { wifi: "comunidad" }, comunidades: ["c1"], incluirZona: false },
      });
      const filas = filasAPublicar(entrada);
      expect(filas[0].origen).toBe("estimada");
    });

    it("fila lleva medidoEn válido", () => {
      const entrada = entradaBase({
        propias: [senalPropia({ medio: "lora", id: "s1", medidoEn: AHORA - 5000 })],
        eleccion: { publicar: { lora: "comunidad" }, comunidades: ["c1"], incluirZona: false },
      });
      const filas = filasAPublicar(entrada);
      expect(filas[0].medidoEn).toBe(AHORA - 5000);
    });

    it("fila de comunidad lleva slug de comunidad", () => {
      const entrada = entradaBase({
        propias: [senalPropia({ medio: "lora", id: "s1" })],
        eleccion: { publicar: { lora: "comunidad" }, comunidades: ["comunidad-alpha", "comunidad-beta"], incluirZona: false },
      });
      const filas = filasAPublicar(entrada);
      expect(filas[0].capa).toBe("comunidad");
      expect(filas[0].comunidad).toBe("comunidad-alpha"); // primera de la lista
    });

    it("fila pública lleva comunidad = null", () => {
      const entrada = entradaBase({
        privacidad: privacidadBase({ publicRadar: "visible" }),
        propias: [senalPropia({ medio: "lora", id: "s1" })],
        eleccion: { publicar: { lora: "publica" }, comunidades: ["c1"], incluirZona: false },
      });
      const filas = filasAPublicar(entrada);
      expect(filas[0].capa).toBe("publica");
      expect(filas[0].comunidad).toBeNull();
    });

    it("si no hay comunidades elegidas, no sale nada a comunidad", () => {
      const entrada = entradaBase({
        propias: [senalPropia({ medio: "lora", id: "s1" })],
        eleccion: { publicar: { lora: "comunidad" }, comunidades: [], incluirZona: false },
      });
      const filas = filasAPublicar(entrada);
      expect(filas).toHaveLength(0);
    });
  });

  describe("regla 6: antigüedad >3 min no sale; tope 40 filas", () => {
    it("señal con más de 3 min de antigüedad no sale", () => {
      const entrada = entradaBase({
        propias: [senalPropia({ medio: "lora", id: "s1", medidoEn: AHORA - 200_000 })], // > 3 min
        eleccion: { publicar: { lora: "comunidad" }, comunidades: ["c1"], incluirZona: false },
      });
      const filas = filasAPublicar(entrada);
      expect(filas).toHaveLength(0);
    });

    it("señal exactamente a 3 min sale", () => {
      const entrada = entradaBase({
        propias: [senalPropia({ medio: "lora", id: "s1", medidoEn: AHORA - 180_000 })],
        eleccion: { publicar: { lora: "comunidad" }, comunidades: ["c1"], incluirZona: false },
      });
      const filas = filasAPublicar(entrada);
      expect(filas).toHaveLength(1);
    });

    it("tope de 40 filas por tanda", () => {
      const propias: SenalEspectro[] = [];
      for (let i = 0; i < 50; i++) {
        propias.push(senalPropia({ id: `s${i}`, medio: "lora", medidoEn: AHORA - i * 1000 }));
      }
      const entrada = entradaBase({
        propias,
        eleccion: { publicar: { lora: "comunidad" }, comunidades: ["c1"], incluirZona: false },
      });
      const filas = filasAPublicar(entrada);
      expect(filas).toHaveLength(40);
    });

    it("orden: más recientes primero", () => {
      const entrada = entradaBase({
        propias: [
          senalPropia({ id: "s1", medio: "lora", medidoEn: AHORA - 10_000 }),
          senalPropia({ id: "s2", medio: "lora", medidoEn: AHORA - 5_000 }), // más reciente
          senalPropia({ id: "s3", medio: "lora", medidoEn: AHORA - 15_000 }),
        ],
        eleccion: { publicar: { lora: "comunidad" }, comunidades: ["c1"], incluirZona: false },
      });
      const filas = filasAPublicar(entrada);
      expect(filas[0].id).toContain("s2");
      expect(filas[1].id).toContain("s1");
      expect(filas[2].id).toContain("s3");
    });
  });

  describe("comunidad ajena no elegida → nada", () => {
    it("señal de medio elegido para comunidad pero sin comunidades en la lista → nada", () => {
      const entrada = entradaBase({
        propias: [senalPropia({ medio: "lora", id: "s1" })],
        eleccion: { publicar: { lora: "comunidad" }, comunidades: [], incluirZona: false },
      });
      const filas = filasAPublicar(entrada);
      expect(filas).toHaveLength(0);
    });
  });

  describe("anónimo → solo declaradas sin zona", () => {
    it("modo anónimo: señales propias van a comunidad, sin zona aunque incluirZona=true", () => {
      const entrada = entradaBase({
        privacidad: privacidadBase({ publicRadar: "anonymous" }),
        propias: [senalPropia({ medio: "lora", id: "s1" })],
        eleccion: { publicar: { lora: "publica" }, comunidades: ["c1"], incluirZona: true },
        zonaGruesa: "A1B2C",
      });
      const filas = filasAPublicar(entrada);
      expect(filas).toHaveLength(1);
      expect(filas[0].capa).toBe("comunidad");
      expect(filas[0].zona).toBeNull(); // anónimo no publica zona
    });
  });
});