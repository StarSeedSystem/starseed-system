import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, test, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { TarjetaNodo } from "../metagenesis-autonoma";
import type { NodoVista, AccionOrden } from "@/lib/metagenesis/remoto-nodos";
import type { NeuronaColmena, SO } from "@/lib/metagenesis/colmena";
import { botonesNeurona } from "@/lib/metagenesis/colmena";

vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({
        config: {
            themeStore: {
                activeMode: 'primary',
            },
        },
    }),
}));

// Mock data for NodoVista
const baseNodo: NodoVista = {
  nodo: "test-nodo",
  medio: "mac",
  etiqueta: "Test Node",
  modo: "real",
  vivo: true,
  lider: false,
  hace_ms: 10000,
  puntos: 100,
  orquestadores: ["orq1"],
  caidos: [],
  disco_gb: 50,
  ram_libre_mb: 4096,
  trabajo: {},
  enCurso: null,
  contenedor: null,
};

describe("TarjetaNodo buttons", () => {
     test("renders desconectar button when appropriate", () => {
       const mandar = vi.fn().mockResolvedValue({ ok: true });
      const nodo: NodoVista = {
        ...baseNodo,
        contenedor: { activo: true, agentes: 2, apto: true, motivo: "Suficiente RAM" },
        enCurso: [{ id: "1", fase: "fase", punto: { rama: "main", sha: "abc", t: Date.now() - 5000 } }],
      };

      render(<TarjetaNodo n={nodo} ahora={Date.now()} mandar={mandar} />);

      // Should see the desconectar button
      const desconectarBtns = screen.getAllByRole("button", { name: "Desconectar" });
      expect(desconectarBtns.length).toBeGreaterThan(0);
      const desconectarBtn = desconectarBtns[0];
      expect(desconectarBtn).not.toBeNull();
      // Should be enabled because there is work in course
      expect(desconectarBtn.hasAttribute('disabled')).toBe(false);
      // Should have explain text below? We'll check that the title contains the explica
      expect(desconectarBtn.getAttribute('title')).toBe("Guarda el trabajo a medias de sus 1 agente(s) y lo pasa a otro contenedor antes de que este aparato se quede sin internet.");
    });

     test("renders contenedor button when appropriate", () => {
       const mandar = vi.fn().mockResolvedValue({ ok: true });
      const nodo: NodoVista = {
        ...baseNodo,
        contenedor: { activo: false, agentes: 2, apto: true, motivo: "" },
      };

      render(<TarjetaNodo n={nodo} ahora={Date.now()} mandar={mandar} />);

      const contenedorBtns = screen.getAllByRole("button", { name: "Usar como contenedor (2 agentes)" });
      expect(contenedorBtns.length).toBeGreaterThan(0);
      const contenedorBtn = contenedorBtns[0];
      expect(contenedorBtn).not.toBeNull();
      expect(contenedorBtn.hasAttribute('disabled')).toBe(false);
      // Check title for explica
      expect(contenedorBtn.getAttribute('title')).toBe("Este aparato coge tareas de la cola como la Mac.");
    });

     test("calls mandar with correct args on desconectar click", async () => {
       const mandar = vi.fn().mockResolvedValue({ ok: true });
      const nodo: NodoVista = {
        ...baseNodo,
        contenedor: { activo: true, agentes: 2, apto: true, motivo: "Suficiente RAM" },
      };

      render(<TarjetaNodo n={nodo} ahora={Date.now()} mandar={mandar} />);

      const desconectarBtns = screen.getAllByRole("button", { name: "Desconectar" });
      expect(desconectarBtns.length).toBeGreaterThan(0);
      const desconectarBtn = desconectarBtns[0];
      await userEvent.click(desconectarBtn);
      expect(mandar).toHaveBeenCalledWith("desconectar", undefined);
    });

     test("calls mandar with correct args on contenedor click (activating)", async () => {
       const mandar = vi.fn().mockResolvedValue({ ok: true });
      const nodo: NodoVista = {
        ...baseNodo,
        contenedor: { activo: false, agentes: 2, apto: true, motivo: "" },
      };

      render(<TarjetaNodo n={nodo} ahora={Date.now()} mandar={mandar} />);

      const contenedorBtns = screen.getAllByRole("button", { name: "Usar como contenedor (2 agentes)" });
      expect(contenedorBtns.length).toBeGreaterThan(0);
      const contenedorBtn = contenedorBtns[0];
      await userEvent.click(contenedorBtn);
      expect(mandar).toHaveBeenCalledWith("contenedor", {
        activo: true,
        trabajadores: 2,
      });
    });

     test("calls mandar with correct args on contenedor click (deactivating)", async () => {
       const mandar = vi.fn().mockResolvedValue({ ok: true });
      const nodo: NodoVista = {
        ...baseNodo,
        contenedor: { activo: true, agentes: 2, apto: true, motivo: "" },
      };

      render(<TarjetaNodo n={nodo} ahora={Date.now()} mandar={mandar} />);

      const contenedorBtns = screen.getAllByRole("button", { name: "Dejar de usar como contenedor" });
      expect(contenedorBtns.length).toBeGreaterThan(0);
      const contenedorBtn = contenedorBtns[0];
      await userEvent.click(contenedorBtn);
      expect(mandar).toHaveBeenCalledWith("contenedor", {
        activo: false,
      });
    });

     test("shows disabled button when not apto", () => {
       const mandar = vi.fn().mockResolvedValue({ ok: true });
      const nodo: NodoVista = {
        ...baseNodo,
        contenedor: { activo: false, agentes: 0, apto: false, motivo: "Insuficiente RAM" },
      };

      render(<TarjetaNodo n={nodo} ahora={Date.now()} mandar={mandar} />);

       // Find the button with the title "Insuficiente RAM" among buttons containing "Usar como contenedor" in their name
       const allContenedorBtns = screen.getAllByRole("button", { name: /Usar como contenedor/ });
       const contenedorBtn = allContenedorBtns.find(btn => btn.getAttribute('title') === "Insuficiente RAM");
       expect(contenedorBtn).not.toBeNull();
       expect(contenedorBtn.hasAttribute('disabled')).toBe(true);
       expect(contenedorBtn.getAttribute('title')).toBe("Insuficiente RAM");
    });

   test("shows latest punto hace X min when enCurso present", () => {
     const mandar = vi.fn().mockResolvedValue({ ok: true });
     const ahora = 1000000;
     const nodo: NodoVista = {
       nodo: "test-nodo",
       medio: "mac",
       etiqueta: "Test Node",
       modo: "real",
       vivo: true,
       lider: false,
       hace_ms: 10000,
       puntos: 100,
       orquestadores: ["orq1"],
       caidos: [],
       disco_gb: 50,
       ram_libre_mb: 4096,
       trabajo: {},
       enCurso: [
         { id: "1", fase: "fase", punto: { rama: "main", sha: "abc", t: 700000 } },
         { id: "2", fase: "fase", punto: { rama: "dev", sha: "def", t: 880000 } },
       ],
       contenedor: null,
     };

     render(<TarjetaNodo n={nodo} ahora={ahora} mandar={mandar} />);

     // Should show the text with the latest punto (which is 2 minutes ago)
     const latestPuntoTexts = screen.getAllByText(/Último punto hace/i);
     expect(latestPuntoTexts.length).toBeGreaterThan(0);
     const latestPuntoText = latestPuntoTexts[0];
     // The text should be "Último punto hace 2 min" (approximately)
     expect(latestPuntoText.textContent).toMatch(/Último punto hace.*2 min/i);
   });
});