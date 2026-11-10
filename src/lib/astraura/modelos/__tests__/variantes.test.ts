// «Variantes sin filtros» (MOD1110B): catálogo verificado, tabla de recomendación con el interruptor apagado y encendido,
// «nunca automática», «nunca compartida», migración, apagado y autoactualización.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { leerCatalogo } from "@/lib/astraura/capas/catalogo";
import { activarVariantes, ajustesPredeterminados, desactivarVariantes, leerCatalogoGuardado, migrarAjustes, CLAVE_AJUSTES, CLAVE_CATALOGO, leerAjustes, type AlmacenTexto } from "../almacen";
import { urlPermitida, urlTags, fusionar, parsearCapacidadesOllama, parsearTagsOllama, revisarFuentes, URL_ECI, URL_INDICE_OLLAMA } from "../actualizar-catalogo";
import { catalogoCompleto, idSinFiltros, leerCatalogoModelos, listableSinFiltros, modeloValido, pierdeHerramientas, puntuacionDeBase, recomendable } from "../catalogo";
import { catalogoSemilla, MODELOS_SIN_FILTROS_SEMILLA } from "../catalogo-datos";
import { planInstalar } from "../instalar";
import { construirPerfilNeurona, type PerfilNeurona } from "../perfil-neurona";
import { aplicarEleccionManual, candidatosPara, CASOS_SIN_FILTROS, casosDe, puedeServirseAOtraCuenta, recomendar, recomendarTodos, type ContextoUso } from "../recomendar";
import { CASOS, type CasoUso, type ModeloLocal } from "../tipos";
import { EXPLICACION_SIN_FILTROS, variantesDisponibles } from "../variantes";

const capas = leerCatalogo(JSON.parse(readFileSync(join(process.cwd(), "config/capas-astraura.json"), "utf8")));
const semilla = catalogoSemilla();
const CAT: ModeloLocal[] = catalogoCompleto(semilla, capas);
const SF = CAT.filter((m) => m.clase === "abliterated");
const sf = (id: string) => SF.find((m) => m.id === id)!;

const base = { plataforma: "tauri" as const, ramReal: true, discoLibreGb: 300, enchufada: true, ollama: true, backend158: true, webgpu: true };
const mac8 = construirPerfilNeurona({ ...base, id: "mac8", nombre: "MacBook 8", gpuRenderer: "Apple M1", ramGb: 8 });
const pc16 = construirPerfilNeurona({ ...base, id: "pc16", nombre: "PC 16", gpuRenderer: "NVIDIA GeForce RTX 4070", ramGb: 16, vramGb: 12 });
const mac32 = construirPerfilNeurona({ ...base, id: "mac32", nombre: "MaggaBook", gpuRenderer: "Apple M2 Max", ramGb: 32, iaMalla: true });
const mac64 = construirPerfilNeurona({ ...base, id: "mac64", nombre: "Studio", gpuRenderer: "Apple M2 Ultra", ramGb: 64, iaMalla: true });
const cpu16 = construirPerfilNeurona({ ...base, id: "cpu16", nombre: "Portátil sin GPU", gpuRenderer: "Intel(R) UHD Graphics", ramGb: 16 });
const tablet = construirPerfilNeurona({ id: "tab", nombre: "Maggaboard", plataforma: "android", ramGb: 8, discoLibreGb: 30, webgpu: true, enchufada: false });
const debil = construirPerfilNeurona({ id: "deb", nombre: "Móvil viejo", plataforma: "android", ramGb: 2, discoLibreGb: 5, wasm: true });
const MUESTRA: PerfilNeurona[] = [mac8, pc16, mac32, mac64, cpu16, tablet, debil];
const CONTEXTOS: ContextoUso[] = ["privado-propio", "compartido", "publico", "segundo-plano", "malla-ajena"];

const ENCENDIDO = { activado: true, disponible: true };
const rec = (perfil: PerfilNeurona, caso: CasoUso) => recomendar({ catalogo: CAT, perfil, caso });

