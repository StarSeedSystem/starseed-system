// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { aplicar, observar, recogerTextos, restaurar } from "@/lib/traduccion/pagina";

const TRADUCCIONES = new Map([
  ["Hola", "Hello"],
  ["Etiqueta", "Tooltip"],
  ["Foto", "Photo"],
  ["Nombre", "Name"],
  ["Escribe tu nombre", "Type your name"],
  ["nuevo párrafo", "new paragraph"],
]);

const HTML_INICIAL =
  `<div><p title="Etiqueta">Hola</p><img alt="Foto">` +
  `<button aria-label="Nombre" hidden title="oculto"></button>` +
  `<input placeholder="Escribe tu nombre"></div>`;

let raiz: HTMLElement;

const tick = (): Promise<void> => new Promise((resolver) => setTimeout(resolver, 0));

beforeEach(() => {
  document.body.innerHTML = "";
  raiz = document.createElement("div");
  document.body.appendChild(raiz);
  raiz.innerHTML = HTML_INICIAL;
});

describe("recogerTextos", () => {
  it("recoge el texto visible y los cuatro atributos, sin lo oculto ni vacío", () => {
    expect(recogerTextos(raiz).map((item) => [item.texto, item.atributo ?? null])).toEqual([
      ["Hola", null],
      ["Etiqueta", "title"],
      ["Foto", "alt"],
      ["Escribe tu nombre", "placeholder"],
    ]);
  });

  it("no recoge espacios en blanco a secas", () => {
    raiz.innerHTML = "   \n  <span>libre</span>  ";
    expect(recogerTextos(raiz).map((item) => item.texto)).toEqual(["libre"]);
  });

  // Cada exclusión del contrato: nada «dentro» de un nodo excluido sale, y lo de al lado sí.
  const EXCLUIDOS: Array<[string, string]> = [
    ["script", "<script>suerte()</script>"],
    ["style", "<style>.a{color:'suerte'}</style>"],
    ["noscript", "<noscript>suerte</noscript>"],
    ["code", "<code>suerte</code>"],
    ["pre", "<pre>suerte</pre>"],
    ["textarea", "<textarea>suerte</textarea>"],
    ["select", "<select><option>suerte</option></select>"],
    ["contenteditable", "<div contenteditable='true'>suerte</div>"],
    ["translate=no", "<div translate='no'>suerte</div>"],
    ["data-no-traducir", "<div data-no-traducir>suerte</div>"],
    ["hidden", "<div hidden>suerte</div>"],
  ];

  it.each(EXCLUIDOS)("nunca dentro de %s", (_nombre, prohibido) => {
    raiz.innerHTML = `<span>libre</span>${prohibido}`;
    expect(recogerTextos(raiz).map((item) => item.texto)).toEqual(["libre"]);
  });

  it("los atributos de un campo de formulario sí se recogen, aunque el elemento esté excluido", () => {
    raiz.innerHTML = `<textarea title="Escribir">suerte</textarea>`;
    expect(recogerTextos(raiz).map((item) => item.atributo)).toEqual(["title"]);
  });

  it("no recoge atributos de lo marcado en contra", () => {
    raiz.innerHTML =
      `<div data-no-traducir title="anulado">dos</div>` +
      `<div translate="no" title="anulado">tres</div>`;
    expect(recogerTextos(raiz)).toEqual([]);
  });
});

describe("aplicar y restaurar", () => {
  it("aplica traducciones, marca el padre con lang y data-traducido", () => {
    const aplicados = aplicar(recogerTextos(raiz), TRADUCCIONES, "en");
    expect(aplicados).toBe(4);
    const parrafo = raiz.querySelector("p") as HTMLParagraphElement;
    expect(parrafo.textContent).toBe("Hello");
    expect(parrafo.getAttribute("title")).toBe("Tooltip");
    expect(parrafo.lang).toBe("en");
    expect(parrafo.getAttribute("data-traducido")).toBe("en");
    expect((raiz.querySelector("img") as HTMLImageElement).getAttribute("alt")).toBe("Photo");
    const campo = raiz.querySelector("input") as HTMLInputElement;
    expect(campo.getAttribute("placeholder")).toBe("Type your name");
    expect(campo.lang).toBe("en");
    // El botón oculto no se tocó: su aria-label y su title no se recogen.
    expect(raiz.querySelector("button")?.getAttribute("aria-label")).toBe("Nombre");
  });

  it("omite lo que no tiene traducción", () => {
    raiz.innerHTML = "<p>Hola</p><span>sin,vocabulario</span>";
    expect(aplicar(recogerTextos(raiz), TRADUCCIONES, "en")).toBe(1);
  });

  it("ida y vuelta exacta", () => {
    const antes = raiz.innerHTML;
    aplicar(recogerTextos(raiz), TRADUCCIONES, "en");
    restaurar(raiz);
    expect(raiz.innerHTML).toBe(antes);
    expect(raiz.querySelectorAll("[data-traducido], [lang]")).toHaveLength(0);
  });

  it("restaurar sin nada traducido no cambia nada", () => {
    const antes = raiz.innerHTML;
    restaurar(raiz);
    expect(raiz.innerHTML).toBe(antes);
  });
});

describe("observar", () => {
  it("no vuelve a traducir lo ya traducido y detecta texto nuevo", async () => {
    const vistas: string[][] = [];
    const parar = observar(raiz, (nuevos) => vistas.push(nuevos.map((item) => item.texto)));
    aplicar(recogerTextos(raiz), TRADUCCIONES, "en");
    await tick();
    expect(vistas).toEqual([]);
    const nuevo = document.createElement("p");
    nuevo.textContent = "nuevo párrafo";
    raiz.appendChild(nuevo);
    await tick();
    expect(vistas).toEqual([["nuevo párrafo"]]);
    parar();
    raiz.appendChild(document.createTextNode("después de parar"));
    await tick();
    expect(vistas).toEqual([["nuevo párrafo"]]);
  });

  it("detecta un atributo nuevo asignado en la página en vivo", async () => {
    const vistas: string[][] = [];
    const parar = observar(raiz, (nuevos) => vistas.push(nuevos.map((item) => item.texto)));
    (raiz.querySelector("p") as HTMLParagraphElement).title = "Confirma";
    await tick();
    expect(vistas.some((v) => v.includes("Confirma"))).toBe(true);
    parar();
  });

  it("los nodos traducidos reaparecen tras restaurar", async () => {
    const vistas: string[][] = [];
    const parar = observar(raiz, (nuevos) => vistas.push(nuevos.map((item) => item.texto)));
    aplicar(recogerTextos(raiz), TRADUCCIONES, "en");
    await tick();
    restaurar(raiz);
    await tick();
    expect(vistas).toEqual([["Hola", "Etiqueta", "Foto", "Escribe tu nombre"]]);
    parar();
  });
});
