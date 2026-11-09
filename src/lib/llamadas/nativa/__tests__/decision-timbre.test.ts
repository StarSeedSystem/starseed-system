import { beforeEach, describe, expect, it } from "vitest";
import { cargaIniciarNativo, claveParaAmbito, decidirTimbre, estaIgnorada, ignorarLlamada, inicialesDe, silencioDesdeEvento, SIN_FIN_NATIVO, __reiniciarIgnoradas } from "../decision-timbre";
import { crearSilencio } from "../../silencio-llamadas";
import type { LlamadaParaNativa } from "../mapeo-llamada-nativa";

const AHORA = 1_800_000_000_000;
const llamada: LlamadaParaNativa = { id: "c1", nombre: "Ana Pérez", tipo: "video", entrante: true, estado: "sonando", silenciada: false, uid: "u1", neurona: "n1", chat: "ch1", medio: "bluetooth" };
const silencio = crearSilencio({ ambito: "persona", clave: "u1", etiqueta: "Ana", duracion: "1h", ahora: AHORA })!;
beforeEach(() => __reiniciarIgnoradas());

describe("quién suena", () => {
  it("sin nativa: suena la web", () => {
    expect(decidirTimbre({ nativa: false, appVisible: false, ignorada: false, silencio: null })).toMatchObject({ tarjetaWeb: true, sonidoWeb: true, sonidoNativo: false });
  });
  it("con nativa y app visible: solo la web", () => {
    expect(decidirTimbre({ nativa: true, appVisible: true, ignorada: false, silencio: null })).toMatchObject({ sonidoWeb: true, sonidoNativo: false });
  });
  it("con nativa y app oculta: solo la nativa", () => {
    expect(decidirTimbre({ nativa: true, appVisible: false, ignorada: false, silencio: null })).toMatchObject({ sonidoWeb: false, sonidoNativo: true });
  });
  it("nunca suenan las dos a la vez", () => {
    for (const nativa of [true, false]) for (const appVisible of [true, false]) {
      const d = decidirTimbre({ nativa, appVisible, ignorada: false, silencio: null });
      expect(d.sonidoWeb && d.sonidoNativo).toBe(false);
    }
  });
  it("ignorada: nadie suena ni hay tarjeta", () => {
    expect(decidirTimbre({ nativa: true, appVisible: false, ignorada: true, silencio })).toEqual({ tarjetaWeb: false, sonidoWeb: false, sonidoNativo: false, entradaSilenciada: null });
  });
  it("silenciada: nadie suena y sale la entrada con «Deshacer»", () => {
    const d = decidirTimbre({ nativa: true, appVisible: false, ignorada: false, silencio });
    expect(d).toMatchObject({ tarjetaWeb: false, sonidoWeb: false, sonidoNativo: false });
    expect(d.entradaSilenciada?.id).toBe(silencio.id);
  });
});

describe("de la señal entrante a native iniciar", () => {
  it("lleva nombre, iniciales, tipo, medio e identidad", () => {
    expect(cargaIniciarNativo(llamada, [], AHORA)).toEqual({ id: "c1", nombre: "Ana Pérez", tipo: "video", entrante: true, iniciales: "AP", medio: "bluetooth", uid: "u1", neurona: "n1", chat: "ch1" });
  });
  it("silenciada: añade silencioHasta; sin fin usa la marca", () => {
    expect(cargaIniciarNativo(llamada, [silencio], AHORA).silencioHasta).toBe(silencio.hasta);
    const sin = crearSilencio({ ambito: "todas", duracion: "siempre", ahora: AHORA })!;
    expect(cargaIniciarNativo(llamada, [sin], AHORA).silencioHasta).toBe(SIN_FIN_NATIVO);
  });
  it("medio desconocido y saliente", () => {
    expect(cargaIniciarNativo({ ...llamada, medio: "x" }, [], AHORA).medio).toBe("desconocido");
    expect(cargaIniciarNativo({ ...llamada, entrante: false }, [silencio], AHORA)).toEqual({ id: "c1", nombre: "Ana Pérez", tipo: "video", entrante: false });
  });
  it("iniciales", () => {
    expect(inicialesDe("Ana Pérez")).toBe("AP");
    expect(inicialesDe("mac")).toBe("M");
    expect(inicialesDe("")).toBe("S");
  });
});

describe("evento silencio → política", () => {
  it("claves por ámbito", () => {
    expect(claveParaAmbito("persona", llamada)).toBe("u1");
    expect(claveParaAmbito("neurona", llamada)).toBe("n1");
    expect(claveParaAmbito("chat", llamada)).toBe("ch1");
    expect(claveParaAmbito("medio", llamada)).toBe("bluetooth");
    expect(claveParaAmbito("neurona", { ...llamada, neurona: undefined })).toBeNull();
  });
  it("una orden se completa con la llamada", () => {
    const c = silencioDesdeEvento({ ambito: "persona", duracion: "1h" }, llamada, AHORA);
    expect(c?.tipo).toBe("poner");
    if (c?.tipo === "poner") {
      expect(c.silencio.clave).toBe("u1");
      expect(c.silencio.hasta).toBe(AHORA + 3_600_000);
    }
  });
  it("el silencio hecho por Kotlin se respeta; la marca sin fin pasa a null", () => {
    const c = silencioDesdeEvento({ id: "k1", ambito: "medio", clave: "internet", hasta: SIN_FIN_NATIVO }, null, AHORA);
    expect(c?.tipo === "poner" && c.silencio.hasta).toBeNull();
  });
  it("deshacer y basura", () => {
    expect(silencioDesdeEvento({ id: "k1", quitado: true }, null, AHORA)).toEqual({ tipo: "quitar", id: "k1" });
    expect(silencioDesdeEvento(null, llamada, AHORA)).toBeNull();
    expect(silencioDesdeEvento({ ambito: "raro", duracion: "1h" }, llamada, AHORA)).toBeNull();
    expect(silencioDesdeEvento({ ambito: "persona" }, llamada, AHORA)).toBeNull();
  });
});

describe("ignoradas", () => {
  it("se recuerdan por id", () => {
    expect(estaIgnorada("c1")).toBe(false);
    ignorarLlamada("c1");
    expect(estaIgnorada("c1")).toBe(true);
  });
});
