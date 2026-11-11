// Instalación guiada de Ollama (MOD1110B): pregunta primero, lista de anfitriones oficiales, cancelar, fallo, detección posterior,
// y que la app nativa (Rust) y la web digan lo mismo.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  abrirInstaladorOllama,
  COMANDOS_NATIVOS_OLLAMA, COMANDO_LINUX_OLLAMA, FICHAS_OLLAMA, instalarOllamaGuiado, nativoOllamaDesde, preguntaOllama, sistemaOllama, sondearOllama,
  tamanoLegible, urlOficialOllama, vigilarOllama, type NativoOllama, type ProgresoNativoOllama,
} from "../instalar-ollama";
import { planInstalar } from "../instalar";
import { construirPerfilNeurona } from "../perfil-neurona";
import { catalogoSemilla } from "../catalogo-datos";
import { recomendar } from "../recomendar";

const UA_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";
const UA_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/120";
const UA_LIN = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15";
const UA_AND = "Mozilla/5.0 (Linux; Android 16; SM-X900) AppleWebKit/537.36";

function nativoFalso(o: { disponible?: boolean; descarga?: "ok" | "cancelada" | "fallo"; abre?: boolean } = {}) {
  const llamadas: string[] = [];
  const progresos: Array<(p: ProgresoNativoOllama) => void> = [];
  const n: NativoOllama = {
    disponible: o.disponible ?? true,
    descargar: vi.fn(async (sistema) => {
      llamadas.push(`descargar:${sistema}`);
      progresos.forEach((cb) => cb({ fase: "descargando", descargado: 50, total: 100, porcentaje: 50 }));
      if (o.descarga === "cancelada") return { ok: false as const, motivo: "Descarga cancelada: no se guardó nada." };
      if (o.descarga === "fallo") return { ok: false as const, motivo: "La descarga no se completó (10 de 230 MB): se borró lo bajado" };
      return { ok: true as const, valor: { ruta: "/Users/x/Downloads/Ollama.dmg", bytes: 229_996_388 } };
    }),
    cancelar: vi.fn(async () => true),
    abrir: vi.fn(async (ruta) => {
      llamadas.push(`abrir:${ruta}`);
      return o.abre === false ? { ok: false as const, motivo: "sin programa" } : { ok: true as const, valor: null };
    }),
    alProgresar: vi.fn(async (cb) => { progresos.push(cb); return () => { progresos.length = 0; llamadas.push("quitar"); }; }),
  };
  return { n, llamadas };
}

describe("sistema y ficha, con los datos comprobados el 2026-11-10", () => {
  it("detecta el sistema de la neurona", () => {
    expect(sistemaOllama({ plataforma: "tauri", userAgent: UA_MAC })).toBe("macos");
    expect(sistemaOllama({ plataforma: "tauri", userAgent: UA_WIN })).toBe("windows");
    expect(sistemaOllama({ plataforma: "tauri", userAgent: UA_LIN })).toBe("linux");
    expect(sistemaOllama({ plataforma: "android", userAgent: UA_AND })).toBe("android");
    expect(sistemaOllama({ plataforma: "tauri", userAgent: UA_AND })).toBe("android");
    expect(sistemaOllama({ plataforma: "web", userAgent: UA_MAC })).toBe("web");
    expect(sistemaOllama({ plataforma: "pwa", userAgent: UA_WIN })).toBe("web");
  });
  it("macOS y Windows descargan el instalador oficial con su tamaño comprobado; Linux, instrucciones; Android y web, nada", () => {
    expect(FICHAS_OLLAMA.macos).toMatchObject({ accion: "descargar-instalador", archivo: "Ollama.dmg", url: "https://ollama.com/download/Ollama.dmg", bytes: 229_996_388, verificado: "2026-11-10" });
    expect(FICHAS_OLLAMA.windows).toMatchObject({ accion: "descargar-instalador", archivo: "OllamaSetup.exe", url: "https://ollama.com/download/OllamaSetup.exe", bytes: 1_857_663_944 });
    expect(FICHAS_OLLAMA.linux).toMatchObject({ accion: "instrucciones", url: null, comando: COMANDO_LINUX_OLLAMA });
    expect(FICHAS_OLLAMA.android.accion).toBe("no-corre-aqui");
    expect(FICHAS_OLLAMA.web.accion).toBe("no-corre-aqui");
    expect(tamanoLegible(229_996_388)).toBe("230 MB");
    expect(tamanoLegible(1_857_663_944)).toBe("1,86 GB");
  });
});

