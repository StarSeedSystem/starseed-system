// Tabla de recomendación por perfil de neurona × caso (MOD1110A).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { leerCatalogo } from "@/lib/astraura/capas/catalogo";
import { catalogoCompleto, equivalencia, modeloValido, recomendable, requisitosDe } from "../catalogo";
import { catalogoSemilla, FRONTERA_SEMILLA } from "../catalogo-datos";
import { construirPerfilNeurona, perfilDesdeCapacidades, type EntradaPerfilNeurona, type PerfilNeurona } from "../perfil-neurona";
import { candidatosPara, encajar, recomendar, recomendarTodos } from "../recomendar";
import { CASOS, type ModeloLocal } from "../tipos";

const capas = leerCatalogo(JSON.parse(readFileSync(join(process.cwd(), "config/capas-astraura.json"), "utf8")));
const semilla = catalogoSemilla();
const CAT: ModeloLocal[] = catalogoCompleto(semilla, capas);

const base: EntradaPerfilNeurona = { id: "x", plataforma: "tauri", ramReal: true, discoLibreGb: 200, enchufada: true, ollama: true, backend158: true, webgpu: true };
const mac8 = construirPerfilNeurona({ ...base, id: "mac8", nombre: "MacBook 8", gpuRenderer: "Apple M1", ramGb: 8 });
const pc16 = construirPerfilNeurona({ ...base, id: "pc16", nombre: "PC 16", gpuRenderer: "NVIDIA GeForce RTX 4070", ramGb: 16, vramGb: 12 });
const mac32 = construirPerfilNeurona({ ...base, id: "mac32", nombre: "MaggaBook", gpuRenderer: "Apple M2 Max", ramGb: 32, iaMalla: true });
const mac64 = construirPerfilNeurona({ ...base, id: "mac64", nombre: "Studio", gpuRenderer: "Apple M2 Ultra", ramGb: 64, iaMalla: true });
const cpu16 = construirPerfilNeurona({ ...base, id: "cpu16", nombre: "Portátil sin GPU", gpuRenderer: "Intel(R) UHD Graphics", ramGb: 16 });
const tablet = construirPerfilNeurona({ id: "tab", nombre: "Maggaboard", plataforma: "android", ramGb: 8, discoLibreGb: 30, webgpu: true, enchufada: false });
const debil = construirPerfilNeurona({ id: "deb", nombre: "Móvil viejo", plataforma: "android", ramGb: 2, discoLibreGb: 5, wasm: true });