describe("catálogo de variantes sin filtros: solo lo verificado el 2026-11-10", () => {
  it("las 8 entradas verificadas, todas de huihui_ai, con fecha, fuente viva, base y SIN puntuación propia", () => {
    expect(MODELOS_SIN_FILTROS_SEMILLA.map((m) => m.id).sort()).toEqual([
      "huihui_ai/deepseek-r1-abliterated:8b", "huihui_ai/gemma-4-abliterated:12b", "huihui_ai/gemma-4-abliterated:26b", "huihui_ai/gemma-4-abliterated:31b",
      "huihui_ai/glm-4.7-flash-abliterated:latest", "huihui_ai/qwen3.5-abliterated:27b", "huihui_ai/qwen3.5-abliterated:4B", "huihui_ai/qwen3.5-abliterated:9b",
    ]);
    for (const m of SF) {
      expect(modeloValido(m), m.id).toBe(true);
      expect(m.clase).toBe("abliterated");
      expect(m.comprobado).toBe("2026-11-10");
      expect(m.estado).toBe("comprobado");
      expect(m.puntuacion).toBeNull(); // «sin medir»: nadie las evaluó
      expect(m.publicador).toMatch(/huihui_ai/);
      expect(m.fuentes.length).toBeGreaterThan(0);
      expect(m.fuentes.every((f) => f.startsWith("https://ollama.com/huihui_ai/"))).toBe(true);
      expect(CAT.find((b) => b.id === m.baseId && b.clase === "normal"), `base de ${m.id}`).toBeTruthy();
      expect(listableSinFiltros(m)).toBe(true);
      expect(recomendable(m)).toBe(false); // jamás «recomendable»
      expect(idSinFiltros(m.id)).toBe(true);
    }
  });
  it("sin rastro de la API de pago ni de terceros no verificados", () => {
    const todo = JSON.stringify(semilla);
    expect(todo).not.toMatch(/abliteration\.ai|orcarouter|eriktonon|api\.|price/i);
  });
  it("la puntuación visible es la de la BASE y solo donde la base la tiene; la propia siempre null", () => {
    expect(puntuacionDeBase(sf("huihui_ai/qwen3.5-abliterated:9b"), CAT)?.eci).toBe(139.35);
    expect(puntuacionDeBase(sf("huihui_ai/gemma-4-abliterated:26b"), CAT)?.eci).toBe(141.7);
    expect(puntuacionDeBase(sf("huihui_ai/gemma-4-abliterated:31b"), CAT)?.eci).toBe(144.24);
    expect(puntuacionDeBase(sf("huihui_ai/qwen3.5-abliterated:4B"), CAT)).toBeNull();
    expect(puntuacionDeBase(sf("huihui_ai/glm-4.7-flash-abliterated:latest"), CAT)).toBeNull();
  });
  it("DeepSeek-R1 sin filtros PIERDE herramientas (y lo dice); las demás las conservan", () => {
    expect(pierdeHerramientas(sf("huihui_ai/deepseek-r1-abliterated:8b"), CAT)).toBe(true);
    expect(sf("huihui_ai/deepseek-r1-abliterated:8b").nota).toMatch(/PIERDE/);
    for (const m of SF.filter((x) => !x.id.includes("deepseek"))) expect(pierdeHerramientas(m, CAT), m.id).toBe(false);
  });
  it("no se lista nada sin verificar: sin-comprobar, sin fecha, otro publicador, otra fuente o con puntuación propia", () => {
    const m = sf("huihui_ai/qwen3.5-abliterated:9b");
    expect(listableSinFiltros({ ...m, estado: "sin-comprobar" })).toBe(false);
    expect(listableSinFiltros({ ...m, estado: "candidato" })).toBe(false);
    expect(listableSinFiltros({ ...m, comprobado: null })).toBe(false);
    expect(modeloValido({ ...m, id: "otro_usuario/qwen3.5-abliterated:9b", fuentes: ["https://ollama.com/otro_usuario/qwen3.5-abliterated/tags"] })).toBe(false);
    expect(modeloValido({ ...m, fuentes: ["https://abliteration.ai/v1/models"] })).toBe(false);
    expect(modeloValido({ ...m, fuentes: ["https://ollama.com/library/qwen3.5/tags"] })).toBe(false);
    expect(modeloValido({ ...m, fuentes: [] })).toBe(false);
    expect(modeloValido({ ...m, baseId: undefined })).toBe(false);
    expect(modeloValido({ ...m, runtimes: ["webgpu"] })).toBe(false);
    expect(modeloValido({ ...m, puntuacion: { eci: 150, fecha: "2026-01-01", nombreEpoch: "x", fuente: "x", comprobado: "2026-11-10" } })).toBe(false);
  });
  it("un catálogo guardado ANTES (solo normales) recibe las variantes de la semilla; una ya retirada no se repone", () => {
    const viejo = { ...semilla, modelos: semilla.modelos.filter((m) => m.clase === "normal") };
    expect(leerCatalogoModelos(JSON.parse(JSON.stringify(viejo))).modelos.filter((m) => m.clase === "abliterated")).toHaveLength(8);
    const retirada = { ...semilla, modelos: semilla.modelos.map((m) => (m.id === "huihui_ai/qwen3.5-abliterated:9b" ? { ...m, estado: "sin-comprobar" } : m)) };
    const leido = leerCatalogoModelos(JSON.parse(JSON.stringify(retirada)));
    expect(leido.modelos.find((m) => m.id === "huihui_ai/qwen3.5-abliterated:9b")?.estado).toBe("sin-comprobar");
    expect(leido.modelos.filter((m) => m.id === "huihui_ai/qwen3.5-abliterated:9b")).toHaveLength(1);
  });
});

