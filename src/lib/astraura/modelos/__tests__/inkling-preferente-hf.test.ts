// Pruebas de Inkling-2-Mini (normal y AtomicChat IQ2_M), prioridad preferente en neuronas que lo soportan
// y autoactualización viva vía Hugging Face GGUF + contexto 1M en Ollama.
import { describe, expect, it } from "vitest";
import {
  fusionar,
  parsearModeloHf,
  parsearTagsOllama,
  parsearTendenciasHf,
  repoHfDeId,
  revisarFuentes,
  urlModeloHf,
  urlPermitida,
  URL_INDICE_HF_GGUF,
} from "../actualizar-catalogo";
import { catalogoSemilla } from "../catalogo-datos";
import { leerCatalogoModelos } from "../catalogo";
import { construirPerfilNeurona } from "../perfil-neurona";
import { aplicarEleccionManual, encajar, recomendar } from "../recomendar";
import { planInstalar } from "../instalar";
import { ajustesPredeterminados, migrarAjustes } from "../almacen";

const base = { plataforma: "tauri" as const, ramReal: true, discoLibreGb: 300, enchufada: true, ollama: true, backend158: true, webgpu: true };
const mac8 = construirPerfilNeurona({ ...base, id: "mac8", nombre: "MacBook 8", gpuRenderer: "Apple M1", ramGb: 8 });
const pc16 = construirPerfilNeurona({ ...base, id: "pc16", nombre: "PC 16", gpuRenderer: "NVIDIA GeForce RTX 4070", ramGb: 16, vramGb: 12 });
const mac32 = construirPerfilNeurona({ ...base, id: "mac32", nombre: "MaggaBook", gpuRenderer: "Apple M2 Max", ramGb: 32 });
const mac64 = construirPerfilNeurona({ ...base, id: "mac64", nombre: "Studio", gpuRenderer: "Apple M2 Ultra", ramGb: 64 });
const cpu16 = construirPerfilNeurona({ ...base, id: "cpu16", nombre: "Linux CPU", gpuRenderer: "Intel UHD", ramGb: 16 });
const android = construirPerfilNeurona({ id: "and", nombre: "Maggaboard", plataforma: "android", ramGb: 8, discoLibreGb: 30, webgpu: true, enchufada: false });

const ID_ATOMIC = "hf.co/AtomicChat/Inkling-2-Mini-Uncensored-GGUF:IQ2_M";
const cat = catalogoSemilla();

describe("Inkling-2-Mini preferente y AtomicChat IQ2_M", () => {
  it("se recomienda de forma preferente solo en neuronas con memoria suficiente, nunca en dispositivos sin capacidad", () => {
    expect(recomendar({ catalogo: cat.modelos, perfil: mac32, caso: "conversacion" }).modelo?.id).toBe("hf.co/unsloth/Inkling-2-Mini-GGUF:Q4_K_M");
    expect(recomendar({ catalogo: cat.modelos, perfil: mac64, caso: "vision" }).modelo?.id).toBe("inkling-2-mini:26b-a5b-nvfp4");
    expect(recomendar({ catalogo: cat.modelos, perfil: pc16, caso: "conversacion" }).modelo?.id).toBe("qwen3.5:9b");
    expect(recomendar({ catalogo: cat.modelos, perfil: mac8, caso: "conversacion" }).modelo?.id).not.toMatch(/inkling/i);
    expect(recomendar({ catalogo: cat.modelos, perfil: cpu16, caso: "conversacion" }).modelo?.id).toBe("qwen3.5:4b");
    expect(recomendar({ catalogo: cat.modelos, perfil: android, caso: "conversacion" }).modelo).toBeNull();
  });

  it("permite desactivar priorizarPreferentes y volver al ranking por ECI puro", () => {
    const r = recomendar({ catalogo: cat.modelos, perfil: mac32, caso: "conversacion", entorno: { priorizarPreferentes: false } });
    expect(r.modelo?.id).toBe("gemma4:26b");
  });

  it("hf.co/AtomicChat/Inkling-2-Mini-Uncensored-GGUF:IQ2_M cabe en 16-32 GB pero jamás se elige automático ni compartido", () => {
    const m = cat.modelos.find((x) => x.id === ID_ATOMIC)!;
    expect(m).toBeTruthy();
    expect(m.preferente).toBe(true);
    expect(m.descargaGb).toBe(8.7);
    expect(m.contextoK).toBe(1024);
    expect(encajar(m, mac32).veredicto).toBe("recomendado");
    expect(planInstalar(m, mac32).comando).toBe(`ollama pull ${ID_ATOMIC}`);

    // Nunca automático
    const rec = recomendar({ catalogo: cat.modelos, perfil: mac32, caso: "conversacion" });
    expect(rec.modelo?.clase).toBe("normal");

    // Nunca compartido ni bots
    const comp = aplicarEleccionManual({
      catalogo: cat.modelos,
      perfil: mac32,
      caso: "conversacion",
      rec,
      idManual: ID_ATOMIC,
      sinFiltros: { activado: true, disponible: true },
      contexto: "compartido",
    });
    expect(comp.sinFiltros).toBe(false);

    // Sí en privado-propio con interruptor encendido y herramientas activas
    const priv = aplicarEleccionManual({
      catalogo: cat.modelos,
      perfil: mac32,
      caso: "codigo-agentes",
      rec: recomendar({ catalogo: cat.modelos, perfil: mac32, caso: "codigo-agentes" }),
      idManual: ID_ATOMIC,
      sinFiltros: { activado: true, disponible: true },
      contexto: "privado-propio",
    });
    expect(priv.sinFiltros).toBe(true);
    expect(priv.modelo?.id).toBe(ID_ATOMIC);
  });

  it("propaga las nuevas entradas preferentes y ajustes de radar a catálogos/cuentas guardadas antes", () => {
    const viejoCat = { ...cat, modelos: cat.modelos.filter((x) => !x.id.includes("Inkling")) };
    const migradoCat = leerCatalogoModelos(viejoCat);
    expect(migradoCat.modelos.some((x) => x.id === ID_ATOMIC)).toBe(true);
    expect(migradoCat.modelos.some((x) => x.id === "hf.co/unsloth/Inkling-2-Mini-GGUF:Q4_K_M")).toBe(true);

    const migAj = migrarAjustes({ modo: "automatico" });
    expect(migAj.investigacionInternet).toBe(true);
    expect(migAj.priorizarPreferentes).toBe(true);
    expect(ajustesPredeterminados().investigacionInternet).toBe(true);
  });
});

