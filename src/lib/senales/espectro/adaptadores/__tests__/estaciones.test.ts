// src/lib/senales/espectro/adaptadores/__tests__/estaciones.test.ts
import { describe, it, expect } from "vitest";

import { type Estacion } from "@/lib/estaciones/tipos";
import { estacionesToSenalEspectro, convertirEstacionToSenal, sinFuente } from "../estaciones";
import type { SenalEspectro } from "../tipos";

describe("Adaptador de estaciones a señales del espectro", () => {
  it("convierte una estación pública a SenalEspectro con capa pública", () => {
    const estacion: Estacion = {
      id: "pub1",
      owner_id: "owner1",
      ambito_tipo: "persona",
      entidad_ref: null,
      titulo: "Estación Pública",
      descripcion: "",
      tipo: "audio",
      fuente: "enlace",
      enlace: "https://ejemplo.com/audio.mp3",
      formato: "100 MHz",
      imagen: null,
      idioma: "es",
      categorias: [],
      licencia: "cc0",
      visibilidad: "publica",
      empieza_en: null,
      termina_en: null,
      ultimo_latido: null,
      pausada: false,
      en_malla: false,
      espectadores: 0,
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
    };

    const senal = convertirEstacionToSenal(estacion);

    expect(senal.id).toBe("pub1");
    expect(senal.medio).toBe("estacion");
    expect(senal.banda).toBe("audio");
    expect(senal.frecuenciaKhz).toBe(100000);
    expect(senal.origen).toBe("declarada");
    expect(senal.capa).toBe("publica");
    expect(senal.fuente).toBe("estacion publicada por su dueño");
    expect(senal.vinculo).toEqual({ tipo: "estacion", id: "pub1" });
  });

  it("convierte una estación con visibilidad grupo a capa privada", () => {
    const estacion: Estacion = {
      id: "group1",
      owner_id: "owner1",
      ambito_tipo: "persona",
      entidad_ref: null,
      titulo: "Estación Grupo",
      descripcion: "",
      tipo: "mixto",
      fuente: "enlace",
      enlace: "https://ejemplo.com/mixto.mxf",
      formato: "",
      imagen: null,
      idioma: "es",
      categorias: [],
      licencia: "cc0",
      visibilidad: "grupo",
      empieza_en: null,
      termina_en: null,
      ultimo_latido: null,
      pausada: false,
      en_malla: false,
      espectadores: 0,
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
    };

    const senal = convertirEstacionToSenal(estacion);

    expect(senal.id).toBe("group1");
    expect(senal.capa).toBe("privada");
  });

  it("no asigna frecuencia cuando no hay formato", () => {
    const estacion: Estacion = {
      id: "nonfreq1",
      owner_id: "owner1",
      ambito_tipo: "persona",
      entidad_ref: null,
      titulo: "Sin Frecuencia",
      descripcion: "",
      tipo: "audio",
      fuente: "enlace",
      enlace: "https://ejemplo.com/audio.mp3",
      formato: "",
      imagen: null,
      idioma: "es",
      categorias: [],
      licencia: "cc0",
      visibilidad: "publica",
      empieza_en: null,
      termina_en: null,
      ultimo_latido: null,
      pausada: false,
      en_malla: false,
      espectadores: 0,
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
    };

    const senal = convertirEstacionToSenal(estacion);

    expect(senal.frecuenciaKhz).toBeNull();
  });

  it("parsea formato Hz a kHz", () => {
    const estacion: Estacion = {
      id: "hz1",
      owner_id: "owner1",
      ambito_tipo: "persona",
      entidad_ref: null,
      titulo: "Hz",
      descripcion: "",
      tipo: "audio",
      fuente: "enlace",
      enlace: "https://ejemplo.com/audio.mp3",
      formato: "2400000 Hz",
      imagen: null,
      idioma: "es",
      categorias: [],
      licencia: "cc0",
      visibilidad: "publica",
      empieza_en: null,
      termina_en: null,
      ultimo_latido: null,
      pausada: false,
      en_malla: false,
      espectadores: 0,
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
    };

    const senal = convertirEstacionToSenal(estacion);

    expect(senal.frecuenciaKhz).toBe(2400);
  });

  it("convierte array completo de estaciones", () => {
    const estaciones: Estacion[] = [
      {
        id: "pub1",
        owner_id: "owner1",
        ambito_tipo: "persona",
        entidad_ref: null,
        titulo: "Pública",
        descripcion: "",
        tipo: "audio",
        fuente: "enlace",
        enlace: "https://ejemplo.com/audio.mp3",
        formato: "100 MHz",
        imagen: null,
        idioma: "es",
        categorias: [],
        licencia: "cc0",
        visibilidad: "publica",
        empieza_en: null,
        termina_en: null,
        ultimo_latido: null,
        pausada: false,
        en_malla: false,
        espectadores: 0,
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
      },
      {
        id: "group1",
        owner_id: "owner1",
        ambito_tipo: "persona",
        entidad_ref: null,
        titulo: "Grupo",
        descripcion: "",
        tipo: "video",
        fuente: "enlace",
        enlace: "https://ejemplo.com/video.mp4",
        formato: "5 kHz",
        imagen: null,
        idioma: "es",
        categorias: [],
        licencia: "cc0",
        visibilidad: "grupo",
        empieza_en: null,
        termina_en: null,
        ultimo_latido: null,
        pausada: false,
        en_malla: false,
        espectadores: 0,
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
      },
    ];

    const senales = estacionesToSenalEspectro(estaciones);

    expect(senales).toHaveLength(2);
    expect(senales[0].capa).toBe("publica");
    expect(senales[1].capa).toBe("privada");
  });

  it("sinFuente devuelve array vacío", () => {
    const senales = sinFuente();

    expect(senales).toEqual([]);
  });
});
