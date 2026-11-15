/**
 * PER1115A — guarda: una ventana hecha a mano (no Radix) que está ENCIMA de un diálogo Radix modal recibe sus toques.
 *
 * Un diálogo Radix modal deja `pointer-events:none` en <body>; una capa hecha a mano que no lo anula lo hereda y los toques
 * caen en lo de debajo (visto en el móvil de Alex, 14-11: «Permisos de tu neurona» tapaba «Esta neurona»). user-event
 * rechaza el clic si `pointer-events` calculado es `none` en el elemento o en un ancestro: es la medida del hit-testing real.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { useState } from "react";

vi.mock("@/context/appearance-context", () => ({ useAppearance: () => ({ config: { themeStore: { activeMode: "secondary" } } }) }));

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ListaPermisos } from "@/components/nativa/lista-permisos";
import { GUARDADO_VACIO, abrirAsistente } from "@/lib/nativa/permisos-inicio";

const RAIZ = join(__dirname, "..", "..", "..", "..");
const CSS = readFileSync(join(RAIZ, "src/app/globals.css"), "utf8");

/** Solo los bloques de globals.css que hablan de las capas a mano (los demás necesitan Tailwind). */
function inyectarCss() {
  const bloques = CSS.match(/(?:\.ss-capa-modal|\[role="dialog"\][^{]*)[^{}]*\{[^}]*\}/g) ?? [];
  const st = document.createElement("style");
  st.setAttribute("data-test", "per1115a");
  st.textContent = bloques.join("\n");
  document.head.appendChild(st);
}

afterEach(() => {
  cleanup();
  document.head.querySelectorAll("style[data-test=per1115a]").forEach((n) => n.remove());
  document.body.removeAttribute("style");
});

/** Diálogo Radix abierto (el de «Esta neurona», el acceso…) y, además, la ventana hecha a mano que se prueba. */
function Escena({ encima, alCerrarRadix }: { encima: React.ReactNode; alCerrarRadix: () => void }) {
  const [abierto, setAbierto] = useState(true);
  return (
    <>
      <Dialog open={abierto} onOpenChange={(o) => { if (!o) alCerrarRadix(); setAbierto(o); }}>
        <DialogContent>
          <DialogTitle>Debajo</DialogTitle>
          <DialogDescription>Ventana Radix</DialogDescription>
        </DialogContent>
      </Dialog>
      {encima}
    </>
  );
}

const noop = () => {};
const permisos = () => (
  <ListaPermisos estado={abrirAsistente("android", GUARDADO_VACIO, true, {})} onEmpezar={noop} onOmitir={noop} onOmitirTodo={noop} onPedir={noop} onCerrar={noop} />
);

describe("ventanas a mano encima de un diálogo Radix modal (PER1115A)", () => {
  const casos: Array<[string, (clic: () => void) => React.ReactNode, string]> = [
    ["lista de permisos (real)", () => permisos(), "Cerrar"],
    ["capa .ss-capa-modal cualquiera", (clic) => (
      <div role="dialog" aria-modal="true" className="fixed inset-0 ss-capa-modal"><button onClick={clic}>Tocar</button></div>
    ), "Tocar"],
    ["role=dialog hecho a mano sin clase de capa", (clic) => (
      <div role="dialog" className="fixed inset-0"><button onClick={clic}>Tocar</button></div>
    ), "Tocar"],
  ];

  for (const [nombre, hacer, boton] of casos) {
    it(`${nombre}: recibe el clic y no cierra el diálogo de debajo`, async () => {
      inyectarCss();
      const clic = vi.fn();
      const cierreRadix = vi.fn();
      render(<Escena encima={hacer(clic)} alCerrarRadix={cierreRadix} />);
      expect(document.body.style.pointerEvents).toBe("none"); // Radix modal, como en el móvil
      const user = userEvent.setup(); // lanza si el botón (o un ancestro) tiene pointer-events:none
      // Radix pone aria-hidden en lo que no es suyo: se busca con `hidden`.
      const b = screen.getAllByRole("button", { name: boton, hidden: true }).find((x) => x.closest("[role=dialog]:not([data-state])"))!;
      await user.click(b);
      if (nombre.startsWith("lista")) expect(cierreRadix).not.toHaveBeenCalled();
      else expect(clic).toHaveBeenCalledTimes(1);
    });
  }

  it("sin la regla de globals.css el defecto se ve (el test mide de verdad)", async () => {
    const clic = vi.fn();
    render(<Escena encima={<div role="dialog" className="fixed inset-0"><button onClick={clic}>Tocar</button></div>} alCerrarRadix={noop} />);
    const user = userEvent.setup();
    await expect(user.click(screen.getByRole("button", { name: "Tocar", hidden: true }))).rejects.toThrow(/pointer-events/);
  });

  it("toda ventana hecha a mano de la app queda cubierta por la regla (role=dialog sin Radix → globals.css)", () => {
    // Cubre: `.ss-capa-modal` o cualquier `role="dialog"` sin `data-state`. Este escaneo avisa si la regla se quita.
    expect(CSS).toMatch(/\.ss-capa-modal,\s*\n\[role="dialog"\]:not\(\[data-state\]\)\s*\{\s*pointer-events:\s*auto/);
    const archivos: string[] = [];
    const recorrer = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) { if (n !== "__tests__" && n !== "node_modules") recorrer(p); }
        else if (/\.tsx$/.test(n)) archivos.push(p);
      }
    };
    recorrer(join(RAIZ, "src"));
    const conCapa = archivos.filter((f) => {
      const t = readFileSync(f, "utf8");
      return /role="dialog"/.test(t) && /fixed inset-0/.test(t) && !/data-state/.test(t);
    });
    expect(conCapa.length).toBeGreaterThan(10); // hay muchas: todas están bajo la regla
    for (const f of conCapa) expect(readFileSync(f, "utf8")).not.toMatch(/pointer-events-none[^"]*"\s*[^>]*role="dialog"/);
  });
});