describe("«Automático» NUNCA elige una variante sin filtros (interruptor apagado o encendido, en cualquier neurona)", () => {
  it("tabla neurona × caso: ni el modelo, ni la ruta, ni las alternativas, ni el reflejo son sin filtros", () => {
    for (const perfil of MUESTRA) {
      const todas = recomendarTodos({ catalogo: CAT, perfil, entorno: { pares: MUESTRA.filter((p) => p.id !== perfil.id) } });
      for (const caso of CASOS) {
        const r = todas[caso];
        for (const m of [r.modelo, r.modeloRuta, r.reflejo, ...r.alternativas]) expect(m?.clase ?? "normal", `${perfil.nombre} · ${caso}`).toBe("normal");
        expect(candidatosPara(CAT, perfil, caso).every((c) => c.m.clase === "normal")).toBe(true);
      }
    }
  });
  it("añadir las variantes al catálogo no cambia NI UNA recomendación automática", () => {
    const sin = CAT.filter((m) => m.clase === "normal");
    for (const perfil of MUESTRA) {
      for (const caso of CASOS) {
        const a = recomendar({ catalogo: sin, perfil, caso });
        const b = recomendar({ catalogo: CAT, perfil, caso });
        expect([b.modelo?.id, b.ruta.tipo, b.razon]).toEqual([a.modelo?.id, a.ruta.tipo, a.razon]);
      }
    }
  });
  it("por la malla tampoco: el modelo que otra neurona serviría nunca es una variante sin filtros", () => {
    const r = recomendar({ catalogo: CAT, perfil: mac8, caso: "codigo-agentes", entorno: { pares: [mac64] } });
    expect(r.modeloRuta?.clase ?? "normal").toBe("normal");
    expect(puedeServirseAOtraCuenta(sf("huihui_ai/qwen3.5-abliterated:9b"))).toBe(false);
    expect(puedeServirseAOtraCuenta(CAT.find((m) => m.id === "qwen3.5:9b")!)).toBe(true);
  });
});