describe("semilla del catálogo", () => {
  it("solo trae builds normales, comprobados, con fecha y fuente", () => {
    expect(semilla.modelos.length).toBeGreaterThanOrEqual(20);
    for (const m of semilla.modelos) {
      expect(modeloValido(m)).toBe(true);
      expect(m.clase).toBe("normal");
      expect(m.id).not.toMatch(/abliterat|uncensor|huihui/i);
      expect(m.fuentes.length).toBeGreaterThan(0);
      expect(m.fuentes.every((f) => /^https:\/\/(ollama\.com|epoch\.ai)\//.test(f))).toBe(true);
      expect(m.comprobado).toBe("2026-11-10");
      expect(recomendable(m)).toBe(true);
      if (m.puntuacion) expect(m.puntuacion.comprobado).toBe("2026-11-10");
    }
  });
  it("rechaza cualquier clase que no sea «normal»", () => {
    const raro = { ...semilla.modelos[0], clase: "abliterated" };
    expect(modeloValido(raro)).toBe(false);
  });
  it("no recomienda una puntuación inventada: Qwen3.8 27B no tiene ECI comprobado", () => {
    expect(semilla.modelos.find((m) => m.id === "qwen3.8:27b")?.puntuacion).toBeNull();
  });
  it("las capas 1.58-bit y Needle entran en la misma comparación", () => {
    expect(CAT.some((m) => m.tipo === "capa-158")).toBe(true);
    expect(CAT.some((m) => m.tipo === "needle")).toBe(true);
    expect(CAT.some((m) => m.id.startsWith("colibri"))).toBe(false); // «por-verificar»: no entran
  });
});

describe("requisitos y equivalencia", () => {
  it("memoria mínima 8 GB para un modelo de 3,3 GB", () => {
    expect(requisitosDe(CAT.find((m) => m.id === "qwen3.5:4b")!).memoriaMinGb).toBe(8);
  });
  it("Qwen3.5 9B ≈ mejor modelo cerrado de dic. 2024 (o1), ~14,3 meses por detrás", () => {
    const e = equivalencia(CAT.find((m) => m.id === "qwen3.5:9b")!, FRONTERA_SEMILLA);
    expect(e.referencia?.modelo).toBe("o1");
    expect(e.mesesDetras).toBeCloseTo(14.3, 1);
    expect(e.texto).toContain("dic. 2024");
  });
  it("sin puntuación lo dice claro", () => {
    expect(equivalencia(CAT.find((m) => m.id === "qwen3.5:4b")!, FRONTERA_SEMILLA).texto).toMatch(/Sin puntuación/);
  });
});

describe("encaje", () => {
  it("sin runtime no cabe, aunque la memoria sobre", () => {
    const sinOllama = construirPerfilNeurona({ ...base, id: "s", gpuRenderer: "Apple M2", ramGb: 64, ollama: false });
    const e = encajar(CAT.find((m) => m.id === "qwen3.5:9b")!, sinOllama);
    expect(e.veredicto).toBe("no-cabe");
    expect(e.motivo).toBe("sin-runtime");
  });
  it("los builds MLX solo en Apple silicon", () => {
    const mlx = CAT.find((m) => m.id === "qwen3.5:9b-mlx")!;
    expect(encajar(mlx, pc16).motivo).toBe("solo-apple");
    expect(encajar(mlx, mac32).veredicto).toBe("recomendado");
  });
  it("Falta disco: libera N GB (Mac de 8 GB con 4 GB libres)", () => {
    const alex = { ...mac8, discoLibreGb: 4 };
    const e = encajar(CAT.find((m) => m.id === "qwen3.5:4b")!, alex);
    expect(e.veredicto).toBe("falta-disco");
    expect(e.liberarGb).toBe(0.6);
    expect(encajar(CAT.find((m) => m.id === "qwen3.5:4b")!, alex, true).veredicto).toBe("justo"); // ya instalado
  });
  it("CPU sola: lo pequeño sí, lo grande no", () => {
    expect(encajar(CAT.find((m) => m.id === "qwen3.5:4b")!, cpu16).veredicto).toBe("recomendado");
    expect(encajar(CAT.find((m) => m.id === "gpt-oss:20b")!, cpu16).veredicto).toBe("no-cabe");
  });
  it("con batería un modelo grande baja a «justo»", () => {
    const m = CAT.find((m) => m.id === "gemma4:26b")!;
    expect(encajar(m, { ...mac32, enchufada: true }).veredicto).toBe("recomendado");
    const b = encajar(m, { ...mac32, enchufada: false });
    expect(b.veredicto).toBe("justo");
    expect(b.motivo).toBe("bateria");
  });
  it("RAM del navegador (tope 8) no se toma por la real", () => {
    expect(tablet.ramFiable).toBe(false);
    expect(mac8.ramFiable).toBe(true);
  });
});

describe("tabla de recomendaciones", () => {
  const ids = (p: PerfilNeurona) => Object.fromEntries(CASOS.map((c) => [c, recomendar({ catalogo: CAT, perfil: p, caso: c }).modelo?.id ?? null]));

  it("Mac 8 GB: capa 1.58-bit en conversación (cabe holgada), Needle en segundo plano", () => {
    const r = recomendar({ catalogo: CAT, perfil: mac8, caso: "conversacion" });
    expect(r.veredicto).toBe("recomendado");
    expect(r.modelo?.tipo).toBe("capa-158");
    expect(recomendar({ catalogo: CAT, perfil: mac8, caso: "segundo-plano" }).modelo?.id).toBe("needle3-reflejo");
  });
  it("Mac 8 GB: código y agentes usa un modelo con herramientas que cabe justo", () => {
    const r = recomendar({ catalogo: CAT, perfil: mac8, caso: "codigo-agentes" });
    expect(r.modelo?.herramientas).toBe(true);
    expect(["justo", "recomendado"]).toContain(r.veredicto);
  });
  it("PC 16 GB con NVIDIA: Qwen3.5 9B en conversación", () => {
    expect(ids(pc16).conversacion).toBe("qwen3.5:9b");
    expect(recomendar({ catalogo: CAT, perfil: pc16, caso: "vision" }).modelo?.vision).toBe(true);
  });
  it("Mac 32 GB: Gemma 4 26B (el más puntuado que cabe holgado); Mac 64 GB: Gemma 4 31B", () => {
    expect(ids(mac32).conversacion).toBe("gemma4:26b");
    expect(ids(mac64).conversacion).toBe("gemma4:31b");
  });
  it("capas de conciencia: sube a la más capaz que cabe (profunda solo con memoria)", () => {
    const m8 = recomendar({ catalogo: CAT, perfil: mac8, caso: "capas-conciencia" }).modelo;
    expect(m8?.papel).not.toBe("profunda");
    expect(recomendar({ catalogo: CAT, perfil: mac64, caso: "capas-conciencia" }).modelo?.papel).toBeDefined();
  });
  it("CPU sola: nada grande en ningún caso", () => {
    for (const c of CASOS) {
      const m = recomendar({ catalogo: CAT, perfil: cpu16, caso: c }).modelo;
      if (m && m.tipo === "estandar") expect(m.descargaGb).toBeLessThanOrEqual(8);
    }
  });
  it("Tablet Android: solo WebGPU/ONNX y Needle; ningún modelo de Ollama; código y agentes va a otra neurona", () => {
    const todos = recomendarTodos({ catalogo: CAT, perfil: tablet, entorno: { pares: [mac32] } });
    for (const r of Object.values(todos)) {
      expect(r.modelo === null || r.modelo.tipo !== "estandar").toBe(true);
      expect(r.modelo?.runtimes.some((x) => tablet.runtimes.includes(x)) ?? true).toBe(true);
    }
    const cod = todos["codigo-agentes"];
    expect(cod.ruta.tipo).toBe("neurona-malla");
    if (cod.ruta.tipo === "neurona-malla") expect(cod.ruta.neuronaId).toBe("mac32");
    expect(cod.modeloRuta?.herramientas).toBe(true);
    expect(cod.razon).toContain("MaggaBook");
  });
  it("nunca recomienda lo no comprobado, lo candidato ni lo que no tiene runtime", () => {
    const cat2: ModeloLocal[] = [
      ...CAT.map((m) => (m.id === "gemma4:26b" ? { ...m, estado: "sin-comprobar" as const } : m)),
      { ...CAT.find((m) => m.id === "qwen3.5:9b")!, id: "nuevo:99b", etiqueta: "nuevo:99b", estado: "candidato", puntuacion: { eci: 190, fecha: "2026-11-01", nombreEpoch: "x", fuente: "x", comprobado: "2026-11-10" } },
    ];
    for (const p of [mac8, pc16, mac32, mac64, cpu16, tablet, debil]) {
      for (const c of CASOS) {
        const r = recomendar({ catalogo: cat2, perfil: p, caso: c });
        for (const m of [r.modelo, r.modeloRuta, r.reflejo, ...r.alternativas]) {
          if (!m) continue;
          expect(m.estado).toBe("comprobado");
          expect(m.id).not.toBe("gemma4:26b");
        }
        if (r.modelo) expect(r.modelo.runtimes.some((x) => p.runtimes.includes(x))).toBe(true);
      }
    }
  });
  it("con Ollama ausente en escritorio dice cuántos modelos abriría instalarlo", () => {
    const sin = { ...mac32, runtimes: mac32.runtimes.filter((r) => r !== "ollama"), puedeInstalarOllama: true };
    const r = recomendar({ catalogo: CAT, perfil: sin, caso: "codigo-agentes" });
    expect(r.abriria).toBeGreaterThan(0);
  });
  it("el reflejo (Needle) acompaña a la conversación", () => {
    expect(recomendar({ catalogo: CAT, perfil: mac32, caso: "conversacion" }).reflejo?.id).toBe("needle3-reflejo");
  });
  it("voz: la capa de voz de Astraura", () => {
    expect(recomendar({ catalogo: CAT, perfil: mac32, caso: "voz" }).modelo?.papel).toMatch(/voz|oído/);
  });
});

describe("rutas y privacidad", () => {
  const externo = { nombre: "OpenRouter" };
  it("archivos privados NO salen a un proveedor externo sin permiso expreso", () => {
    const r = recomendar({ catalogo: CAT, perfil: debil, caso: "archivos-privados", entorno: { pares: [], externo } });
    expect(r.ruta.tipo).toBe("ninguna");
    const permitido = recomendar({ catalogo: CAT, perfil: debil, caso: "archivos-privados", entorno: { pares: [], externo, privacidad: { externoPermitido: true, externoParaPrivados: true } } });
    expect(permitido.ruta.tipo).toBe("externo");
  });
  it("con la IA de otra neurona o servidor propio, los privados se quedan en casa", () => {
    const m = recomendar({ catalogo: CAT, perfil: debil, caso: "archivos-privados", entorno: { pares: [mac32], externo } });
    expect(m.ruta.tipo).toBe("neurona-malla");
    const s = recomendar({ catalogo: CAT, perfil: debil, caso: "archivos-privados", entorno: { pares: [], servidorPropio: { nombre: "Coolify" }, externo } });
    expect(s.ruta.tipo).toBe("servidor-propio");
  });
  it("un par sin IA por la malla o fuera de línea no cuenta", () => {
    const apagado = { ...mac32, enLinea: false };
    const sinIa = { ...mac32, iaMalla: false };
    expect(recomendar({ catalogo: CAT, perfil: debil, caso: "archivos-privados", entorno: { pares: [apagado, sinIa] } }).ruta.tipo).toBe("ninguna");
  });
  it("privacidad general: sin permiso externo no hay proveedor aunque exista", () => {
    const r = recomendar({ catalogo: CAT, perfil: debil, caso: "codigo-agentes", entorno: { pares: [], externo, privacidad: { externoPermitido: false, externoParaPrivados: false } } });
    expect(r.ruta.tipo).toBe("ninguna");
  });
  it("neurona justa en código: prefiere un par que le cabe holgado", () => {
    const r = recomendar({ catalogo: CAT, perfil: mac8, caso: "codigo-agentes", entorno: { pares: [mac32] } });
    expect(r.ruta.tipo).toBe("neurona-malla");
  });
  it("cuando cabe holgado se queda en local aunque haya pares", () => {
    expect(recomendar({ catalogo: CAT, perfil: mac64, caso: "conversacion", entorno: { pares: [mac32] } }).ruta.tipo).toBe("local");
  });
  it("candidatosPara está ordenado y es determinista", () => {
    const a = candidatosPara(CAT, mac32, "conversacion").map((c) => c.m.id);
    expect(a).toEqual(candidatosPara([...CAT].reverse(), mac32, "conversacion").map((c) => c.m.id));
  });
});

describe("perfil desde la ficha de la cuenta", () => {
  it("lee los campos opcionales con tolerancia", () => {
    const p = perfilDesdeCapacidades("a", "A", { platform: "macOS", installedApp: true, gpuRenderer: "Apple M3", memoryGb: 8, ollama: true, astraura158: { online: true }, webgpu: true }, { ramDeclaradaGb: 16 });
    expect(p.chip).toBe("apple-silicon");
    expect(p.ramGb).toBe(16);
    expect(p.ramFiable).toBe(true);
    expect(p.runtimes).toContain("ollama");
    expect(p.runtimes).toContain("llama-cpp");
    expect(perfilDesdeCapacidades("b", "B", null).ramGb).toBeNull();
  });
});
