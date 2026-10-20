// @vitest-environment jsdom
/**
 * Almacén de ADN de avatar (AV1011D): guardar, leer, quitar y reconocer al dueño. jsdom aporta un localStorage REAL
 * (se vacía antes de cada caso); el espejo a la cuenta se sustituye por un espía para no salir a la red.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adnPorDefecto, sanearAdn, type AdnAvatar } from "@/lib/avatares/adn/adn";

const h = vi.hoisted(() => ({ espejo: vi.fn(async () => ({ ok: true, atomic: true })) }));
vi.mock("@/lib/sync/user-prefs", () => ({ mergeUserPrefs: h.espejo }));

import {
  MAX_ADN_GUARDADOS, adnActualDeDueno, getSavedAdnEntries, loadAdnEntry, nuevoIdAdn, parseAdnEntry, refDeAdn, removeAdnFromLibrary,
  saveAdnToLibrary, suscribirCambiosAdn,
} from "@/lib/avatares/adaptadores/almacen-adn";

const CLAVE = "starseed.avatar.adn.v1";
const MALLA = "biblioteca:avatares/plantillas/arla.vrm";
const duenoPerfil = { tipo: "perfil" as const, id: "perfil-123" };
const conMalla = (id: string, dueno: AdnAvatar["dueno"], rev = 0): AdnAvatar => ({
  ...adnPorDefecto(id, `Avatar ${id}`, dueno), base: { tipo: "vrm", ref: MALLA }, esqueleto: { tipo: "vrm-humanoide", articulaciones: 55 }, rev,
});

describe("Almacén de ADN de Avatar (AV1011)", () => {
  const adnDePrueba: AdnAvatar = {
    v: 1,
    id: "test-adn-1",
    nombre: "Avatar de Prueba",
    dueno: duenoPerfil,
    base: { tipo: "orbe" },
    esqueleto: { tipo: "ninguno", articulaciones: 0 },
    morfologia: {},
    materiales: {},
    piezas: [],
    expresionBase: {},
    aura: { tono: 260, intensidad: 0.6, ligadaEmocion: true },
    movimiento: { energia: 0.5, amplitud: 0.5, ritmo: 0.5, postura: 0.5 },
    visibilidad: "privado",
    procedencia: [],
    rev: 1,
  };

  beforeEach(() => { localStorage.clear(); h.espejo.mockClear(); });

  it("guarda y carga un ADN en la Biblioteca", async () => {
    await saveAdnToLibrary(adnDePrueba, "privado");
    const entry = await loadAdnEntry("biblioteca:test-adn-1");
    expect(entry).not.toBeNull();
    expect(entry!.id).toBe("test-adn-1");
    expect(entry!.kind).toBe("avatar-adn");
    expect(entry!.visibilidad).toBe("privado");
  });

  it("parsea el raw JSON a AdnAvatar", async () => {
    await saveAdnToLibrary(adnDePrueba, "privado");
    const parsed = await parseAdnEntry((await loadAdnEntry("biblioteca:test-adn-1"))!);
    expect(parsed).not.toBeNull();
    expect(parsed!.id).toBe("test-adn-1");
    expect(parsed!.nombre).toBe("Avatar de Prueba");
  });

  it("valida el ADN con sanearAdn", () => {
    const cleaned = sanearAdn(adnDePrueba);
    expect(cleaned).not.toBeNull();
    expect(cleaned!.id).toBe("test-adn-1");
    expect(cleaned!.v).toBe(1);
  });

  it("rejaza el ADN inválido", () => {
    expect(sanearAdn({ id: "", v: 2 } as unknown)).toBeNull();
  });

  it("devuelve null al cargar un ref que no existe", async () => {
    expect(await loadAdnEntry("biblioteca:inexistente")).toBeNull();
  });

  it("elimina un ADN de la Biblioteca", async () => {
    await saveAdnToLibrary(adnDePrueba, "privado");
    await removeAdnFromLibrary("biblioteca:test-adn-1");
    expect(await loadAdnEntry("biblioteca:test-adn-1")).toBeNull();
  });

  it("dos dueños con la misma malla base conservan cada uno su ADN", async () => {
    await saveAdnToLibrary(conMalla("adn-perfil", duenoPerfil), "privado");
    await saveAdnToLibrary(conMalla("adn-grupo", { tipo: "grupo", id: "g1" }), "privado");
    expect(getSavedAdnEntries().map((e) => e.id).sort()).toEqual(["adn-grupo", "adn-perfil"]);
    expect(refDeAdn({ id: "adn-perfil" })).toBe("biblioteca:adn-perfil");
  });

  it("al guardar una revisión nueva, releer devuelve la nueva", async () => {
    await saveAdnToLibrary({ ...adnDePrueba, rev: 1, nombre: "uno" }, "privado");
    expect((await loadAdnEntry("biblioteca:test-adn-1"))!.rev).toBe(1);
    await saveAdnToLibrary({ ...adnDePrueba, rev: 2, nombre: "dos" }, "privado");
    const e = (await loadAdnEntry("biblioteca:test-adn-1"))!;
    expect([e.rev, e.title]).toEqual([2, "dos"]);
  });

  it("rechaza guardar una revisión más vieja que la guardada", async () => {
    await saveAdnToLibrary({ ...adnDePrueba, rev: 5 }, "privado");
    await expect(saveAdnToLibrary({ ...adnDePrueba, rev: 2 }, "privado")).rejects.toThrow(/más nueva/);
    expect((await loadAdnEntry("biblioteca:test-adn-1"))!.rev).toBe(5);
  });

  it("pedir una revisión distinta de la guardada da null", async () => {
    await saveAdnToLibrary({ ...adnDePrueba, rev: 3 }, "privado");
    expect(await loadAdnEntry("biblioteca:test-adn-1", 9)).toBeNull();
    expect((await loadAdnEntry("biblioteca:test-adn-1", 3))!.rev).toBe(3);
  });

  it("la visibilidad de la entrada y la del ADN guardado coinciden", async () => {
    await saveAdnToLibrary(adnDePrueba, "publico");
    const e = (await loadAdnEntry("biblioteca:test-adn-1"))!;
    expect([e.visibilidad, (await parseAdnEntry(e))!.visibilidad]).toEqual(["publico", "publico"]);
  });

  it("quitar lo que otra pestaña ya borró no deja un fantasma al releer", async () => {
    await saveAdnToLibrary(adnDePrueba, "privado");
    await loadAdnEntry("biblioteca:test-adn-1");
    localStorage.clear(); // otra pestaña vació el almacén
    await removeAdnFromLibrary("biblioteca:test-adn-1");
    expect(await loadAdnEntry("biblioteca:test-adn-1")).toBeNull();
  });

  it("un ADN inválido lanza y no escribe ni espeja nada", async () => {
    await expect(saveAdnToLibrary({ ...adnDePrueba, id: "" }, "privado")).rejects.toThrow(/inválido/);
    expect(localStorage.getItem(CLAVE)).toBeNull();
    expect(h.espejo).not.toHaveBeenCalled();
  });

  it("parseAdnEntry da null con un raw roto o que sanearAdn no admite", async () => {
    await saveAdnToLibrary(adnDePrueba, "privado");
    const e = (await loadAdnEntry("biblioteca:test-adn-1"))!;
    expect(await parseAdnEntry({ ...e, raw: "{no es json" })).toBeNull();
    expect(await parseAdnEntry({ ...e, raw: JSON.stringify({ id: "", v: 2 }) })).toBeNull();
  });

  it("getSavedAdnEntries ordena del más nuevo al más viejo", async () => {
    const ahora = vi.spyOn(Date, "now");
    ahora.mockReturnValueOnce(1_000);
    await saveAdnToLibrary({ ...adnDePrueba, id: "viejo" }, "privado");
    ahora.mockReturnValueOnce(2_000);
    await saveAdnToLibrary({ ...adnDePrueba, id: "nuevo" }, "privado");
    ahora.mockRestore();
    expect(getSavedAdnEntries().map((e) => e.id)).toEqual(["nuevo", "viejo"]);
  });

  it("adnActualDeDueno devuelve el ADN más reciente de ese dueño, y null si no tiene", async () => {
    expect(adnActualDeDueno(duenoPerfil)).toBeNull();
    const ahora = vi.spyOn(Date, "now");
    ahora.mockReturnValueOnce(1_000);
    await saveAdnToLibrary(conMalla("a-vieja", duenoPerfil), "privado");
    ahora.mockReturnValueOnce(2_000);
    await saveAdnToLibrary(conMalla("a-nueva", duenoPerfil), "privado");
    ahora.mockReturnValueOnce(3_000);
    await saveAdnToLibrary(conMalla("de-otro", { tipo: "pagina", id: "p9" }), "privado");
    ahora.mockRestore();
    expect(adnActualDeDueno(duenoPerfil)!.id).toBe("a-nueva");
    expect(adnActualDeDueno({ tipo: "grupo", id: duenoPerfil.id })).toBeNull(); // mismo id, otro tipo de dueño
  });

  it("recoloca bajo la clave del id una entrada antigua guardada por su malla base", async () => {
    const antigua = { id: "adn-viejo", kind: "avatar-adn", title: "Viejo", url: MALLA, savedAt: 1, rev: 0, visibilidad: "privado", raw: JSON.stringify(conMalla("adn-viejo", duenoPerfil)) };
    localStorage.setItem(CLAVE, JSON.stringify({ [MALLA]: antigua }));
    await saveAdnToLibrary(conMalla("adn-viejo", duenoPerfil, 1), "privado");
    expect(Object.keys(JSON.parse(localStorage.getItem(CLAVE)!))).toEqual(["biblioteca:adn-viejo"]);
  });

  it("una entrada antigua (clave por malla) con una revisión más nueva tampoco se pisa al recolocar", async () => {
    const antigua = { id: "adn-viejo", kind: "avatar-adn", title: "Viejo", url: MALLA, savedAt: 1, rev: 5, visibilidad: "privado", raw: JSON.stringify(conMalla("adn-viejo", duenoPerfil, 5)) };
    localStorage.setItem(CLAVE, JSON.stringify({ [MALLA]: antigua }));
    await expect(saveAdnToLibrary(conMalla("adn-viejo", duenoPerfil, 0), "privado")).rejects.toThrow(/más nueva/);
    expect(JSON.parse(localStorage.getItem(CLAVE)!)[MALLA].rev).toBe(5); // sigue intacta
    expect(h.espejo).not.toHaveBeenCalled();
  });

  it("una entrada antigua (clave por malla) de otro dueño tampoco se pisa al recolocar", async () => {
    const antigua = { id: "adn-viejo", kind: "avatar-adn", title: "Viejo", url: MALLA, savedAt: 1, rev: 0, visibilidad: "privado", raw: JSON.stringify(conMalla("adn-viejo", { tipo: "grupo", id: "g1" })) };
    localStorage.setItem(CLAVE, JSON.stringify({ [MALLA]: antigua }));
    await expect(saveAdnToLibrary(conMalla("adn-viejo", duenoPerfil, 1), "privado")).rejects.toThrow(/otro dueño/);
    expect(Object.keys(JSON.parse(localStorage.getItem(CLAVE)!))).toEqual([MALLA]);
  });

  it("recolocar una entrada antigua no cuenta como un avatar más contra el tope", async () => {
    const antigua = { id: "adn-viejo", kind: "avatar-adn", title: "Viejo", url: MALLA, savedAt: 1, rev: 0, visibilidad: "privado", raw: JSON.stringify(conMalla("adn-viejo", duenoPerfil)) };
    const lleno: Record<string, unknown> = { [MALLA]: antigua };
    for (let i = 0; i < MAX_ADN_GUARDADOS - 1; i++) lleno[`biblioteca:a${i}`] = { ...antigua, id: `a${i}` };
    localStorage.setItem(CLAVE, JSON.stringify(lleno));
    await saveAdnToLibrary(conMalla("adn-viejo", duenoPerfil, 1), "privado");
    expect(getSavedAdnEntries()).toHaveLength(MAX_ADN_GUARDADOS);
  });

  it("nuevoIdAdn da ids únicos que sanearAdn admite", () => {
    const ids = new Set(Array.from({ length: 200 }, () => nuevoIdAdn()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(sanearAdn({ ...adnDePrueba, id })?.id).toBe(id);
  });

  it("nuevoIdAdn tiene respaldo si el navegador no trae crypto.randomUUID", () => {
    vi.stubGlobal("crypto", {});
    try {
      expect(nuevoIdAdn()).toMatch(/^adn-[0-9a-z]+-[0-9a-z]+$/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("suscribirCambiosAdn avisa al guardar, al cambiar el almacén desde otra pestaña, y deja de avisar al darse de baja", async () => {
    const aviso = vi.fn();
    const baja = suscribirCambiosAdn(aviso);
    await saveAdnToLibrary(adnDePrueba, "privado");
    expect(aviso).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new StorageEvent("storage", { key: CLAVE }));
    window.dispatchEvent(new StorageEvent("storage", { key: null })); // localStorage.clear() en otra pestaña
    expect(aviso).toHaveBeenCalledTimes(3);
    window.dispatchEvent(new StorageEvent("storage", { key: "otra.clave" })); // algo ajeno al avatar: no interesa
    expect(aviso).toHaveBeenCalledTimes(3);
    baja();
    await saveAdnToLibrary({ ...adnDePrueba, rev: 2 }, "privado");
    window.dispatchEvent(new StorageEvent("storage", { key: CLAVE }));
    expect(aviso).toHaveBeenCalledTimes(3);
  });

  it("no pasa del tope de avatares guardados, pero sí actualiza uno existente", async () => {
    for (let i = 0; i < MAX_ADN_GUARDADOS; i++) await saveAdnToLibrary({ ...adnDePrueba, id: `a${i}` }, "privado");
    await expect(saveAdnToLibrary({ ...adnDePrueba, id: "de-mas" }, "privado")).rejects.toThrow(/avatares guardados/);
    await saveAdnToLibrary({ ...adnDePrueba, id: "a0", rev: 2 }, "privado");
    expect(getSavedAdnEntries()).toHaveLength(MAX_ADN_GUARDADOS);
  });

  it("devuelve la clave bajo la que guardó, aunque el id traiga espacios de más", async () => {
    expect(await saveAdnToLibrary(adnDePrueba, "privado")).toBe("biblioteca:test-adn-1");
    expect(await saveAdnToLibrary({ ...adnDePrueba, id: "  con espacios  " }, "privado")).toBe("biblioteca:con espacios");
    expect(await loadAdnEntry("biblioteca:con espacios")).not.toBeNull();
  });

  it("un id que ya es de otro dueño no se pisa", async () => {
    await saveAdnToLibrary(conMalla("compartido", duenoPerfil, 1), "privado");
    await expect(saveAdnToLibrary(conMalla("compartido", { tipo: "grupo", id: "g1" }, 2), "privado")).rejects.toThrow(/otro dueño/);
    expect(adnActualDeDueno(duenoPerfil)!.id).toBe("compartido");
    expect(adnActualDeDueno({ tipo: "grupo", id: "g1" })).toBeNull();
  });

  it("si el aparato no deja escribir, lanza: ni se dice guardado ni se espeja a la cuenta", async () => {
    const avisos = vi.fn();
    window.addEventListener("starseed:avatar-adn", avisos);
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("lleno", "QuotaExceededError"); });
    await expect(saveAdnToLibrary(adnDePrueba, "privado")).rejects.toThrow(/no dejó guardar/);
    setItem.mockRestore();
    window.removeEventListener("starseed:avatar-adn", avisos);
    expect(h.espejo).not.toHaveBeenCalled();
    expect(avisos).not.toHaveBeenCalled();
    expect(await loadAdnEntry("biblioteca:test-adn-1")).toBeNull();
  });

  it("un almacén con entradas rotas se lee sin romper y se conserva lo válido", async () => {
    localStorage.setItem(CLAVE, JSON.stringify({ "biblioteca:roto": null, "biblioteca:texto": "x" }));
    expect(getSavedAdnEntries()).toEqual([]);
    await saveAdnToLibrary(adnDePrueba, "privado");
    expect(Object.keys(JSON.parse(localStorage.getItem(CLAVE)!))).toEqual(["biblioteca:test-adn-1"]);
  });

  it("espeja a la cuenta el almacén entero bajo su clave, también al quitar, y avisa a la interfaz", async () => {
    const avisos = vi.fn();
    window.addEventListener("starseed:avatar-adn", avisos);
    await saveAdnToLibrary(adnDePrueba, "privado");
    await removeAdnFromLibrary("biblioteca:test-adn-1");
    window.removeEventListener("starseed:avatar-adn", avisos);
    expect(h.espejo).toHaveBeenCalledTimes(2);
    const [guardado, quitado] = h.espejo.mock.calls.map((c) => (c as unknown[])[0] as Record<string, Record<string, unknown>>);
    expect(Object.keys(guardado)).toEqual([CLAVE]);
    expect(Object.keys(guardado[CLAVE])).toEqual(["biblioteca:test-adn-1"]);
    expect(quitado[CLAVE]).toEqual({}); // un avatar quitado no se queda guardado en la cuenta
    expect(avisos).toHaveBeenCalledTimes(2);
  });

  it("quitar algo que no existe no escribe, ni espeja ni avisa", async () => {
    const avisos = vi.fn();
    window.addEventListener("starseed:avatar-adn", avisos);
    await removeAdnFromLibrary("biblioteca:no-esta");
    window.removeEventListener("starseed:avatar-adn", avisos);
    expect(h.espejo).not.toHaveBeenCalled();
    expect(avisos).not.toHaveBeenCalled();
  });
});
