import { describe, it, expect } from "vitest";
import {
    ESTADO_AJUSTES_DEFECTO, ponerPermisoConfigurarADistancia, resolverDeshacerAjuste, resolverLeerAjustes,
    resolverPonerAjuste, validarArgsAjusteRemoto, type EstadoAjustesAparato,
} from "../ajustes-remotos";

const ON: EstadoAjustesAparato = { ...ESTADO_AJUSTES_DEFECTO, configurarADistancia: true, valores: { tema: "oscuro" } };
const poner = (clave: string, valor: unknown = true) => ({ clave, valor, ambito: "ajuste" });

describe("ajustes remotos", () => {
    it("viene apagado de fábrica y nada se lee ni cambia", () => {
        expect(ESTADO_AJUSTES_DEFECTO.configurarADistancia).toBe(false);
        expect(resolverLeerAjustes(ESTADO_AJUSTES_DEFECTO)).toEqual({ ok: false, motivo: "permiso-apagado" });
        expect(resolverPonerAjuste(ESTADO_AJUSTES_DEFECTO, poner("tema", "claro"), "x", 1)).toEqual({ ok: false, motivo: "permiso-apagado" });
    });
    it("solo la persona dueña lo enciende, y se apaga igual", () => {
        const on = ponerPermisoConfigurarADistancia(ESTADO_AJUSTES_DEFECTO, true);
        expect(resolverLeerAjustes(on)).toMatchObject({ ok: true, ajustes: {} });
        expect(ponerPermisoConfigurarADistancia(on, false).configurarADistancia).toBe(false);
    });
    it("lee los ajustes reales", () => {
        expect(resolverLeerAjustes(ON)).toMatchObject({ ok: true, ajustes: { tema: "oscuro" } });
    });
    it("cambia, guarda el valor anterior y registra", () => {
        const r = resolverPonerAjuste(ON, poner("tema", "claro"), "neurona-a", 10);
        expect(r.ok && r.estado.valores.tema).toBe("claro");
        expect(r.ok && r.entrada).toMatchObject({ anterior: "oscuro", nuevo: "claro", de: "neurona-a", deshecho: false });
        expect(r.ok && r.estado.registro).toHaveLength(1);
    });
    it("rechaza los ajustes de seguridad aunque el permiso esté encendido", () => {
        for (const k of ["agent", "terminal", "aceptarControladores", "claves", "configurarADistancia"]) {
            expect(resolverPonerAjuste(ON, poner(k), "x", 1)).toEqual({ ok: false, motivo: "seguridad" });
        }
    });
    it("rechaza argumentos mal formados", () => {
        expect(validarArgsAjusteRemoto("poner-ajuste", { clave: "a b", valor: 1, ambito: "ajuste" })).toBeNull();
        expect(validarArgsAjusteRemoto("poner-ajuste", { clave: "a", valor: {}, ambito: "ajuste" })).toBeNull();
        expect(validarArgsAjusteRemoto("poner-ajuste", { clave: "a", valor: 1, ambito: "otro" })).toBeNull();
        expect(validarArgsAjusteRemoto("leer-ajustes", { x: 1 })).toBeNull();
        expect(validarArgsAjusteRemoto("deshacer-ajuste", { id: "ab-1" })).toEqual({ id: "ab-1" });
    });
    it("deshace: vuelve al valor anterior y no se deshace dos veces", () => {
        const a = resolverPonerAjuste(ON, poner("tema", "claro"), "x", 10);
        if (!a.ok || !a.entrada) throw new Error("fallo");
        const d = resolverDeshacerAjuste(a.estado, a.entrada.id, "x", 20);
        expect(d.ok && d.estado.valores.tema).toBe("oscuro");
        expect(d.ok && d.estado.registro).toHaveLength(2);
        if (!d.ok) throw new Error("fallo");
        expect(resolverDeshacerAjuste(d.estado, a.entrada.id, "x", 30)).toEqual({ ok: false, motivo: "ya-deshecho" });
    });
    it("deshacer un ajuste nuevo lo quita; con el permiso apagado no deshace", () => {
        const a = resolverPonerAjuste(ON, poner("sonido", true), "x", 10);
        if (!a.ok || !a.entrada) throw new Error("fallo");
        const d = resolverDeshacerAjuste(a.estado, a.entrada.id, "x", 20);
        expect(d.ok && "sonido" in d.estado.valores).toBe(false);
        expect(resolverDeshacerAjuste({ ...a.estado, configurarADistancia: false }, a.entrada.id, "x", 20)).toEqual({ ok: false, motivo: "permiso-apagado" });
        expect(resolverDeshacerAjuste(ON, "nada", "x", 1)).toEqual({ ok: false, motivo: "no-existe" });
    });
});