describe("elección a mano: solo en privado, solo en tu neurona, y se impone en la función (no solo en la pantalla)", () => {
  const q9 = sf("huihui_ai/qwen3.5-abliterated:9b");
  const aplicar = (o: { perfil?: PerfilNeurona; caso: CasoUso; id?: string; sinFiltros?: { activado: boolean; disponible: boolean }; contexto?: ContextoUso | "omitido"; catalogo?: ModeloLocal[] }) => {
    const perfil = o.perfil ?? mac32;
    const catalogo = o.catalogo ?? CAT;
    return aplicarEleccionManual({
      catalogo, perfil, caso: o.caso, rec: recomendar({ catalogo, perfil, caso: o.caso }), idManual: o.id ?? q9.id,
      sinFiltros: o.sinFiltros ?? ENCENDIDO, ...(o.contexto === "omitido" ? {} : { contexto: o.contexto ?? "privado-propio" }),
    });
  };

  it("interruptor apagado: la elección se ignora y se dice por qué en una línea", () => {
    const u = aplicar({ caso: "conversacion", sinFiltros: { activado: false, disponible: true } });
    expect(u.sinFiltros).toBe(false);
    expect(u.modelo?.clase).toBe("normal");
    expect(u.aviso).toMatch(/apagado/);
    expect(u.aviso).toMatch(/versión normal/);
    expect(u.aviso).not.toMatch(/\n/);
  });
  it("encendido + privado propio + caso permitido: se usa la variante elegida", () => {
    for (const caso of ["conversacion", "archivos-privados", "vision"] as const) {
      const u = aplicar({ caso });
      expect(u.sinFiltros, caso).toBe(true);
      expect(u.modelo?.id).toBe(q9.id);
      expect(u.aviso).toBeNull();
    }
    expect(aplicar({ caso: "codigo-agentes" }).sinFiltros).toBe(true); // Qwen3.5 conserva herramientas
  });
  it("jamás en un contexto compartido, público, de fondo o ajeno (también si el contexto se omite)", () => {
    for (const contexto of ["compartido", "publico", "segundo-plano", "malla-ajena", "omitido"] as const) {
      for (const caso of CASOS) {
        const u = aplicar({ caso, contexto });
        expect(u.sinFiltros, `${contexto} · ${caso}`).toBe(false);
        expect(u.modelo?.clase ?? "normal").toBe("normal");
        expect(u.aviso, `${contexto} · ${caso}`).toMatch(/^No se usa «huihui_ai\/qwen3\.5-abliterated:9b»/);
      }
    }
    expect(aplicar({ caso: "conversacion", contexto: "compartido" }).aviso).toMatch(/bots, dots o asistentes de grupo/);
  });
  it("jamás en bots y dots, capas de conciencia, segundo plano ni voz, aunque el contexto sea privado", () => {
    for (const caso of ["bots-dots", "capas-conciencia", "segundo-plano", "voz"] as const) {
      const u = aplicar({ caso });
      expect(u.sinFiltros, caso).toBe(false);
      expect(u.modelo?.clase ?? "normal").toBe("normal");
      expect(u.aviso).toBeTruthy();
    }
    expect([...CASOS_SIN_FILTROS].sort()).toEqual(["archivos-privados", "codigo-agentes", "conversacion", "vision"]);
    expect(casosDe(q9).sort()).toEqual(["archivos-privados", "codigo-agentes", "conversacion", "vision"]);
  });
  it("una variante que perdió las herramientas no se ofrece ni se usa donde hacen falta", () => {
    const r1 = sf("huihui_ai/deepseek-r1-abliterated:8b");
    expect(casosDe(r1)).not.toContain("codigo-agentes");
    expect(casosDe(r1)).not.toContain("bots-dots");
    const u = aplicar({ caso: "codigo-agentes", id: r1.id });
    expect(u.sinFiltros).toBe(false);
    expect(u.aviso).toMatch(/perdió el uso de herramientas/);
    expect(aplicar({ caso: "conversacion", id: r1.id }).sinFiltros).toBe(true); // para charlar sí
    expect(aplicar({ caso: "vision", id: r1.id }).sinFiltros).toBe(false); // sin visión
  });
  it("perfil no disponible (menor) o variante retirada o que no cabe: vuelve a la normal", () => {
    expect(aplicar({ caso: "conversacion", sinFiltros: { activado: true, disponible: false } }).aviso).toMatch(/no están disponibles en este perfil/);
    const retirada = CAT.map((m) => (m.id === q9.id ? { ...m, estado: "sin-comprobar" as const } : m));
    expect(aplicar({ caso: "conversacion", catalogo: retirada }).aviso).toMatch(/ya no está comprobada/);
    const grande = sf("huihui_ai/gemma-4-abliterated:31b");
    expect(aplicar({ caso: "conversacion", id: grande.id, perfil: mac8 }).aviso).toMatch(/no cabe/);
    expect(aplicar({ caso: "conversacion", perfil: debil }).sinFiltros).toBe(false);
  });
  it("una elección normal pasa tal cual y sin elección no hay aviso", () => {
    expect(aplicar({ caso: "conversacion", id: "qwen3.5:9b" }).modelo?.id).toBe("qwen3.5:9b");
    expect(aplicar({ caso: "conversacion", id: null as unknown as string }).aviso).toBeNull();
  });
  it("PROPIEDAD: en toda combinación neurona × caso × contexto × variante × interruptor, solo se usa si TODAS las reglas se cumplen", () => {
    let usadas = 0;
    for (const perfil of MUESTRA) for (const caso of CASOS) for (const contexto of CONTEXTOS) for (const m of SF) for (const activado of [false, true]) for (const disponible of [false, true]) {
      const u = aplicarEleccionManual({ catalogo: CAT, perfil, caso, rec: rec(perfil, caso), idManual: m.id, sinFiltros: { activado, disponible }, contexto });
      if (u.sinFiltros) {
        usadas++;
        expect(activado && disponible && contexto === "privado-propio" && CASOS_SIN_FILTROS.has(caso)).toBe(true);
        if (caso === "codigo-agentes") expect(m.herramientas).toBe(true);
        expect(u.modelo?.id).toBe(m.id);
      } else {
        expect(u.modelo?.clase ?? "normal").toBe("normal");
      }
    }
    expect(usadas).toBeGreaterThan(0);
  });
  it("la pregunta de descarga avisa de que es de la comunidad y sin medir", () => {
    const plan = planInstalar(q9, mac32);
    expect(plan.pregunta).toMatch(/variante sin filtros publicada por la comunidad/);
    expect(plan.pregunta).toMatch(/6,6 GB de descarga/);
    expect(plan.comando).toBe("ollama pull huihui_ai/qwen3.5-abliterated:9b");
  });
});