describe("Autoactualización Hugging Face GGUF y ventana 1M en Ollama", () => {
  it("parsea ventana 1M en Ollama (1024K)", () => {
    const html = `<a href="/library/inkling-2-mini:26b-a5b" class="md:hidden"><span>inkling-2-mini:26b-a5b</span> • 20GB • 1M context window • Text, Image input</a>`;
    const filas = parsearTagsOllama(html);
    expect(filas).toEqual([{ tag: "inkling-2-mini:26b-a5b", descargaGb: 20, contextoK: 1024, vision: true }]);
  });

  it("valida URLs HF GGUF en lista cerrada y parsea repositorios/tendencias HF", () => {
    expect(urlPermitida(URL_INDICE_HF_GGUF)).toBe(true);
    expect(urlPermitida(urlModeloHf("AtomicChat/Inkling-2-Mini-Uncensored-GGUF"))).toBe(true);
    expect(urlPermitida(urlModeloHf("unsloth/Inkling-2-Mini-GGUF"))).toBe(true);
    expect(urlPermitida("https://huggingface.co/api/models/usuario_desconocido/modelo-x?blobs=true")).toBe(false);
    expect(repoHfDeId(ID_ATOMIC)).toEqual({ repo: "AtomicChat/Inkling-2-Mini-Uncensored-GGUF", cuant: "IQ2_M" });

    const jsonModelo = JSON.stringify({
      pipeline_tag: "image-text-to-text",
      cardData: { license: "apache-2.0" },
      siblings: [
        { rfilename: "Inkling-2-Mini-Uncensored-AD-IQ2_M.gguf", size: 9_600_000_000 },
        { rfilename: "Inkling-2-Mini-Uncensored-LoRA.gguf", size: 43_000_000 },
        { rfilename: "mmproj-Inkling-2-Mini-Uncensored-BF16.gguf", size: 641_000_000 },
      ],
    });
    const parsed = parsearModeloHf(jsonModelo);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ cuant: "IQ2_M", descargaGb: 9.6, vision: true, licencia: "apache-2.0" });

    const jsonTendencias = JSON.stringify([
      { id: "unsloth/Nuevo-Modelo-9B-GGUF", tags: ["gguf", "license:apache-2.0", "image-text-to-text"] },
      { id: "tercero-no-listado/Raro-GGUF", tags: ["gguf"] },
    ]);
    const tend = parsearTendenciasHf(jsonTendencias);
    expect(tend).toEqual([{ repo: "unsloth/Nuevo-Modelo-9B-GGUF", org: "unsloth", vision: true, licencia: "apache-2.0" }]);
  });

  it("fusionar() actualiza tamaños HF reales y descubre nuevos candidatos GGUF sin recomendarlos solos", async () => {
    const jsonUn = JSON.stringify({
      pipeline_tag: "image-text-to-text",
      siblings: [
        { rfilename: "Inkling-2-Mini-UD-IQ2_XXS.gguf", size: 8_500_000_000 },
        { rfilename: "Inkling-2-Mini-Q4_K_M.gguf", size: 18_200_000_000 },
      ],
    });
    const jsonTrend = JSON.stringify([{ id: "bartowski/Llama-Next-8B-GGUF", tags: ["gguf", "license:mit"] }]);
    const jsonBart = JSON.stringify({
      siblings: [{ rfilename: "Llama-Next-8B-Q4_K_M.gguf", size: 4_900_000_000 }],
    });
    const r = await revisarFuentes(cat, "2026-12-02", async (u) => {
      if (u === URL_INDICE_HF_GGUF) return jsonTrend;
      if (u === urlModeloHf("unsloth/Inkling-2-Mini-GGUF")) return jsonUn;
      if (u === urlModeloHf("bartowski/Llama-Next-8B-GGUF")) return jsonBart;
      return "";
    });
    expect(r.revisado).toBe(true);
    const q4 = r.catalogo.modelos.find((m) => m.id === "hf.co/unsloth/Inkling-2-Mini-GGUF:Q4_K_M")!;
    expect(q4.descargaGb).toBe(18.2);
    expect(q4.comprobado).toBe("2026-12-02");
    const cand = r.catalogo.modelos.find((m) => m.id === "hf.co/bartowski/Llama-Next-8B-GGUF:Q4_K_M")!;
    expect(cand.estado).toBe("candidato");
    expect(cand.descargaGb).toBe(4.9);

    const ret = fusionar(cat, {
      hoy: "2026-12-02",
      hf: { "AtomicChat/Inkling-2-Mini-Uncensored-GGUF": parsearModeloHf(JSON.stringify({ siblings: [{ rfilename: "a-Q4_K.gguf", size: 16_500_000_000 }] })) },
    });
    expect(ret.catalogo.modelos.find((m) => m.id === ID_ATOMIC)?.estado).toBe("sin-comprobar");
  });
});
