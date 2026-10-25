// @vitest-environment jsdom
/**
 * ResumenRecursosNeurona · «Ofrece a la malla» — la conexión real de `ofertaDesdeAsignaciones`
 * (RIA1023F): la oferta de esta neurona se VE en el panel de cada neurona, no solo en sus pruebas.
 * Sin servidor propio no presta a nadie; con servidor propio privado presta solo a la cuenta y
 * anuncia el puerto 4480; con alcance de grupo presta al grupo, nunca a la cuenta ni en público.
 */
import type { ReactElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { AppearanceProvider } from "@/context/appearance-context";
import { asignacionesFalsas, reiniciarEstado } from "@/components/recursos-ia/__fixtures__/recursos";
import type { Alcance, Asignacion, ConfigTopologia, EstadoRecursosIa } from "@/lib/recursos-ia/tipos";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/lib/recursos-ia/asignaciones", async () => (await import("@/components/recursos-ia/__fixtures__/recursos")).asignacionesFalsas);
vi.mock("@/lib/recursos-ia/deteccion", async () => {
    const F = await import("@/components/recursos-ia/__fixtures__/recursos");
    return { detectarInventario: vi.fn(async () => F.INV), detectarEstaNeurona: vi.fn(), inventarioDesde: vi.fn() };
});
vi.mock("@/lib/recursos-ia/catalogo", async () => {
    const F = await import("@/components/recursos-ia/__fixtures__/recursos");
    return {
        MODELOS_EXTRA: [],
        catalogoRecursos: () => F.CATALOGO,
        modeloPorId: (id: string) => F.CATALOGO.find((m) => m.id === id),
        bitsDeModelo: () => 4,
        ordenarPorPrioridad: <T,>(l: T[]) => l,
    };
});
vi.mock("@/lib/recursos-ia/sugerencias", async () => {
    const F = await import("@/components/recursos-ia/__fixtures__/recursos");
    return {
        topologiaSugerida: (_inv: unknown, alcance: Parameters<typeof F.sugerida>[0]) => F.sugerida(alcance),
        sugerirPlan: (_inv: unknown, _cat: unknown, o: { alcance: Parameters<typeof F.sugerida>[0]; topologia?: Parameters<typeof F.plan>[0] }) => F.plan(o.topologia ?? F.sugerida(o.alcance)),
        candidatos: () => ({ procesadores: [], almacenes: [] }),
    };
});

import { ResumenRecursosNeurona } from "@/components/recursos-ia/resumen-neurona";

const montar = (ui: ReactElement) => render(<AppearanceProvider>{ui}</AppearanceProvider>);

const ALCANCE_PRIVADO: Alcance = { tipo: "perfil", id: "propio", visibilidad: "privada" };

const estadoCon = (topo?: ConfigTopologia, asignacion?: Asignacion): EstadoRecursosIa => ({
    v: 1,
    asignaciones: asignacion ? { [`${asignacion.elemento.tipo}:${asignacion.elemento.id}`]: asignacion } : {},
    topologias: topo ? { [`${topo.alcance.tipo}:${topo.alcance.id}`]: topo } : {},
    tamanosConfirmados: {},
    almacenesDeclarados: [],
});

const asignacionBonsai = (procesaEn: string): Asignacion => ({
    elemento: { tipo: "modelo", id: "bonsai-1.58", nombre: "Bonsai 1.58" },
    almacenEn: "mac:interno",
    procesaEn,
    alcance: ALCANCE_PRIVADO,
    t: 1,
});

describe("ResumenRecursosNeurona · oferta a la malla", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    afterEach(() => cleanup());

    it("sin servidor propio: enseña sus modelos y dice que no presta a nadie (sin puerto 4480)", async () => {
        reiniciarEstado(estadoCon(undefined, asignacionBonsai("mac:cpu")));
        montar(<ResumenRecursosNeurona />);
        const fila = await screen.findByTestId("oferta-neurona");
        expect(fila).toHaveTextContent("sirve 1 modelo");
        expect(fila).toHaveTextContent("no presta a nadie");
        expect(fila.textContent).not.toContain("4480");
    });

    it("servidor propio con alcance privado: presta solo a tu cuenta y anuncia el puerto 4480", async () => {
        reiniciarEstado(estadoCon({ topologia: "servidor-propio", servidorNeuronaId: "mac", vias: ["local", "malla-local"], alcance: ALCANCE_PRIVADO }));
        montar(<ResumenRecursosNeurona />);
        const fila = await screen.findByTestId("oferta-neurona");
        expect(fila).toHaveTextContent("puerto 4480");
        expect(fila).toHaveTextContent("presta a tu cuenta");
        expect(fila.textContent).not.toContain("pública");
    });

    it("con alcance de grupo: presta al grupo, no a la cuenta ni al público", async () => {
        reiniciarEstado(
            estadoCon({
                topologia: "servidor-propio",
                servidorNeuronaId: "mac",
                vias: ["local", "malla-local"],
                alcance: { tipo: "grupo", id: "g-aurora", visibilidad: "privada" },
            }),
        );
        montar(<ResumenRecursosNeurona />);
        const fila = await screen.findByTestId("oferta-neurona");
        expect(fila).toHaveTextContent("puerto 4480");
        expect(fila).toHaveTextContent("al grupo o comunidad g-aurora");
        expect(fila.textContent).not.toContain("tu cuenta");
        expect(fila.textContent).not.toContain("pública");
    });

    it("sin asignaciones ni topología: la fila existe y es honesta (sin modelos, sin préstamo)", async () => {
        reiniciarEstado(estadoCon());
        montar(<ResumenRecursosNeurona />);
        const fila = await screen.findByTestId("oferta-neurona");
        expect(fila).toHaveTextContent("sin modelos servidos aún");
        expect(fila).toHaveTextContent("no presta a nadie");
    });
});