describe("interruptor por perfil: apagado por defecto, migración, y apagarlo devuelve a «Automático»", () => {
  const almacenFalso = (init: Record<string, string> = {}): AlmacenTexto & { datos: Record<string, string> } => {
    const datos = { ...init };
    return { datos, getItem: (k) => datos[k] ?? null, setItem: (k, v) => { datos[k] = v; } };
  };
  it("las cuentas existentes (sin la clave) quedan con el interruptor APAGADO", () => {
    for (const viejo of [undefined, null, {}, { modo: "manual", porCaso: { conversacion: "qwen3.5:9b" } }, { auto: false }]) {
      const a = migrarAjustes(viejo);
      expect(a.variantesSinFiltros).toBe(false);
      expect(a.variantesConfirmadoEl).toBeNull();
    }
    expect(ajustesPredeterminados().variantesSinFiltros).toBe(false);
    expect(leerAjustes(almacenFalso()).variantesSinFiltros).toBe(false);
  });
  it("un «true» suelto, sin la confirmación fechada, no vale", () => {
    expect(migrarAjustes({ variantesSinFiltros: true }).variantesSinFiltros).toBe(false);
    expect(migrarAjustes({ variantesSinFiltros: true, variantesConfirmadoEl: "ayer" }).variantesSinFiltros).toBe(false);
    expect(migrarAjustes({ variantesSinFiltros: "sí", variantesConfirmadoEl: "2026-11-10" }).variantesSinFiltros).toBe(false);
    const ok = migrarAjustes({ variantesSinFiltros: true, variantesConfirmadoEl: "2026-11-10" });
    expect([ok.variantesSinFiltros, ok.variantesConfirmadoEl]).toEqual([true, "2026-11-10"]);
  });
  it("sin el interruptor, una elección manual guardada sobre una variante se descarta y el modo vuelve a Automático", () => {
    const a = migrarAjustes({ modo: "manual", porCaso: { conversacion: "huihui_ai/qwen3.5-abliterated:9b", vision: "huihui_ai/gemma-4-abliterated:26b" } });
    expect(a.porCaso).toEqual({});
    expect(a.modo).toBe("automatico");
    const mixta = migrarAjustes({ modo: "manual", porCaso: { conversacion: "huihui_ai/qwen3.5-abliterated:9b", codigo: "x", "codigo-agentes": "qwen3.5:9b" } });
    expect(mixta.porCaso).toEqual({ "codigo-agentes": "qwen3.5:9b" });
    expect(mixta.modo).toBe("manual");
  });
  it("encender guarda la confirmación; apagar esconde y devuelve cada elección sobre variantes a Automático", () => {
    const enc = activarVariantes({ ...ajustesPredeterminados(), modo: "manual", porCaso: { conversacion: "huihui_ai/qwen3.5-abliterated:9b", "archivos-privados": "huihui_ai/qwen3.5-abliterated:9b" } }, "2026-11-10");
    expect(enc.variantesSinFiltros).toBe(true);
    expect(enc.variantesConfirmadoEl).toBe("2026-11-10");
    const apagado = desactivarVariantes(enc, (id) => SF.some((m) => m.id === id));
    expect(apagado.variantesSinFiltros).toBe(false);
    expect(apagado.variantesConfirmadoEl).toBeNull();
    expect(apagado.porCaso).toEqual({});
    expect(apagado.modo).toBe("automatico");
    // lo manual sobre modelos normales se respeta
    const mixto = desactivarVariantes({ ...enc, porCaso: { conversacion: "huihui_ai/qwen3.5-abliterated:9b", vision: "gemma4:26b" } });
    expect(mixto.porCaso).toEqual({ vision: "gemma4:26b" });
    expect(mixto.modo).toBe("manual");
  });
  it("persiste por perfil y sobrevive a releer (round-trip)", () => {
    const al = almacenFalso();
    al.setItem(CLAVE_AJUSTES, JSON.stringify(activarVariantes(ajustesPredeterminados(), "2026-11-10")));
    expect(leerAjustes(al).variantesSinFiltros).toBe(true);
    al.setItem(CLAVE_AJUSTES, JSON.stringify(desactivarVariantes(leerAjustes(al))));
    expect(leerAjustes(al).variantesSinFiltros).toBe(false);
    al.setItem(CLAVE_CATALOGO, JSON.stringify({ ...semilla, modelos: semilla.modelos.filter((m) => m.clase === "normal") }));
    expect(leerCatalogoGuardado(al).modelos.filter((m) => m.clase === "abliterated")).toHaveLength(8);
  });
  it("menores: sin datos de edad en el perfil el gancho no bloquea (queda abierto); con datos, sí", () => {
    expect(variantesDisponibles().disponible).toBe(true);
    expect(variantesDisponibles({ esMenor: true }).disponible).toBe(false);
    expect(variantesDisponibles({ edad: 16 }).disponible).toBe(false);
    expect(variantesDisponibles({ edad: 18 }).disponible).toBe(true);
    expect(variantesDisponibles({ controlParental: true }).motivo).toMatch(/control parental/);
  });
  it("la explicación única dice las tres cosas: qué son, calidad sin medir/herramientas, y responsabilidad", () => {
    const t = EXPLICACION_SIN_FILTROS.join(" ");
    expect(t).toMatch(/quitó los rechazos/);
    expect(t).toMatch(/no está medida/);
    expect(t).toMatch(/pierden el uso de herramientas/);
    expect(t).toMatch(/responsabilidad tuya/);
  });
});

