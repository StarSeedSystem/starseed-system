import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AsistenteConectores, resumenPorPapel, type LocalDelContexto } from "../asistente-conectores";
import type { Sugerencia } from "@/lib/genesis/conectores/sugerir";

const locales = (): LocalDelContexto[] => [
    { id: "bitnet-mac", nombre: "BitNet de esta Mac", clase: "astraura", papeles: ["escritor", "chat"], detalle: "1.58-bit listo en la neurona", encendido: true },
    { id: "cerebro-ester", nombre: "Servidor del cerebro Ester", clase: "cerebro", papeles: ["revisor"], detalle: "brain_server_links activo", encendido: false },
];

const sugerida = (d: Partial<Sugerencia> = {}): Sugerencia => ({
    id: "groq", nombre: "Groq", tipo: "proveedor", papeles: ["escritor"],
    enlaceAlta: "https://console.groq.com", enlaceClave: "https://console.groq.com/keys",
    limite: null, verificado: null, privacidad: "nube-sin-retencion", variables: ["STARK_GROQ_RAW_KEY"],
    motivo: "Gratis: crea tu cuenta en el enlace oficial y vincula la clave.", ...d,
});

type Props = ComponentProps<typeof AsistenteConectores>;
const base: Props = {
    ambitoTipo: "cuenta", ambitoNombre: "Casa StarSeed", papeles: ["escritor", "revisor"],
    locales: locales(),
    gratis: [
        sugerida(),
        sugerida({ id: "trino", nombre: "Trino", enlaceAlta: null, enlaceClave: null, papeles: ["revisor"], variables: [] }),
    ],
};
const montar = (extra: Partial<Props> = {}) => render(<AsistenteConectores {...({ ...base, ...extra } as Props)} />);

afterEach(cleanup);

describe("Asistente «Conectar Genesis»", () => {
    it("resumenPorPapel: gana lo local encendido, después lo gratis; sin nada, sin opción", () => {
        const r = resumenPorPapel(
            ["escritor", "revisor"], locales(), new Set(["bitnet-mac"]),
            [sugerida(), sugerida({ id: "trino", papeles: ["revisor"] })]);
        expect(r[0]).toEqual({ papel: "escritor", elegido: "BitNet de esta Mac", motivo: "Local (astraura): 1.58-bit listo en la neurona" });
        expect(r[1]).toEqual({ papel: "revisor", elegido: "Groq", motivo: "Gratis: crea tu cuenta en el enlace oficial y vincula la clave." });
        expect(resumenPorPapel(["código"], locales(), new Set(), [])).toEqual([
            { papel: "código", elegido: null, motivo: "Sin opción todavía: activa lo local o vincula una clave gratis." },
        ]);
    });

    it("paso 1: los interruptores locales alternan el aria-checked y avisan al ámbito", () => {
        const alEncender = vi.fn();
        montar({ alEncenderLocal: alEncender });
        const cerebro = screen.getByTestId("asistente-local-cerebro-ester");
        expect(cerebro).toHaveAttribute("aria-checked", "false");
        fireEvent.click(cerebro);
        expect(cerebro).toHaveAttribute("aria-checked", "true");
        expect(alEncender).toHaveBeenCalledWith("cerebro-ester", true);
        fireEvent.click(screen.getByTestId("asistente-local-bitnet-mac"));
        expect(screen.getByTestId("asistente-local-bitnet-mac")).toHaveAttribute("aria-checked", "false");
        expect(alEncender).toHaveBeenCalledWith("bitnet-mac", false);
    });

    it("paso 2: «Vincular» apunta al enlace oficial del servicio en una pestaña nueva", () => {
        montar();
        fireEvent.click(screen.getByTestId("asistente-paso-2"));
        const groq = screen.getByTestId("asistente-vincular-groq");
        expect(groq).toHaveAttribute("href", "https://console.groq.com/keys");
        expect(groq).toHaveAttribute("target", "_blank");
        expect(groq).toHaveAttribute("rel", "noopener noreferrer");
        expect(screen.getByTestId("asistente-vincular-trino")).toHaveAttribute("href", "#");
    });

    it("paso 2: la clave se envía a la API UNA vez y se borra del campo", async () => {
        const enviar = vi.fn(async () => true);
        montar({ enviarClave: enviar });
        fireEvent.click(screen.getByTestId("asistente-paso-2"));
        fireEvent.change(screen.getByTestId("asistente-clave-groq"), { target: { value: "gsk-prueba" } });
        fireEvent.click(screen.getByTestId("asistente-guardar-groq"));
        await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
        expect(enviar).toHaveBeenCalledWith({
            ambitoTipo: "cuenta", ambitoNombre: "Casa StarSeed", opcionId: "groq",
            variable: "STARK_GROQ_RAW_KEY", clave: "gsk-prueba",
        });
        expect((screen.getByTestId("asistente-clave-groq") as HTMLInputElement).value).toBe("");
        expect(screen.getByTestId("asistente-guardar-groq")).toHaveTextContent("Guardada");
    });

    it("paso 2: si el almacén no confirma, avisa y conserva la clave en el campo sin marcar Guardada", async () => {
        montar({ enviarClave: vi.fn(async () => false) });
        fireEvent.click(screen.getByTestId("asistente-paso-2"));
        fireEvent.change(screen.getByTestId("asistente-clave-groq"), { target: { value: "gsk-prueba" } });
        fireEvent.click(screen.getByTestId("asistente-guardar-groq"));
        await waitFor(() => expect(screen.getByTestId("asistente-aviso")).toHaveTextContent("No se pudo guardar"));
        expect((screen.getByTestId("asistente-clave-groq") as HTMLInputElement).value).toBe("gsk-prueba");
        expect(screen.getByTestId("asistente-guardar-groq")).not.toHaveTextContent("Guardada");
    });

    it("paso 2: sin clave en el campo no envía nada y avisa", () => {
        const enviar = vi.fn(async () => true);
        montar({ enviarClave: enviar });
        fireEvent.click(screen.getByTestId("asistente-paso-2"));
        fireEvent.click(screen.getByTestId("asistente-guardar-groq"));
        expect(screen.getByTestId("asistente-aviso")).toHaveTextContent("Pega la clave");
        expect(enviar).not.toHaveBeenCalled();
    });

    it("paso 3: enseña por papel la cadena elegida y su motivo; sin candidatura, «sin opción»", () => {
        montar({ papeles: ["escritor", "revisor", "código"] });
        fireEvent.click(screen.getByTestId("asistente-paso-3"));
        const escritor = screen.getByTestId("asistente-resumen-escritor");
        expect(escritor).toHaveTextContent("escritor: BitNet de esta Mac");
        expect(escritor).toHaveTextContent("Local (astraura)");
        const revisor = screen.getByTestId("asistente-resumen-revisor");
        expect(revisor).toHaveTextContent("revisor: Trino");
        expect(revisor).toHaveTextContent("Gratis: crea tu cuenta");
        expect(screen.getByTestId("asistente-resumen-código")).toHaveTextContent("código: sin opción");
    });
});
