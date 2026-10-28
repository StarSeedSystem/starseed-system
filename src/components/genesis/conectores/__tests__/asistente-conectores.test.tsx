/**
 * Asistente «Conectar Genesis» · pruebas sin red (Ola 1019G · GCA1019M).
 * La API se simula con los cargadores inyectados (`cargar`/`vincular`): nada
 * toca `route.ts` ni el disco. La clave escrita en el campo se envía a la
 * función simulada y el campo queda vacío a continuación.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { Sugerencia } from "@/lib/genesis/conectores/sugerir";
import type { VistaOpciones } from "@/lib/genesis/conectores/opciones-ambito";
import { resumenPorPapel, AsistenteConectores } from "../asistente-conectores";

function sugerencia(overrides: Partial<Sugerencia> = {}): Sugerencia {
    return {
        id: overrides.id ?? "opcion",
        nombre: overrides.nombre ?? "Opción",
        tipo: overrides.tipo ?? "proveedor",
        papeles: overrides.papeles ?? ["escritor"],
        enlaceAlta: overrides.enlaceAlta ?? null,
        enlaceClave: overrides.enlaceClave ?? null,
        limite: overrides.limite ?? null,
        verificado: null,
        privacidad: overrides.privacidad ?? "local",
        variables: [],
        motivo: overrides.motivo ?? "motivo de prueba",
    };
}

function crearVista(): VistaOpciones {
    return {
        ambito: "grupo-x",
        catalogo: [],
        sugerencias: [
            {
                clave: "local-por-activar",
                titulo: "Local por activar",
                opciones: [
                    sugerencia({
                        id: "astraura-158-local",
                        nombre: "Astraura 1.58 local",
                        tipo: "modelo",
                        enlaceAlta: null,
                        enlaceClave: null,
                        motivo: "Capacidad local sin usar.",
                    }),
                ],
            },
            {
                clave: "gratis-por-vincular",
                titulo: "Gratis por vincular",
                opciones: [
                    sugerencia({
                        id: "free-the-ai",
                        nombre: "FreeTheAi",
                        enlaceAlta: "https://api.freetheai.xyz/v1",
                        enlaceClave: "https://freetheai.xyz",
                        privacidad: "nube-sin-retencion",
                        limite: { rpm: 4, porDia: 250, horasMes: null, almacenamientoGb: null, nota: "250 llamadas al día" },
                        motivo: "Gratis: crea tu cuenta en el enlace oficial y vincula la clave.",
                    }),
                ],
            },
        ],
        asignaciones: [
            {
                clave: "revisor",
                cadena: ["free-the-ai", "astraura-158-local"],
                respaldo: ["nim"],
                preferencias: { localPrimero: true, privacidad: "local", presupuesto: 0 },
            },
        ],
    };
}

beforeEach(() => {
    vi.spyOn(window, "open").mockReturnValue(null);
});
afterEach(cleanup);

describe("AsistenteConectores · paso 1, lo local con interruptores", () => {
    it("muestra lo local del contexto con su motivo y gira el interruptor", async () => {
        render(<AsistenteConectores ambito="grupo-x" cargar={() => Promise.resolve(crearVista())} />);
        const interruptor = await screen.findByTestId("interruptor-astraura-158-local");
        expect(screen.getByTestId("grupo-local")).toBeInTheDocument();
        expect(screen.getByText(/Astraura 1.58 local/)).toBeInTheDocument();
        expect(interruptor).toHaveAttribute("aria-checked", "false");
        fireEvent.click(interruptor);
        expect(interruptor).toHaveAttribute("aria-checked", "true");
    });
});

describe("AsistenteConectores · paso 2, lo gratis con «Vincular» y clave", () => {
    it("abre el enlace oficial en pestaña nueva, envía la clave y borra el campo", async () => {
        const enviar = vi.fn().mockResolvedValue("ok");
        render(
            <AsistenteConectores ambito="grupo-x" cargar={() => Promise.resolve(crearVista())} vincular={enviar} />,
        );
        fireEvent.click(await screen.findByTestId("paso-gratis"));
        const enlace = "https://api.freetheai.xyz/v1";
        fireEvent.click(screen.getByTestId("vincular-free-the-ai"));
        expect(window.open).toHaveBeenCalledWith(enlace, "_blank", "noopener");
        const campo = screen.getByTestId("clave-free-the-ai") as HTMLInputElement;
        expect(campo).toHaveAttribute("type", "password");
        fireEvent.change(campo, { target: { value: "clave-de-prueba" } });
        expect(campo.value).toBe("clave-de-prueba");
        fireEvent.click(screen.getByTestId("guardar-free-the-ai"));
        await waitFor(() => expect(enviar).toHaveBeenCalledWith("grupo-x", "free-the-ai", "clave-de-prueba"));
        expect(campo.value).toBe("");
        expect(await screen.findByTestId("aviso-free-the-ai")).toHaveTextContent(/borrada del campo/);
    });

    it("un error del envío avisa y también deja el campo vacío", async () => {
        const enviar = vi.fn().mockResolvedValue("error");
        render(
            <AsistenteConectores ambito="grupo-x" cargar={() => Promise.resolve(crearVista())} vincular={enviar} />,
        );
        fireEvent.click(await screen.findByTestId("paso-gratis"));
        const campo = screen.getByTestId("clave-free-the-ai") as HTMLInputElement;
        fireEvent.change(campo, { target: { value: "otra-clave" } });
        fireEvent.click(screen.getByTestId("guardar-free-the-ai"));
        expect(await screen.findByTestId("aviso-free-the-ai")).toHaveTextContent(/No se pudo/);
        expect(campo.value).toBe("");
    });
});

describe("AsistenteConectores · paso 3, resumen por papel", () => {
    it("enseña la cadena elegida y el motivo de cada eslabón", async () => {
        render(<AsistenteConectores ambito="grupo-x" cargar={() => Promise.resolve(crearVista())} />);
        fireEvent.click(await screen.findByTestId("paso-resumen"));
        expect(screen.getByTestId("cadena-revisor")).toHaveTextContent("free-the-ai");
        expect(screen.getByText(/crea tu cuenta en el enlace oficial/)).toBeInTheDocument();
    });
});

describe("resumenPorPapel · función pura", () => {
    it("quita de la cadena lo local sin interruptor activo y conserva el resto", () => {
        const vista = crearVista();
        const vacio = resumenPorPapel(vista, new Set());
        expect(vacio).toHaveLength(1);
        expect(vacio[0].papel).toBe("revisor");
        expect(vacio[0].cadena).toEqual(["free-the-ai"]);
        expect(vacio[0].respaldo).toEqual(["nim"]);
        expect(vacio[0].motivos.get("free-the-ai")).toBe(vista.sugerencias[1].clave === "sin-opcion" ? null : "Gratis: crea tu cuenta en el enlace oficial y vincula la clave.");

        const activas = resumenPorPapel(vista, new Set(["astraura-158-local"]));
        expect(activas[0].cadena).toEqual(["free-the-ai", "astraura-158-local"]);
    });
});
