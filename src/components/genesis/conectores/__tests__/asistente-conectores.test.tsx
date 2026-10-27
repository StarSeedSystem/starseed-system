import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { AsistenteConectores, huellaDeClave, cadenaPapel, type OpcionLocal, type OpcionGratuita, type Papel } from "../asistente-conectores";

afterEach(cleanup);

const locales: OpcionLocal[] = [
    { id: "n1", nombre: "Mac del estudio", tipo: "neurona", detalle: "BitNet 1.58 local" },
    { id: "a1", nombre: "Capa nube Astraura", tipo: "astraura", detalle: "quepa en el ámbito" },
];
const g1: OpcionGratuita = { id: "g1", nombre: "Proveedor A", enlaceAlta: "https://a.example/alta", enlaceClave: "https://a.example/keys", variableClave: "API_A_KEY", limite: "20 peticiones/min", limitesVerificados: true };
const g2: OpcionGratuita = { id: "g2", nombre: "Proveedor B", enlaceAlta: "https://b.example/alta", enlaceClave: "https://b.example/keys", variableClave: "API_B_KEY", limite: null };
const escritor: Papel = { id: "escritor", nombre: "Escritor" };

describe("huellaDeClave", () => {
    it("devuelve solo los extremos, nunca la clave completa", () => {
        expect(huellaDeClave("sk-1234567890abcdef")).toBe("sk-1…cdef");
    });
    it("enmascara por completo las claves cortas", () => {
        expect(huellaDeClave("abc")).toBe("•••");
    });
});

describe("cadenaPapel", () => {
    it("pone la local primero y la gratis después, con motivo", () => {
        const es = cadenaPapel(escritor, [locales[0]], [g1]);
        expect(es[0].nombre).toBe("Mac del estudio");
        expect(es[0].motivo).toContain("local primero (neurona)");
        expect(es[1].motivo).toContain("gratis vinculada");
    });
    it("no inventa medios cuando no hay nada encendido ni vinculado", () => {
        const es = cadenaPapel({ id: "chat", nombre: "Chat" }, [], []);
        expect(es).toHaveLength(1);
    });
});

describe("AsistenteConectores", () => {
    it("alterna los interruptores del paso local", () => {
        render(<AsistenteConectores locales={locales} gratuitas={[]} enviarClave={async () => ({ ok: true })} />);
        const interruptor = screen.getByRole("switch", { name: /Mac del estudio/ });
        expect(interruptor.getAttribute("aria-checked")).toBe("false");
        fireEvent.click(interruptor);
        expect(interruptor.getAttribute("aria-checked")).toBe("true");
    });
    it("vincula con los enlaces oficiales inyectados", () => {
        const abrir = vi.fn();
        render(<AsistenteConectores locales={[]} gratuitas={[g1]} abrir={abrir} enviarClave={async () => ({ ok: true })} />);
        fireEvent.click(screen.getByRole("button", { name: /^Vincular/ }));
        fireEvent.click(screen.getByRole("button", { name: /Página de la clave/ }));
        expect(abrir).toHaveBeenCalledWith("https://a.example/alta");
        expect(abrir).toHaveBeenCalledWith("https://a.example/keys");
    });
    it("abre por defecto en pestaña nueva (_blank, noopener)", () => {
        const espia = vi.spyOn(window, "open").mockReturnValue(null);
        render(<AsistenteConectores locales={[]} gratuitas={[g1]} enviarClave={async () => ({ ok: true })} />);
        fireEvent.click(screen.getByRole("button", { name: /^Vincular/ }));
        expect(espia).toHaveBeenCalledWith("https://a.example/alta", "_blank", "noopener");
        espia.mockRestore();
    });
    it("muestra el dato sin verificar cuando el límite es null, sin inventarlo", () => {
        render(<AsistenteConectores locales={[]} gratuitas={[g2]} enviarClave={async () => ({ ok: true })} />);
        expect(screen.getByText(/sin verificar/)).toBeTruthy();
    });
    it("envía la clave a la API, borra el campo y enseña solo la huella", async () => {
        const enviarClave = vi.fn(async () => ({ ok: true, huella: "sk-1…cdef" }));
        render(<AsistenteConectores locales={[]} gratuitas={[g1]} enviarClave={enviarClave} />);
        const campo = screen.getByLabelText("Clave de Proveedor A", { exact: false }) as HTMLInputElement;
        fireEvent.change(campo, { target: { value: "sk-1234567890abcdef" } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar clave" }));
        await screen.findByText(/guardada en la bóveda del ámbito/);
        expect(enviarClave).toHaveBeenCalledWith("g1", "sk-1234567890abcdef");
        expect(campo.value).toBe("");
        expect(screen.queryByText("sk-1234567890abcdef")).toBeNull();
        await screen.findByText(/sk-1…cdef/);
    });
    it("avisa del fallo y borra la clave aunque la API falle", async () => {
        const enviarClave = vi.fn(async () => ({ ok: false, error: "cupo agotado" }));
        render(<AsistenteConectores locales={[]} gratuitas={[g1]} enviarClave={enviarClave} />);
        const campo = screen.getByLabelText("Clave de Proveedor A", { exact: false }) as HTMLInputElement;
        fireEvent.change(campo, { target: { value: "sk-1234567890abcdef" } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar clave" }));
        await screen.findByText(/No se pudo guardar la clave de Proveedor A/);
        expect(campo.value).toBe("");
    });
    it("resume por papel la cadena elegida con su motivo", () => {
        render(<AsistenteConectores locales={locales} gratuitas={[g1]} papeles={[escritor]} enviarClave={async () => ({ ok: true })} />);
        fireEvent.click(screen.getByRole("switch", { name: /Mac del estudio/ }));
        fireEvent.click(screen.getByRole("button", { name: "Papeles" }));
        expect(screen.getByTitle(/local primero \(neurona\)/)).toBeTruthy();
        expect(screen.getByText("Mac del estudio")).toBeTruthy();
    });
    it("sin medios activados ni claves, el resumen lo dice en vez de inventar", () => {
        render(<AsistenteConectores locales={locales} gratuitas={[g1]} papeles={[escritor]} enviarClave={async () => ({ ok: true })} />);
        fireEvent.click(screen.getByRole("button", { name: "Papeles" }));
        expect(screen.getByText("Escritor: sin medios")).toBeTruthy();
    });
});
