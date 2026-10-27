// @vitest-environment jsdom
import { type TextoRecogido, aplicar, observar, recogerTextos, restaurar } from "../pagina";
import { afterEach, describe, expect, it, vi } from "vitest";

function montar(html: string): HTMLElement {
    const raiz = document.createElement("div");
    raiz.innerHTML = html;
    document.body.appendChild(raiz);
    return raiz;
}

const textos = (nodos: TextoRecogido[]): string[] => nodos.map((nodo) => nodo.texto);

afterEach(() => { document.body.innerHTML = ""; });

describe("recogerTextos", () => {
    it("nunca recoge dentro de script, style, noscript, code, pre, textarea, select ni contenteditable", () => {
        const raiz = montar(
            `<script>prohibido()</script><style>.a{content: "prohibido"}</style>` +
            `<noscript>prohibido</noscript><code>prohibido</code><pre> prohibido </pre>` +
            `<textarea>prohibido</textarea><select><option>prohibido</option></select>` +
            `<div contenteditable="true">prohibido</div><p>visible</p>`,
        );
        expect(textos(recogerTextos(raiz))).toEqual(["visible"]);
    });

    it("respeta translate=no, data-no-traducir y hidden, también en sus atributos", () => {
        const raiz = montar(
            `<p translate="no">prohibido</p><p data-no-traducir>prohibido dos</p>` +
            `<p hidden>prohibido tres</p>` +
            `<img alt="prohibido cuatro" data-no-traducir/>` +
            `<img hidden alt="prohibido cinco"/>` +
            `<img alt="imagen nueva" title="subida"/>`,
        );
        expect(textos(recogerTextos(raiz))).toEqual(["imagen nueva", "subida"]);
    });
});

describe("aplicar y restaurar", () => {
    it("traduce solo lo que tiene traducción, marca el padre e ida y vuelta exacta", () => {
        const raiz = montar(`<p>Hola</p><p>sin clave</p><img alt="imagen de la cumbre" title="señaliza"/>`);
        expect(aplicar(recogerTextos(raiz), { Hola: "Salut", señaliza: "seal" }, "ca")).toBe(2);
        const traducido = raiz.querySelectorAll("p")[0];
        const imagen = raiz.querySelector("img") as HTMLImageElement;

        expect(traducido.textContent).toBe("Salut");
        expect(traducido.getAttribute("lang")).toBe("ca");
        expect(traducido.getAttribute("data-traducido")).toBe("true");
        expect(imagen.getAttribute("title")).toBe("seal");

        restaurar(raiz);
        expect(traducido.textContent).toBe("Hola");
        expect(traducido.hasAttribute("lang")).toBe(false);
        expect(traducido.hasAttribute("data-traducido")).toBe(false);
        expect(imagen.getAttribute("alt")).toBe("imagen de la cumbre");
        expect(imagen.getAttribute("title")).toBe("señaliza");
    });
});

describe("rescate de la rama nube/40550707104", () => {
    it("recoge los atributos title, alt, aria-label y placeholder fuera de los campos editables", () => {
        const raiz = montar(
            `<img alt='Logo' title='Imagen'><button aria-label='Campo'></button><section placeholder='Busca…'></section>`,
        );
        const recogidos = recogerTextos(raiz)
            .filter((t): t is Extract<TextoRecogido, { clase: "atributo" }> => t.clase === "atributo")
            .map((t) => `${t.atributo}=${t.texto.trim()}`);
        expect(recogidos).toHaveLength(4);
        for (const par of ["title=Imagen", "alt=Logo", "aria-label=Campo", "placeholder=Busca…"])
            expect(recogidos).toContain(par);
    });

    it("no recoge atributos vacíos ni en blanco", () => {
        const raiz = montar(`<img alt='' title='  '/><p aria-label='  '>Texto</p>`);
        const recogidos = recogerTextos(raiz);
        expect(recogidos.filter((t): t is Extract<TextoRecogido, { clase: "atributo" }> => t.clase === "atributo")).toEqual([]);
        expect(recogidos.map((t) => t.texto)).toEqual(["Texto"]);
    });

    it("aplica sobre el texto exacto y al restaurar conserva el lang previo del elemento", () => {
        const raiz = montar("<p>  Hola  </p><p lang='pt'>Dos</p>");
        expect(aplicar(recogerTextos(raiz), { "  Hola  ": "Hello", Dos: "Two" }, "en")).toBe(2);
        const primero = raiz.querySelectorAll("p")[0] as HTMLElement;
        const segundo = raiz.querySelectorAll("p")[1] as HTMLElement;
        expect(primero.textContent).toBe("Hello");
        expect(primero.getAttribute("lang")).toBe("en");
        expect(primero.hasAttribute("data-traducido")).toBe(true);
        expect(segundo.getAttribute("lang")).toBe("en");

        restaurar(raiz);
        expect(primero.textContent).toBe("  Hola  ");
        expect(primero.getAttribute("lang")).toBeNull();
        expect(primero.hasAttribute("data-traducido")).toBe(false);
        expect(segundo.textContent).toBe("Dos");
        expect(segundo.getAttribute("lang")).toBe("pt");
    });
});

describe("observar", () => {
    it("avisa de los textos nuevos y no vuelve a traducir lo ya traducido", async () => {
        const raiz = montar("<p>viejo</p>");
        aplicar(recogerTextos(raiz), { viejo: "traducido" }, "es");
        const avisos = vi.fn((nodos: TextoRecogido[]) => aplicar(nodos, { nuevo: "entre nuevo" }, "es"));
        const detener = observar(raiz, avisos);

        raiz.insertAdjacentHTML("beforeend", "<p>nuevo</p>");
        await expect.poll(() => avisos.mock.calls.length).toBeGreaterThan(0);
        expect(avisos.mock.calls[0][0].map((nodo: TextoRecogido) => nodo.texto)).toEqual(["nuevo"]);
        await new Promise((hecho) => setTimeout(hecho, 30));
        expect(avisos.mock.calls.length).toBe(1);
        expect(raiz.querySelectorAll("p")[1].textContent).toBe("entre nuevo");

        detener();
        raiz.insertAdjacentHTML("beforeend", "<p>otro</p>");
        await new Promise((hecho) => setTimeout(hecho, 30));
        expect(avisos.mock.calls.length).toBe(1);
        expect(raiz.querySelectorAll("p")[2].textContent).toBe("otro");
    });
});
