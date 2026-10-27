import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { AsistenteConectores, resumenPorPapel, aEntradaSugerir, type DatosConectar } from "../asistente-conectores";

const LATIS: DatosConectar = {
    ofertas: [
        { id: "astraura-local", nombre: "Astraura 1.58 local", tipo: "modelo", papel: ["escritor", "chat"] },
        { id: "ollama-mac", nombre: "Ollama de la Mac", tipo: "modelo", papel: ["escritor"] },
    ],
    catalogo: [
        {
            id: "openrouter-free", nombre: "OpenRouter gratis", tipo: "proveedor", papeles: ["escritor"],
            gratis: { rpm: null, porDia: null, horasMes: null, almacenamientoGb: null, nota: "por verificar" },
            requiereCuenta: true, enlaceAlta: "https://openrouter.ai/", enlaceClave: "https://openrouter.ai/keys",
            variables: ["OPENROUTER_API_KEY"], privacidad: "nube-sin-retencion", licencia: null,
            verificado: null, fuente: "prueba",
        },
    ],
    contenedores: [],
    asignaciones: [
        {
            clave: "escritor", cadena: ["ollama-mac", "openrouter-free"], respaldo: [],
            preferencias: { localPrimero: true, privacidad: "nube-sin-retencion", presupuesto: null },
        },
        {
            clave: "visión", cadena: [], respaldo: [],
            preferencias: { localPrimero: true, privacidad: "local", presupuesto: null },
        },
    ],
    vinculadas: [],
};

describe("aEntradaSugerir", () => {
    it("normaliza vinculadas y potencia JSON en Sets/Map", () => {
        const e = aEntradaSugerir({ ...LATIS, vinculadas: ["a"], potencia: { a: 3 } });
        expect(e.vinculadas.has("a")).toBe(true);
        expect(e.potencia?.get("a")).toBe(3);
    });
});

describe("resumenPorPapel", () => {
    it("local encendido manda, con la cadena y su motivo", () => {
        const r = resumenPorPapel(LATIS, {});
        expect(r[0]).toMatchObject({ papel: "escritor", cobertura: "activada" });
        expect(r[0]?.cadena).toEqual([
            { id: "ollama-mac", nombre: "Ollama de la Mac" },
            { id: "openrouter-free", nombre: "OpenRouter gratis" },
        ]);
    });
    it("Todo lo local apagado, suerte: gratis por vincular y sin opción", () => {
        const r = resumenPorPapel(LATIS, { "astraura-local": false, "ollama-mac": false });
        expect(r[0]?.cobertura).toBe("falta-vincular");
        expect(r[1]).toMatchObject({ papel: "visión", cobertura: "sin-opcion" });
    });
});

describe("AsistenteConectores", () => {
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it("Paso 1: interruptores de lo local; al apagar avisa y el resumen cambia", async () => {
        const alCambiarLocal = vi.fn();
        render(<AsistenteConectores cargar={async () => LATIS} alCambiarLocal={alCambiarLocal} />);
        await screen.findByRole("switch", { name: "Interruptor de Ollama de la Mac" });
        fireEvent.click(screen.getByRole("switch", { name: "Interruptor de Ollama de la Mac" }));
        fireEvent.click(screen.getByRole("switch", { name: "Interruptor de Astraura 1.58 local" }));
        expect(alCambiarLocal).toHaveBeenCalledWith("ollama-mac", false);
        await waitFor(() => expect(screen.getByText(/Falta vincular/)).toBeTruthy());
    });

    it("Paso 2: «Vincular» abre el enlace oficial y la clave se envía y se borra", async () => {
        const enviarClave = vi.fn<(id: string, clave: string) => Promise<boolean>>().mockResolvedValue(true);
        render(<AsistenteConectores cargar={async () => LATIS} enviarClave={enviarClave} />);
        const enlace = await screen.findByRole("link", { name: /Vincular/ });
        expect(enlace).toHaveAttribute("href", "https://openrouter.ai/");
        expect(enlace).toHaveAttribute("target", "_blank");
        expect(enlace).toHaveAttribute("rel", "noopener noreferrer");
        const campo = screen.getByLabelText("Clave de OpenRouter gratis");
        fireEvent.change(campo, { target: { value: "sk-secreta" } });
        expect(screen.getByDisplayValue("sk-secreta")).toHaveProperty("type", "password");
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        await waitFor(() => expect(enviarClave).toHaveBeenCalledWith("openrouter-free", "sk-secreta"));
        await waitFor(() => expect(campo).toHaveValue(""));
    });

    it("Paso 3 y API por defecto: sin props usa GET /api/genesis/opciones y POST /api/genesis/conectores", async () => {
        const llaman = vi.fn(async (url: string, otra?: RequestInit): Promise<Response> =>
            url === "/api/genesis/opciones"
                ? ({ ok: true, json: async () => LATIS } as unknown as Response)
                : ({ ok: true } as unknown as Response));
        vi.stubGlobal("fetch", llaman);
        render(<AsistenteConectores />);
        await screen.findByRole("switch", { name: "Interruptor de Astraura 1.58 local" });
        expect(screen.getAllByText("escritor").length).toBeGreaterThan(0);
        expect(screen.getByText(/Capacidad local encendida/)).toBeTruthy();
        const campo = screen.getByLabelText("Clave de OpenRouter gratis");
        fireEvent.change(campo, { target: { value: "otra-clave" } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        await waitFor(() => expect(llaman).toHaveBeenCalledWith("/api/genesis/conectores", expect.anything()));
    });
});