describe("la pregunta se enseña ANTES de hacer nada", () => {
  it("dice qué es, quién lo publica, el tamaño con su fecha, dónde se instala y que solo baja el instalador oficial", () => {
    const p = preguntaOllama(FICHAS_OLLAMA.windows);
    const t = p.lineas.join("\n");
    expect(p.titulo).toMatch(/Instalar Ollama/);
    expect(t).toMatch(/ejecuta modelos de IA en tu propio aparato/);
    expect(t).toMatch(/proyecto Ollama \(ollama\.com\)/);
    expect(t).toMatch(/1,86 GB \(comprobado el 2026-11-10/);
    expect(t).toMatch(/carpeta Descargas/);
    expect(t).toMatch(/Dónde se instala: En tu carpeta de usuario/);
    expect(t).toMatch(/instalador OFICIAL.*y nada más/);
    expect(t).toMatch(/NO ejecuta el instalador por su cuenta ni pide permisos de administrador/);
    expect(t).toMatch(/No empieza nada hasta que aceptes/);
    expect(p.botonConfirmar).toBe("Descargar el instalador (1,86 GB)");
    expect(preguntaOllama(FICHAS_OLLAMA.macos).botonConfirmar).toBe("Descargar el instalador (230 MB)");
  });
  it("Linux ofrece copiar el comando oficial y no tiene botón de ejecutar; Android y web dicen que no corre y qué sí", () => {
    const l = preguntaOllama(FICHAS_OLLAMA.linux);
    expect(l.comando).toBe("curl -fsSL https://ollama.com/install.sh | sh");
    expect(l.botonConfirmar).toBeNull();
    expect(l.lineas.join(" ")).toMatch(/no ejecuta ningún instalador/);
    for (const s of ["android", "web"] as const) {
      const p = preguntaOllama(FICHAS_OLLAMA[s]);
      expect(p.botonConfirmar).toBeNull();
      expect(p.lineas.join(" ")).toMatch(/capas ligeras de Astraura/);
      expect(p.lineas.join(" ")).toMatch(/otra neurona de tu misma cuenta por la malla/);
    }
  });
});

describe("lista de anfitriones oficiales", () => {
  it("acepta las descargas oficiales y su redirección real (GitHub Releases y su CDN)", () => {
    for (const u of [
      "https://ollama.com/download/Ollama.dmg", "https://ollama.com/download/OllamaSetup.exe",
      "https://github.com/ollama/ollama/releases/latest/download/Ollama.dmg",
      "https://github.com/ollama/ollama/releases/download/v0.40.16/OllamaSetup.exe",
      "https://release-assets.githubusercontent.com/github-production-release-asset/658928958/e42e83a2?sp=r",
    ]) expect(urlOficialOllama(u), u).toBe(true);
  });
  it("rechaza todo lo demás", () => {
    for (const u of [
      "http://ollama.com/download/Ollama.dmg", "https://ollama.com.evil.example/download/Ollama.dmg", "https://ollama.com@evil.example/download/Ollama.dmg",
      "https://ollama.com:8443/download/Ollama.dmg", "https://ollama.com/install.sh", "https://ollama.com/download/../install.sh",
      "https://github.com/otro/repo/releases/download/v1/Ollama.dmg", "https://evil.example/Ollama.dmg", "https://raw.githubusercontent.com/ollama/ollama/main/x",
      "https://objects.githubusercontent.com/github-production-release-asset/1", "ftp://ollama.com/download/Ollama.dmg", "no es url", "",
    ]) expect(urlOficialOllama(u), u).toBe(false);
  });
  it("las URLs de las fichas son oficiales", () => {
    for (const f of Object.values(FICHAS_OLLAMA)) if (f.url) expect(urlOficialOllama(f.url)).toBe(true);
  });
});

describe("flujo por sistema", () => {
  it("SIN confirmar no se toca nada (ni la app nativa)", async () => {
    const { n, llamadas } = nativoFalso();
    const r = await instalarOllamaGuiado(FICHAS_OLLAMA.macos, { confirmado: false, nativo: n });
    expect(r.estado).toBe("sin-confirmar");
    expect(llamadas).toEqual([]);
    expect(n.alProgresar).not.toHaveBeenCalled();
  });
  it("macOS y Windows confirmados: descarga el de SU sistema, lo ABRE (no lo ejecuta) y deja progreso", async () => {
    for (const s of ["macos", "windows"] as const) {
      const { n, llamadas } = nativoFalso();
      const visto: number[] = [];
      const r = await instalarOllamaGuiado(FICHAS_OLLAMA[s], { confirmado: true, nativo: n, onProgreso: (p) => visto.push(p.porcentaje) });
      expect(llamadas).toEqual([`descargar:${s}`, "abrir:/Users/x/Downloads/Ollama.dmg", "quitar"]);
      expect(r.estado).toBe("abierto");
      expect(r.mensaje).toMatch(/Completa la instalación/);
      expect(visto).toEqual([50]);
      expect(n.abrir).toHaveBeenCalledWith("/Users/x/Downloads/Ollama.dmg");
    }
  });
  it("Linux: nunca descarga ni abre nada, aunque se pida", async () => {
    const { n, llamadas } = nativoFalso();
    const r = await instalarOllamaGuiado(FICHAS_OLLAMA.linux, { confirmado: true, nativo: n });
    expect(r.estado).toBe("no-disponible");
    expect(r.mensaje).toMatch(/no ejecuta instaladores/);
    expect(llamadas).toEqual([]);
  });
  it("Android y web: dice que no corre y no llama a la app", async () => {
    for (const s of ["android", "web"] as const) {
      const { n, llamadas } = nativoFalso();
      const r = await instalarOllamaGuiado(FICHAS_OLLAMA[s], { confirmado: true, nativo: n });
      expect(r.estado).toBe("no-disponible");
      expect(llamadas).toEqual([]);
    }
  });
  it("sin app nativa (la web en escritorio): lo dice y manda a ollama.com/download", async () => {
    const { n, llamadas } = nativoFalso({ disponible: false });
    const r = await instalarOllamaGuiado(FICHAS_OLLAMA.macos, { confirmado: true, nativo: n });
    expect(r.estado).toBe("no-disponible");
    expect(r.mensaje).toMatch(/ollama\.com\/download/);
    expect(llamadas).toEqual([]);
  });
  it("una URL que no es oficial se rechaza ANTES de llamar a la app", async () => {
    const { n, llamadas } = nativoFalso();
    const r = await instalarOllamaGuiado({ ...FICHAS_OLLAMA.macos, url: "https://evil.example/Ollama.dmg" }, { confirmado: true, nativo: n });
    expect(r.estado).toBe("rechazada");
    expect(llamadas).toEqual([]);
  });
  it("cancelar: no se abre nada, no se instala nada y se dice", async () => {
    const { n, llamadas } = nativoFalso({ descarga: "cancelada" });
    const r = await instalarOllamaGuiado(FICHAS_OLLAMA.macos, { confirmado: true, nativo: n });
    expect(r.estado).toBe("cancelada");
    expect(r.mensaje).toMatch(/no se guardó nada y no se instaló nada/);
    expect(llamadas.some((l) => l.startsWith("abrir"))).toBe(false);
  });
  it("fallo de descarga: no se abre nada, no queda nada a medias, y dice qué puede hacer la persona", async () => {
    const { n, llamadas } = nativoFalso({ descarga: "fallo" });
    const r = await instalarOllamaGuiado(FICHAS_OLLAMA.windows, { confirmado: true, nativo: n });
    expect(r.estado).toBe("fallo");
    expect(r.mensaje).toMatch(/No quedó nada a medias/);
    expect(r.mensaje).toMatch(/volver a intentarlo|ollama\.com\/download/);
    expect(r.mensaje).toMatch(/capas ligeras/);
    expect(llamadas.some((l) => l.startsWith("abrir"))).toBe(false);
  });
  it("si se descarga pero no se puede abrir, dice dónde está", async () => {
    const { n } = nativoFalso({ abre: false });
    const r = await instalarOllamaGuiado(FICHAS_OLLAMA.macos, { confirmado: true, nativo: n });
    expect(r.estado).toBe("descargado-sin-abrir");
    expect(r.mensaje).toMatch(/carpeta Descargas/);
  });
});

describe("envoltorio del puente nativo", () => {
  it("llama a los comandos con sus argumentos y traduce el evento de progreso", async () => {
    const llamadas: Array<[string, unknown]> = [];
    const escucha: { cb?: (p: unknown) => void } = {};
    const n = nativoOllamaDesde({
      disponible: true,
      llamar: (async (cmd: string, args?: Record<string, unknown>) => { llamadas.push([cmd, args]); return { ok: true, valor: cmd.endsWith("cancelar") ? true : null }; }) as never,
      escuchar: async (ev, cb) => { expect(ev).toBe("starseed://ollama-descarga"); escucha.cb = cb; return () => {}; },
    });
    await n.descargar("macos");
    expect(await n.cancelar()).toBe(true);
    await n.abrir("/x/Ollama.dmg", true);
    expect(llamadas).toEqual([
      ["ollama_instalador_descargar", { sistema: "macos" }],
      ["ollama_instalador_cancelar", undefined],
      ["ollama_instalador_abrir", { ruta: "/x/Ollama.dmg", revelar: true }],
    ]);
    const vistos: ProgresoNativoOllama[] = [];
    await n.alProgresar((p) => vistos.push(p));
    escucha.cb!({ fase: "descargando", descargado: 5, total: 10, porcentaje: 50 });
    escucha.cb!({ basura: true });
    expect(vistos).toEqual([{ fase: "descargando", descargado: 5, total: 10, porcentaje: 50 }]);
  });
});

describe("detección posterior", () => {
  it("sondearOllama: responde sí/no y nunca lanza", async () => {
    expect(await sondearOllama(async () => ({ ok: true, status: 200 }))).toBe(true);
    expect(await sondearOllama(async () => ({ ok: false, status: 500 }))).toBe(false);
    expect(await sondearOllama(async () => { throw new Error("bloqueado"); })).toBe(false);
  });
  it("vigilarOllama mira con suavidad, avisa UNA vez cuando responde y se puede parar", async () => {
    let t = 0;
    const tareas: Array<{ f: () => void; en: number }> = [];
    let respuestas = [false, false, true];
    const sondear = vi.fn(async () => respuestas.shift() ?? true);
    const alDetectar = vi.fn();
    const parar = vigilarOllama({
      sondear, alDetectar, intervaloMs: 5000, programar: (f, ms) => { tareas.push({ f, en: t + ms }); return tareas.length; }, cancelarProgramado: () => {}, ahora: () => t,
    });
    const correr = async () => { const x = tareas.shift()!; t = x.en; x.f(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
    await correr(); await correr();
    expect(alDetectar).not.toHaveBeenCalled();
    await correr();
    expect(alDetectar).toHaveBeenCalledTimes(1);
    expect(sondear).toHaveBeenCalledTimes(3);
    expect(tareas).toHaveLength(0); // ya no sigue mirando
    parar();
  });
  it("vigilarOllama se detiene al cerrar el cuadro y a los 30 minutos", async () => {
    let t = 0;
    const tareas: Array<{ f: () => void; en: number }> = [];
    const sondear = vi.fn(async () => false);
    const parar = vigilarOllama({ sondear, alDetectar: vi.fn(), programar: (f, ms) => { tareas.push({ f, en: t + ms }); return 1; }, cancelarProgramado: () => { tareas.length = 0; }, ahora: () => t });
    parar();
    expect(tareas).toHaveLength(0);
    const tope: Array<{ f: () => void }> = [];
    vigilarOllama({ sondear, alDetectar: vi.fn(), intervaloMs: 1000, maxMs: 3000, programar: (f) => { tope.push({ f }); return 1; }, cancelarProgramado: () => {}, ahora: () => (t += 1500) });
    for (let i = 0; i < 6 && tope.length; i++) { tope.shift()!.f(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }
    expect(tope).toHaveLength(0);
  });
  it("tras detectar Ollama, el recomendador sigue con el modelo que había recomendado, con la pregunta y el tamaño de siempre", () => {
    const catalogo = catalogoSemilla().modelos;
    const sin = construirPerfilNeurona({ id: "m", plataforma: "tauri", gpuRenderer: "Apple M2 Max", ramGb: 32, ramReal: true, discoLibreGb: 300, ollama: false, backend158: true, webgpu: true });
    const antes = recomendar({ catalogo, perfil: sin, caso: "conversacion" });
    expect(sin.puedeInstalarOllama).toBe(true);
    expect(antes.abriria).toBeGreaterThan(0); // sin Ollama: solo capas, y dice cuántos modelos abriría instalarlo
    const modelo = catalogo.find((m) => m.id === "gemma4:26b")!;
    const bloqueado = planInstalar(modelo, sin);
    expect(bloqueado.faltaOllama).toBe(true);
    expect(bloqueado.bloqueo).toMatch(/Instalar Ollama/);
    const con = { ...sin, runtimes: [...sin.runtimes, "ollama" as const], puedeInstalarOllama: false };
    const despues = recomendar({ catalogo, perfil: con, caso: "conversacion" });
    expect(despues.modelo?.id).toBe("gemma4:26b");
    const plan = planInstalar(modelo, con);
    expect(plan.bloqueo).toBeNull();
    expect(plan.pregunta).toMatch(/16,0 GB de descarga/);
    expect(plan.pregunta).toMatch(/No se descarga nada hasta que aceptes/);
  });
});

describe("la web y la app nativa (Rust) dicen lo mismo", () => {
  const raiz = process.cwd();
  const rust = readFileSync(join(raiz, "native/src-tauri/src/ollama_instalador.rs"), "utf8");
  const lib = readFileSync(join(raiz, "native/src-tauri/src/lib.rs"), "utf8");
  const build = readFileSync(join(raiz, "native/src-tauri/build.rs"), "utf8");
  const escritorio = JSON.parse(readFileSync(join(raiz, "native/src-tauri/capabilities/desktop.json"), "utf8")) as { permissions: string[] };
  const defecto = JSON.parse(readFileSync(join(raiz, "native/src-tauri/capabilities/default.json"), "utf8")) as { permissions: string[] };

  it("los tres comandos y el evento existen, están registrados SOLO en escritorio y con permiso", () => {
    const { descargar, cancelar, abrir, evento } = COMANDOS_NATIVOS_OLLAMA;
    for (const c of [descargar, cancelar, abrir]) {
      expect(rust).toMatch(new RegExp(`pub (async )?fn ${c}\\(`));
      expect(lib).toContain(`ollama_instalador::${c}`);
      expect(build).toContain(`"${c}"`);
      expect(escritorio.permissions).toContain(`allow-${c.replace(/_/g, "-")}`);
      expect(defecto.permissions).not.toContain(`allow-${c.replace(/_/g, "-")}`);
    }
    expect(rust).toContain(`pub const EVENTO_OLLAMA: &str = "${evento}";`);
    expect(lib).toMatch(/#\[cfg\(desktop\)\]\s*mod ollama_instalador;/);
    // los campos del progreso coinciden
    expect([...rust.match(/pub struct ProgresoOllama \{([\s\S]*?)\n\}/)![1].matchAll(/pub (\w+):/g)].map((m) => m[1]).sort()).toEqual(["descargado", "fase", "porcentaje", "total"]);
  });
  it("Rust guarda las mismas URL, nombres y anfitriones que la web", () => {
    expect(rust).toContain(`"${FICHAS_OLLAMA.macos.archivo}", "${FICHAS_OLLAMA.macos.url}"`);
    expect(rust).toContain(`"${FICHAS_OLLAMA.windows.archivo}", "${FICHAS_OLLAMA.windows.url}"`);
    for (const h of ["ollama.com", "github.com", "release-assets.githubusercontent.com"]) expect(rust).toContain(`"${h}"`);
    expect(rust).toContain("/ollama/ollama/releases/");
    expect(rust).toContain("/github-production-release-asset/");
  });
  it("Rust no ejecuta el instalador por su cuenta ni pide privilegios (solo open / explorer) y no toca Linux", () => {
    const codigo = rust.split("#[cfg(test)]")[0].replace(/^\s*\/\/.*$/gm, "");
    expect(codigo).not.toMatch(/runas|sudo|pkexec|osascript|msiexec|\/S\b|\/VERYSILENT|install\.sh|\| *sh/);
    expect(codigo).toMatch(/orden\("open"\)/);
    expect(codigo).toMatch(/orden\("explorer\.exe"\)/);
    expect(codigo).toMatch(/"linux" => Err\(/);
  });
});

// (SEG1111U) Abrir el instalador ejecuta un programa: la app exige «acceso al equipo» y un «sí» nativo.
describe("abrir el instalador con «acceso al equipo» (SEG1111U)", () => {
  const SIN = "acceso:sin-concesion · hace falta «acceso al equipo» en esta neurona";
  function nativoConAcceso(o: { concede: boolean; confirma?: boolean }) {
    const llamadas: string[] = [];
    let dado = false;
    const n: NativoOllama = {
      disponible: true,
      descargar: vi.fn(async () => ({ ok: true as const, valor: { ruta: "/Users/x/Downloads/Ollama.dmg", bytes: 229_996_388 } })),
      cancelar: vi.fn(async () => true),
      abrir: vi.fn(async () => {
        llamadas.push(`abrir:${dado ? "con" : "sin"}`);
        if (!dado) return { ok: false as const, motivo: SIN };
        if (o.confirma === false) return { ok: false as const, motivo: "acceso:no-confirmado · no confirmaste esta orden" };
        return { ok: true as const, valor: null };
      }),
      alProgresar: vi.fn(async () => () => {}),
      pedirAcceso: vi.fn(async (motivo: string) => {
        llamadas.push(`pedir:${motivo}`);
        if (!o.concede) return { ok: false as const, motivo: "acceso:no-confirmado · no" };
        dado = true;
        return { ok: true as const, valor: { activo: true } };
      }),
    };
    return { n, llamadas };
  }

  it("sin acceso: pide el diálogo nativo UNA vez, y con el «sí» abre como antes", async () => {
    const { n, llamadas } = nativoConAcceso({ concede: true });
    const r = await instalarOllamaGuiado(FICHAS_OLLAMA.macos, { confirmado: true, nativo: n });
    expect(r.estado).toBe("abierto");
    expect(llamadas).toEqual(["abrir:sin", "pedir:abrir el instalador de Ollama", "abrir:con"]);
  });

  it("si la persona no da el acceso, lo dice en palabras claras y deja el instalador en Descargas", async () => {
    const { n, llamadas } = nativoConAcceso({ concede: false });
    const r = await instalarOllamaGuiado(FICHAS_OLLAMA.macos, { confirmado: true, nativo: n });
    expect(r.estado).toBe("necesita-acceso");
    expect(r.ruta).toBe("/Users/x/Downloads/Ollama.dmg");
    expect(r.mensaje).toMatch(/«acceso al equipo»/);
    expect(r.mensaje).toMatch(/Descargas/);
    expect(r.mensaje).not.toMatch(/acceso:/);
    expect(llamadas.filter((l) => l.startsWith("pedir"))).toHaveLength(1);
  });

  it("con acceso pero sin confirmar la apertura: no se abre y se dice por qué", async () => {
    const { n } = nativoConAcceso({ concede: true, confirma: false });
    const r = await instalarOllamaGuiado(FICHAS_OLLAMA.macos, { confirmado: true, nativo: n });
    expect(r.estado).toBe("descargado-sin-abrir");
    expect(r.mensaje).toMatch(/no lo confirmaste/);
  });

  it("el botón «Dar acceso al equipo y abrir» reintenta solo la apertura", async () => {
    const { n, llamadas } = nativoConAcceso({ concede: true });
    const r = await abrirInstaladorOllama(FICHAS_OLLAMA.windows, n, "C:/Users/x/Downloads/OllamaSetup.exe");
    expect(r.estado).toBe("abierto");
    expect(n.descargar).not.toHaveBeenCalled();
    expect(llamadas).toContain("abrir:con");
  });

  it("el envoltorio pide el acceso con acceso_equipo_pedir y su motivo", async () => {
    const llamadas: Array<[string, unknown]> = [];
    const n = nativoOllamaDesde({
      disponible: true,
      llamar: (async (cmd: string, args?: Record<string, unknown>) => { llamadas.push([cmd, args]); return { ok: true, valor: { activo: true } }; }) as never,
      escuchar: async () => () => {},
    });
    await n.pedirAcceso!("abrir el instalador de Ollama");
    expect(llamadas).toEqual([["acceso_equipo_pedir", { motivo: "abrir el instalador de Ollama" }]]);
  });

  it("Rust: abrir (no «revelar») pasa por la puerta del acceso, el archivo propio y el «sí» nativo", () => {
    const rust = readFileSync(join(process.cwd(), "native/src-tauri/src/ollama_instalador.rs"), "utf8");
    const cuerpo = rust.slice(rust.indexOf("pub async fn ollama_instalador_abrir("), rust.indexOf("#[cfg(test)]"));
    expect(cuerpo).toMatch(/if !revelar \{\s*let origen = crate::acceso_equipo::exigir\(&app, &webview/);
    expect(cuerpo).toContain("es_el_descargado(");
    expect(cuerpo).toContain("crate::acceso_equipo::confirmar(");
    expect(cuerpo.indexOf("acceso_equipo::confirmar(")).toBeLessThan(cuerpo.indexOf('orden("open")'));
  });
});
