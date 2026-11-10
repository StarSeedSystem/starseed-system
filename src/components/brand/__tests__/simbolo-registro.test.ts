// @vitest-environment jsdom
// ESC1110B — «Símbolo del escritorio» por perfil, página y grupo: migración, copia local y resolución.
import { afterEach, describe, expect, it, vi } from "vitest";
import { SIMBOLO_OFICIAL, archivoDesdeRecurso } from "../simbolo-archivo";
import {
    CLAVE_LOCAL_SIMBOLO, EVENTO_SIMBOLO, REGISTRO_OFICIAL, claveDestino, claveEntidad, guardarLocal, leerLocal,
    migrarRegistro, nuevoRegistro, resolverSimbolo, rotuloSimbolo, type DestinoSimbolo,
} from "../simbolo-registro";

const PROPIO = archivoDesdeRecurso("svg", '<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>', "Mío").archivo;

function almacenFalso() {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m };
}

afterEach(() => vi.restoreAllMocks());

describe("migración del ajuste guardado", () => {
    it("nada u «oficial» → oficial", () => {
        expect(migrarRegistro(undefined).registro).toBe(REGISTRO_OFICIAL);
        expect(migrarRegistro(null).registro).toBe(REGISTRO_OFICIAL);
        expect(migrarRegistro("oficial").registro).toBe(REGISTRO_OFICIAL);
    });

    it("v0 (el archivo suelto, sin envoltorio) se envuelve en el registro v1", () => {
        const m = migrarRegistro(PROPIO);
        expect(m.motivo).toBeNull();
        expect(m.registro.v).toBe(1);
        expect(m.registro.archivo?.fuente.tipo).toBe("svg");
        expect(migrarRegistro(JSON.stringify(PROPIO)).registro.archivo?.nombre).toBe("Mío");
    });

    it("v1 se revalida: un archivo envenenado guardado cae al oficial con motivo", () => {
        const bueno = migrarRegistro({ v: 1, archivo: PROPIO, actualizado: 5, protomolecula: "simbolo-perfil-a" });
        expect(bueno.registro.actualizado).toBe(5);
        expect(bueno.registro.protomolecula).toBe("simbolo-perfil-a");
        const malo = migrarRegistro({ v: 1, archivo: { ...PROPIO, fuente: { tipo: "svg", datos: "<svg><script/></svg>" } }, actualizado: 1 });
        expect(malo.registro.archivo).toBeNull();
        expect(malo.motivo).toMatch(/script/);
        expect(migrarRegistro({ v: 1, archivo: null, actualizado: 1, protomolecula: "<mal>" }).registro.protomolecula).toBeUndefined();
    });

    it("versión desconocida o basura → oficial con motivo", () => {
        expect(migrarRegistro({ v: 7 }).motivo).toMatch(/versión/);
        expect(migrarRegistro([1, 2]).registro).toBe(REGISTRO_OFICIAL);
        expect(migrarRegistro("{roto").motivo).toMatch(/JSON/);
    });
});

describe("copia local y resolución por ámbito", () => {
    const perfil: DestinoSimbolo = { ambito: "perfil", id: "p1" };
    const grupo: DestinoSimbolo = { ambito: "grupo", id: "tribu", nombre: "La Tribu" };

    it("claves: la copia local por destino; en la nube el perfil va bajo la fila del usuario", () => {
        expect(claveDestino(perfil)).toBe("perfil:p1");
        expect(claveEntidad(perfil)).toBe("simbolo-escritorio.perfil.p1");
        expect(claveEntidad(grupo)).toBe("simbolo-escritorio");
    });

    it("guarda, lee, avisa y borra al volver al oficial", () => {
        const a = almacenFalso();
        const oyente = vi.fn();
        window.addEventListener(EVENTO_SIMBOLO, oyente);
        expect(guardarLocal(perfil, nuevoRegistro(PROPIO, 10), a)).toBe(true);
        expect(oyente).toHaveBeenCalledTimes(1);
        expect(leerLocal(perfil, a).archivo?.nombre).toBe("Mío");
        expect(leerLocal(grupo, a)).toBe(REGISTRO_OFICIAL);
        guardarLocal(perfil, nuevoRegistro(null, 11), a);
        expect(JSON.parse(a.m.get(CLAVE_LOCAL_SIMBOLO)!).entradas).toEqual({});
        window.removeEventListener(EVENTO_SIMBOLO, oyente);
    });

    it("un almacén que rompe no tumba nada", () => {
        const roto = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("y"); } };
        expect(leerLocal(perfil, roto)).toBe(REGISTRO_OFICIAL);
        expect(guardarLocal(perfil, nuevoRegistro(PROPIO, 1), roto)).toBe(false);
    });

    it("página o grupo › perfil › oficial; el propio se rotula como de su dueño", () => {
        const p = nuevoRegistro(PROPIO, 1);
        expect(resolverSimbolo({}).archivo).toBe(SIMBOLO_OFICIAL);
        expect(resolverSimbolo({ perfil: p }).de).toBe("perfil");
        expect(resolverSimbolo({ perfil: REGISTRO_OFICIAL, entidad: p }).de).toBe("entidad");
        expect(resolverSimbolo({ perfil: p, entidad: REGISTRO_OFICIAL }).de).toBe("perfil");
        expect(rotuloSimbolo(SIMBOLO_OFICIAL, perfil)).toBeNull();
        expect(rotuloSimbolo(PROPIO, grupo)).toBe("Símbolo propio de La Tribu");
        expect(rotuloSimbolo(PROPIO, { ambito: "pagina" })).toBe("Símbolo propio de esta página");
    });
});
