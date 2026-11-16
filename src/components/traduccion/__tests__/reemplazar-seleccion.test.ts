import { describe, it, expect, beforeEach } from "vitest";
import { capturarSeleccionEditable, reemplazar, deshacerUltimo } from "../reemplazar-seleccion";

describe("reemplazar-seleccion", () => {
    it("captura selección en input de texto y reemplaza", () => {
        const input = document.createElement("input");
        input.type = "text";
        input.value = "Hola mundo";
        document.body.appendChild(input);
        input.focus();
        input.setSelectionRange(0, 4);

        const objetivo = capturarSeleccionEditable(document);
        expect(objetivo).not.toBeNull();
        expect(objetivo?.textoOriginal).toBe("Hola");

        const exito = reemplazar(objetivo!, "Saludos");
        expect(exito).toBe(true);
        expect(input.value).toBe("Saludos mundo");

        document.body.removeChild(input);
    });

    it("rechaza input type=password", () => {
        const input = document.createElement("input");
        input.type = "password";
        input.value = "secreto";
        document.body.appendChild(input);
        input.focus();
        input.setSelectionRange(0, 7);

        const objetivo = capturarSeleccionEditable(document);
        expect(objetivo).toBeNull();

        document.body.removeChild(input);
    });

    it("captura en textarea y deshace", () => {
        const textarea = document.createElement("textarea");
        textarea.value = "Texto largo";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.setSelectionRange(6, 11);

        const objetivo = capturarSeleccionEditable(document);
        expect(objetivo?.textoOriginal).toBe("largo");

        reemplazar(objetivo!, "breve");
        expect(textarea.value).toBe("Texto breve");

        const rehecho = deshacerUltimo();
        expect(rehecho).toBe(true);
        expect(textarea.value).toBe("Texto largo");

        document.body.removeChild(textarea);
    });

    it("devuelve false si el elemento ya no está en el documento", () => {
        const input = document.createElement("input");
        input.value = "Prueba";
        document.body.appendChild(input);
        input.focus();
        input.setSelectionRange(0, 6);

        const objetivo = capturarSeleccionEditable(document);
        document.body.removeChild(input);

        const exito = reemplazar(objetivo!, "Otro");
        expect(exito).toBe(false);
    });
});
