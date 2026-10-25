/**
 * ACC1025A · El formulario único de acceso (Entrar / Crear cuenta / código por correo).
 *
 * Monta el AuthForm real con Supabase, el router y el director del rito simulados, y comprueba lo que
 * prometía la ventana guiada y lo que tenía AuthGate: pestañas, «Mostrar», confirmación al crear la cuenta,
 * el `?next=` seguro, el rito tras el alta y «Entrar con código por correo (sin contraseña)» contra las
 * MISMAS rutas de siempre (`/api/auth/otp/request` y `/api/auth/otp/verify`).
 */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sim = vi.hoisted(() => ({
    push: vi.fn(),
    refresh: vi.fn(),
    signIn: vi.fn(),
    signUp: vi.fn(),
    setSession: vi.fn(),
    iniciarRito: vi.fn(),
    navegarSuave: vi.fn(),
    olvidar: vi.fn(),
    sugerido: null as string | null,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: sim.push, refresh: sim.refresh }) }));
vi.mock("@/utils/supabase/client", () => ({
    createClient: () => ({
        auth: { signInWithPassword: sim.signIn, signUp: sim.signUp, setSession: sim.setSession },
    }),
}));
vi.mock("@/lib/onboarding/director-rito", () => ({ iniciarRito: sim.iniciarRito, navegarSuave: sim.navegarSuave }));
vi.mock("@/lib/entorno/deteccion-entorno", () => ({
    emailSugerido: () => sim.sugerido,
    olvidarEmailSugerido: sim.olvidar,
}));
vi.mock("@/lib/aurora/voz-starseed/motor", () => ({ precalentar: async () => undefined }));

import { AuthForm } from "../auth-form";

const respuesta = (cuerpo: unknown, ok = true) => ({ ok, json: async () => cuerpo }) as unknown as Response;

function escribir(etiqueta: string | RegExp, valor: string) {
    fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });
}