describe("autoactualización diaria: cubre la clase y suelta lo que desaparece", () => {
  const fila = (tag: string, gb: string, ctx: number, entrada = "Text, Image") =>
    `<a href="/${tag}" class="md:hidden flex flex-col"><span>${tag.split("/")[1]}</span><span class="font-mono">abc123</span> • ${gb}GB • ${ctx}K context window  •\n<span class="hidden sm:inline">\n ${entrada} input • 8 months ago</span></a>`;
  const PAG_QWEN = [fila("huihui_ai/qwen3.5-abliterated:9b", "6.6", 256), fila("huihui_ai/qwen3.5-abliterated:27b", "17", 256)].join("\n");
  const hoy = "2026-12-01";

  it("lee las etiquetas con usuario y las insignias de la página de la variante", () => {
    const filas = parsearTagsOllama(PAG_QWEN);
    expect(filas.map((f) => [f.tag, f.descargaGb, f.contextoK, f.vision])).toEqual([["huihui_ai/qwen3.5-abliterated:9b", 6.6, 256, true], ["huihui_ai/qwen3.5-abliterated:27b", 17, 256, true]]);
    expect(parsearTagsOllama(fila("huihui_ai/deepseek-r1-abliterated:8b", "5.0", 128, "Text"))[0].vision).toBe(false);
    expect(parsearTagsOllama(fila("qwen3.5:9b", "6.6", 256))[0].tag).toBe("qwen3.5:9b"); // lo de la biblioteca oficial sigue igual
    const pagina = `<div class="mb-0 flex flex-wrap gap-2"><span class="x">thinking</span></div>`.replace('<span class="x">thinking</span>', '<span class="x">tools</span><span>thinking</span>');
    expect(parsearCapacidadesOllama(pagina)).toEqual({ tools: true, vision: false, thinking: true });
  });
  it("lista cerrada: solo las páginas del publicador de la lista", () => {
    expect(urlPermitida(urlTags("huihui_ai/qwen3.5-abliterated"))).toBe(true);
    expect(urlPermitida("https://ollama.com/huihui_ai/gemma-4-abliterated")).toBe(true);
    for (const u of ["https://ollama.com/orcarouter/Qwen3.8-27B-Uncensored/tags", "https://ollama.com/eriktonon/x", "https://abliteration.ai/v1/models", "https://ollama.com/huihui_ai/x/y/z"]) expect(urlPermitida(u), u).toBe(false);
  });
  it("una etiqueta que sigue se vuelve a comprobar; la que desaparece se retira y deja de listarse", () => {
    const { catalogo, cambios } = fusionar(semilla, { hoy, tags: { "huihui_ai/qwen3.5-abliterated": parsearTagsOllama(PAG_QWEN) } });
    const nueve = catalogo.modelos.find((m) => m.id === "huihui_ai/qwen3.5-abliterated:9b")!;
    expect([nueve.estado, nueve.comprobado]).toEqual(["comprobado", hoy]);
    expect(listableSinFiltros(nueve)).toBe(true);
    const cuatro = catalogo.modelos.find((m) => m.id === "huihui_ai/qwen3.5-abliterated:4B")!;
    expect(cuatro.estado).toBe("sin-comprobar");
    expect(listableSinFiltros(cuatro)).toBe(false);
    expect(cambios.some((c) => c.tipo === "retirado" && c.id === cuatro.id)).toBe(true);
    // lo de las otras familias, intacto
    expect(catalogo.modelos.find((m) => m.id === "huihui_ai/gemma-4-abliterated:26b")?.estado).toBe("comprobado");
  });
  it("una fuente caída o ilegible NO retira nada; las herramientas se actualizan con la página viva y la puntuación sigue siendo null", () => {
    const igual = fusionar(semilla, { hoy, tags: { "huihui_ai/qwen3.5-abliterated": null } }).catalogo;
    expect(igual.modelos.filter((m) => m.clase === "abliterated").every((m) => m.estado === "comprobado")).toBe(true);
    const sinTools = fusionar(semilla, { hoy, caps: { "huihui_ai/qwen3.5-abliterated": { tools: false, vision: true, thinking: true } } }).catalogo;
    const q = sinTools.modelos.find((m) => m.id === "huihui_ai/qwen3.5-abliterated:9b")!;
    expect(q.herramientas).toBe(false);
    expect(pierdeHerramientas(q, sinTools.modelos)).toBe(true);
    const conEci = fusionar(semilla, { hoy, eci: [{ nombre: "Qwen3.5-9B", eci: 140, fecha: "2026-02-24", grupo: "Open weights" }] }).catalogo;
    expect(conEci.modelos.filter((m) => m.clase === "abliterated").every((m) => m.puntuacion === null)).toBe(true);
  });
  it("revisarFuentes consulta las páginas de las variantes (solo permitidas), retira lo que falta y nunca toca la API de pago", async () => {
    const pedidas: string[] = [];
    const traer = async (url: string): Promise<string> => {
      pedidas.push(url);
      if (url === "https://ollama.com/huihui_ai/qwen3.5-abliterated/tags") return PAG_QWEN;
      throw new Error("sin respuesta");
    };
    const r = await revisarFuentes(semilla, hoy, traer, {});
    expect(r.revisado).toBe(true);
    expect(pedidas).toContain("https://ollama.com/huihui_ai/qwen3.5-abliterated/tags");
    expect(pedidas).toContain("https://ollama.com/huihui_ai/gemma-4-abliterated");
    expect(pedidas.every((u) => urlPermitida(u))).toBe(true);
    expect(pedidas.join(" ")).not.toMatch(/abliteration\.ai/);
    expect(r.catalogo.modelos.find((m) => m.id === "huihui_ai/qwen3.5-abliterated:4B")?.estado).toBe("sin-comprobar");
    expect(r.catalogo.modelos.find((m) => m.id === URL_ECI)).toBeUndefined();
    expect([URL_ECI, URL_INDICE_OLLAMA].every((u) => urlPermitida(u))).toBe(true);
  });
});
