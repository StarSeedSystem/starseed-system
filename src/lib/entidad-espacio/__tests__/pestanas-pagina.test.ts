import { describe, it, expect } from "vitest";
import { aPestanasDePagina } from "../pestanas-pagina";
import type { Pestana } from "../modelo";

const UUID_A = "550e8400-e29b-41d4-a716-446655440000";
const UUID_B = "550e8400-e29b-41d4-a716-446655440001";

function pestana(id: string, titulo: string, sesionId: string): Pestana {
    return {
        id,
        titulo,
        tipo: "pizarra",
        sesionId,
        visibilidad: "publica",
        accesoPublico: "ver",
    };
}

function render(p: Pestana): string {
    return `nodo:${p.id}`;
}

describe("aPestanasDePagina", () => {
    it("una pestaña con sesión en directo sale con marca y contador", () => {
        const lista = [pestana("e1", "Pizarra", UUID_A)];
        const res = aPestanasDePagina(lista, { [UUID_A]: { directo: true, personas: 3 } }, render);
        expect(res).toHaveLength(1);
        expect(res[0].label).toBe("Pizarra ● EN VIVO · 3");
        expect(res[0].node).toBe("nodo:e1");
    });

    it("una pestaña sin directo sale sin marca", () => {
        const lista = [pestana("e1", "Pizarra", UUID_A)];
        const res = aPestanasDePagina(lista, { [UUID_A]: { directo: false, personas: 0 } }, render);
        expect(res[0].label).toBe("Pizarra");
    });

    it("una pestaña sin dato de directo (sesión ausente del mapa) sale sin marca", () => {
        const lista = [pestana("e1", "Pizarra", UUID_A)];
        const res = aPestanasDePagina(lista, {}, render);
        expect(res[0].label).toBe("Pizarra");
    });

    it("el orden de la lista se conserva", () => {
        const lista = [
            pestana("e1", "Pizarra", UUID_A),
            pestana("e2", "Dashboard", UUID_B),
            pestana("e3", "Tabla", UUID_A),
        ];
        const res = aPestanasDePagina(
            lista,
            { [UUID_A]: { directo: true, personas: 12 } },
            render,
        );
        expect(res.map((t) => t.id)).toEqual(["e1", "e2", "e3"]);
        expect(res[0].label).toContain("EN VIVO · 12");
        expect(res[2].label).toContain("EN VIVO · 12");
        expect(res[1].label).toBe("Dashboard");
    });

    it("sin pestañas la lista sale vacía", () => {
        const res = aPestanasDePagina([], { [UUID_A]: { directo: true, personas: 5 } }, render);
        expect(res).toEqual([]);
    });

    it("una lista ya filtrada por permisos se muestra tal cual (el adaptador no vuelve a filtrar)", () => {
        // «Un observador no ve la pestaña privada» lo cubre permisos.test.ts:
        // aquí solo se demuestra que lo que llega ya filtrado sale entero.
        const lista = [pestana("visible", "Sala abierta", UUID_A)];
        const res = aPestanasDePagina(lista, {}, render);
        expect(res.map((t) => t.id)).toEqual(["visible"]);
        expect(res[0].label).toBe("Sala abierta");
    });
});