beforeEach(() => {
    vi.clearAllMocks();
    sim.sugerido = null;
    sim.signIn.mockResolvedValue({ error: null });
    sim.signUp.mockResolvedValue({ error: null, data: { session: { access_token: "a" } } });
    sim.setSession.mockResolvedValue({ error: null });
    window.history.pushState({}, "", "/login");
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe("AuthForm · pestañas, mostrar y confirmación", () => {
    it("abre en «Entrar» y cambia a «Crear cuenta» con confirmación de contraseña", () => {
        render(<AuthForm />);
        expect(screen.getByRole("tab", { name: "Entrar" })).toHaveAttribute("aria-selected", "true");
        expect(screen.queryByLabelText("Confirmar contraseña")).toBeNull();
        fireEvent.click(screen.getByRole("tab", { name: "Crear cuenta" }));
        expect(screen.getByRole("tab", { name: "Crear cuenta" })).toHaveAttribute("aria-selected", "true");
        expect(screen.getByLabelText("Confirmar contraseña")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Crear mi cuenta" })).toBeInTheDocument();
        // El código por correo es de «Entrar».
        expect(screen.queryByRole("button", { name: /código por correo/ })).toBeNull();
    });

    it("puede abrir directamente en «Crear cuenta»", () => {
        render(<AuthForm pestanaInicial="signup" />);
        expect(screen.getByRole("tab", { name: "Crear cuenta" })).toHaveAttribute("aria-selected", "true");
    });

    it("las flechas del teclado cambian de pestaña", () => {
        render(<AuthForm />);
        fireEvent.keyDown(screen.getByRole("tab", { name: "Entrar" }), { key: "ArrowRight" });
        expect(screen.getByRole("tab", { name: "Crear cuenta" })).toHaveAttribute("aria-selected", "true");
    });

    it("«Mostrar» enseña y «Ocultar» esconde la contraseña", () => {
        render(<AuthForm />);
        const campo = screen.getByLabelText("Contraseña") as HTMLInputElement;
        expect(campo.type).toBe("password");
        fireEvent.click(screen.getByRole("button", { name: "Mostrar contraseña" }));
        expect(campo.type).toBe("text");
        fireEvent.click(screen.getByRole("button", { name: "Ocultar contraseña" }));
        expect(campo.type).toBe("password");
    });

    it("avisa si las contraseñas no coinciden y no deja crear la cuenta", () => {
        render(<AuthForm pestanaInicial="signup" />);
        escribir("Correo", "ana@star.seed");
        escribir("Contraseña", "secreto1");
        escribir("Confirmar contraseña", "secreto2");
        expect(screen.getByText("Las contraseñas no coinciden.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Crear mi cuenta" })).toBeDisabled();
    });

    it("el correo y la contraseña se conservan al cambiar de pestaña", () => {
        render(<AuthForm />);
        escribir("Correo", "ana@correo.com");
        escribir("Contraseña", "secreto1");
        fireEvent.click(screen.getByRole("tab", { name: "Crear cuenta" }));
        expect((screen.getByLabelText("Correo") as HTMLInputElement).value).toBe("ana@correo.com");
        expect((screen.getByLabelText("Contraseña") as HTMLInputElement).value).toBe("secreto1");
    });

    it("sugiere la dirección @star.seed mientras se teclea el nombre", () => {
        render(<AuthForm pestanaInicial="signup" />);
        escribir("Correo", "Ana Luz");
        expect(screen.getByRole("button", { name: /Usar analuz@star\.seed/ })).toBeInTheDocument();
    });
});

describe("AuthForm · entrar con contraseña", () => {
    it("entra y, sin más indicaciones, va a la página principal", async () => {
        const alEntrar = vi.fn();
        render(<AuthForm onEntrado={alEntrar} />);
        escribir("Correo", " ana@star.seed ");
        escribir("Contraseña", "secreto1");
        fireEvent.click(screen.getByRole("button", { name: "Entrar a StarSeed OS" }));
        await waitFor(() => expect(sim.push).toHaveBeenCalledWith("/"));
        expect(sim.signIn).toHaveBeenCalledWith({ email: "ana@star.seed", password: "secreto1" });
        expect(sim.refresh).toHaveBeenCalled();
        expect(sim.olvidar).toHaveBeenCalled();
        expect(alEntrar).toHaveBeenCalledWith("password");
    });

    it("con destinoAlEntrar={null} se queda donde está (solo refresca)", async () => {
        render(<AuthForm destinoAlEntrar={null} />);
        escribir("Correo", "ana@star.seed");
        escribir("Contraseña", "secreto1");
        fireEvent.click(screen.getByRole("button", { name: "Entrar a StarSeed OS" }));
        await waitFor(() => expect(sim.refresh).toHaveBeenCalled());
        expect(sim.push).not.toHaveBeenCalled();
    });

    it("respeta un ?next= seguro de la URL, incluso quedándose", async () => {
        window.history.pushState({}, "", "/login?next=%2Fllamada%2Fabc");
        render(<AuthForm destinoAlEntrar={null} />);
        escribir("Correo", "ana@star.seed");
        escribir("Contraseña", "secreto1");
        fireEvent.click(screen.getByRole("button", { name: "Entrar a StarSeed OS" }));
        await waitFor(() => expect(sim.push).toHaveBeenCalledWith("/llamada/abc"));
    });

    it("un error de Supabase sale en español, en línea y como alerta", async () => {
        sim.signIn.mockResolvedValue({ error: { message: "Invalid login credentials" } });
        render(<AuthForm />);
        escribir("Correo", "ana@star.seed");
        escribir("Contraseña", "mala");
        fireEvent.click(screen.getByRole("button", { name: "Entrar a StarSeed OS" }));
        const alerta = await screen.findByRole("alert");
        expect(alerta.textContent).toContain("Correo o contraseña incorrectos.");
        expect(sim.push).not.toHaveBeenCalled();
    });

    it("«Continuar como…»: el correo sugerido llega rellenado", () => {
        sim.sugerido = "ana@star.seed";
        render(<AuthForm />);
        expect((screen.getByLabelText("Correo") as HTMLInputElement).value).toBe("ana@star.seed");
    });
});

describe("AuthForm · crear cuenta", () => {
    it("con sesión al instante abre el rito y lleva a /bienvenida", async () => {
        const alEntrar = vi.fn();
        render(<AuthForm pestanaInicial="signup" onEntrado={alEntrar} />);
        escribir("Correo", "ana@star.seed");
        escribir("Contraseña", "secreto1");
        escribir("Confirmar contraseña", "secreto1");
        fireEvent.click(screen.getByRole("button", { name: "Crear mi cuenta" }));
        await waitFor(() => expect(sim.navegarSuave).toHaveBeenCalledWith(expect.anything(), "/bienvenida"));
        expect(sim.signUp).toHaveBeenCalledWith(expect.objectContaining({ email: "ana@star.seed", password: "secreto1" }));
        expect(sim.iniciarRito).toHaveBeenCalled();
        expect(alEntrar).toHaveBeenCalledWith("registro");
    });

    it("sin sesión automática lo dice con honestidad y no abre el rito", async () => {
        sim.signUp.mockResolvedValue({ error: null, data: { session: null } });
        render(<AuthForm pestanaInicial="signup" />);
        escribir("Correo", "ana@correo.com");
        escribir("Contraseña", "secreto1");
        escribir("Confirmar contraseña", "secreto1");
        fireEvent.click(screen.getByRole("button", { name: "Crear mi cuenta" }));
        const aviso = await screen.findByRole("status");
        expect(aviso.textContent).toContain("No se abrió sesión automática");
        expect(sim.iniciarRito).not.toHaveBeenCalled();
    });

    it("un error de registro sale traducido", async () => {
        sim.signUp.mockResolvedValue({ error: { message: "User already registered" }, data: { session: null } });
        render(<AuthForm pestanaInicial="signup" />);
        escribir("Correo", "ana@correo.com");
        escribir("Contraseña", "secreto1");
        escribir("Confirmar contraseña", "secreto1");
        fireEvent.click(screen.getByRole("button", { name: "Crear mi cuenta" }));
        const alerta = await screen.findByRole("alert");
        expect(alerta.textContent).toContain("Ese correo ya tiene cuenta. Inicia sesión.");
    });
});

describe("AuthForm · entrar con código por correo (sin contraseña)", () => {
    it("sin correo no pide nada y lo dice", async () => {
        const falso = vi.fn();
        vi.stubGlobal("fetch", falso);
        render(<AuthForm />);
        fireEvent.click(screen.getByRole("button", { name: "Entrar con código por correo (sin contraseña)" }));
        const alerta = await screen.findByRole("alert");
        expect(alerta.textContent).toContain("Escribe tu correo para enviarte el código.");
        expect(falso).not.toHaveBeenCalled();
    });

    it("pide el código a /api/auth/otp/request, lo verifica en /api/auth/otp/verify y abre la sesión", async () => {
        const falso = vi.fn(async (ruta: string) =>
            ruta === "/api/auth/otp/request"
                ? respuesta({ ok: true })
                : respuesta({ session: { access_token: "tok-a", refresh_token: "tok-r" } }),
        );
        vi.stubGlobal("fetch", falso);
        const alEntrar = vi.fn();
        render(<AuthForm onEntrado={alEntrar} />);
        escribir("Correo", "ana@star.seed");

        fireEvent.click(screen.getByRole("button", { name: "Entrar con código por correo (sin contraseña)" }));
        const campo = (await screen.findByLabelText("Código de 6 dígitos")) as HTMLInputElement;
        const [rutaPedir, initPedir] = falso.mock.calls[0] as unknown as [string, RequestInit];
        expect(rutaPedir).toBe("/api/auth/otp/request");
        expect(JSON.parse(String(initPedir.body))).toEqual({ email: "ana@star.seed" });
        expect((await screen.findByRole("status")).textContent).toContain("bandeja de correos y notificaciones del OS");

        // Solo cuentan los dígitos.
        fireEvent.change(campo, { target: { value: "12ab34-56" } });
        expect(campo.value).toBe("123456");

        fireEvent.click(screen.getByRole("button", { name: "Verificar código y entrar" }));
        await waitFor(() => expect(sim.setSession).toHaveBeenCalledWith({ access_token: "tok-a", refresh_token: "tok-r" }));
        const [rutaVerificar, initVerificar] = falso.mock.calls[1] as unknown as [string, RequestInit];
        expect(rutaVerificar).toBe("/api/auth/otp/verify");
        expect(JSON.parse(String(initVerificar.body))).toEqual({ email: "ana@star.seed", code: "123456" });
        await waitFor(() => expect(alEntrar).toHaveBeenCalledWith("codigo"));
        expect(sim.push).toHaveBeenCalledWith("/");
    });

    it("un código mal escrito no llega al servidor", async () => {
        const falso = vi.fn(async () => respuesta({ ok: true }));
        vi.stubGlobal("fetch", falso);
        render(<AuthForm />);
        escribir("Correo", "ana@star.seed");
        fireEvent.click(screen.getByRole("button", { name: "Entrar con código por correo (sin contraseña)" }));
        const campo = await screen.findByLabelText("Código de 6 dígitos");
        fireEvent.change(campo, { target: { value: "123" } });
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Verificar código y entrar" }));
        });
        expect((await screen.findByRole("alert")).textContent).toContain("Escribe el código de 6 dígitos");
        expect(falso).toHaveBeenCalledTimes(1); // solo la petición del código
        expect(sim.setSession).not.toHaveBeenCalled();
    });

    it("«Volver» regresa al botón", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => respuesta({ ok: true })));
        render(<AuthForm />);
        escribir("Correo", "ana@star.seed");
        fireEvent.click(screen.getByRole("button", { name: "Entrar con código por correo (sin contraseña)" }));
        await screen.findByLabelText("Código de 6 dígitos");
        fireEvent.click(screen.getByRole("button", { name: "Volver" }));
        expect(screen.getByRole("button", { name: "Entrar con código por correo (sin contraseña)" })).toBeInTheDocument();
    });
});
