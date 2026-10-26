// @vitest-environment jsdom
/**
 * Qué de los agentes en la red viaja con la cuenta (Ola 1025U · U3): las reglas de bloqueo y los perfiles de los
 * agentes SÍ (así lo que una persona bloquea en un medio no reaparece en otro); el tope de envíos por hora NO
 * (es de este medio).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NEVER_SYNCED_KEYS, SYNCED_KEYS, SYNCED_PREFIXES, isNeverSyncedKey } from "@/lib/settings-sync";
import { isSyncedKey } from "@/lib/sync/realtime-sync";
import { CLAVE_BLOQUEO_BOTS, EVENTO_BLOQUEO_BOTS, leerReglas, _reiniciarCacheBloqueoParaPruebas } from "../bloqueo-bots";
import { EVENTO_PERFIL_AGENTE, clavePerfilAgente } from "../perfil-agente";

beforeEach(() => {
  localStorage.clear();
  _reiniciarCacheBloqueoParaPruebas();
});

describe("claves que viajan con la cuenta", () => {
  it("las reglas de bloqueo de bots viajan", () => {
    expect((SYNCED_KEYS as readonly string[]).includes(CLAVE_BLOQUEO_BOTS)).toBe(true);
    expect(isSyncedKey(CLAVE_BLOQUEO_BOTS)).toBe(true);
    expect(isNeverSyncedKey(CLAVE_BLOQUEO_BOTS)).toBe(false);
  });

  it("el perfil de cada agente viaja, sea cual sea su id", () => {
    expect((SYNCED_PREFIXES as readonly string[]).includes("starseed.agentes-red.perfil.")).toBe(true);
    for (const id of ["personalidad:aurora", "bot:guardian", "agente-grupo:g1.a2"]) {
      expect(isSyncedKey(clavePerfilAgente(id)), id).toBe(true);
      expect(isNeverSyncedKey(clavePerfilAgente(id)), id).toBe(false);
    }
  });

  it("el tope de envíos por hora es de este medio y no viaja", () => {
    expect(isSyncedKey("starseed.agentes-red.envios.bot:guardian.v1")).toBe(false);
  });

  it("ninguna clave de agentes en la red parece un secreto ni está entre las prohibidas", () => {
    const mias = [CLAVE_BLOQUEO_BOTS, clavePerfilAgente("bot:x")];
    for (const k of mias) {
      expect(NEVER_SYNCED_KEYS.includes(k as never)).toBe(false);
      expect(k).not.toMatch(/(secret|password|token|api-?key|credential|private)/i);
    }
  });
});

describe("al llegar de otro medio, la pantalla se entera", () => {
  it("lo que se escribe en la clave se ve en la siguiente lectura (el motor de sync solo escribe y avisa)", () => {
    const aviso = vi.fn();
    window.addEventListener(EVENTO_BLOQUEO_BOTS, aviso);
    localStorage.setItem(CLAVE_BLOQUEO_BOTS, JSON.stringify({ v: 1, bots: { "bot:x": { nombre: "X", desde: 1 } }, general: "todo" }));
    window.dispatchEvent(new CustomEvent(EVENTO_BLOQUEO_BOTS));
    window.removeEventListener(EVENTO_BLOQUEO_BOTS, aviso);
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(Object.keys(leerReglas().bots)).toEqual(["bot:x"]);
  });

  it("los eventos que el motor dispara son los mismos que escuchan los ganchos", () => {
    expect(EVENTO_BLOQUEO_BOTS).toBe("starseed:agentes-red-bloqueo");
    expect(EVENTO_PERFIL_AGENTE).toBe("starseed:agentes-red-perfil");
  });
});
