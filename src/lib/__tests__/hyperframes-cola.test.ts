import { describe, it, expect } from "vitest";
import { crearCola, ESTADOS } from "../hyperframes-cola";
import type { Trabajo, Opciones } from "../tipos";

function relojFalso(): { avanzar: (ms: number) => void } {
  const estado: { avanzado: number } = { avanzado: 0 };
  return {
    avanzar: (ms: number) => {
      estado.avanzado += ms;
    },
    obtener: () => estado.avanzado,
  };
}

function diferido<T>(): { promesa: Promise<T>; resolver: (valor: T) => void } {
  let resolver: (valor: T) => void;
  const promesa = new Promise<T>((resolve) => {
    resolver = resolve;
  });
  return { promesa, resolver: resolver! };
}

function espera(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function validarArgs(arg: string | string[]): string | null {
  if (typeof arg === "string") {
    return "argumento sin bandera";
  }
  const blancos = ["-o", "--format", "--rm"];
  const sinBandera = arg.find((a, i) => !blancos.includes(a) && i === 0);
  if (sinBandera) return "argumento sin bandera";
  const banderaIlegal = arg.find((a) => !blancos.includes(a));
  if (banderaIlegal) return "bandera no permitida";
  if (arg.some((a, i) => a === "-o" && (i + 1 >= arg.length || arg[i + 1].includes("/")))) {
    return "fuera del proyecto";
  }
  if (arg.some((a, i) => a === "-o" && arg[i + 1].includes("\n"))) {
    return "con control";
  }
  return null;
}

function progresoDeLinea(linea: string): { frame: number; total: number } | null {
  const coincidencia = linea.match(/@[\w]+\s*\{"frame":(\d+),"total":(\d+)\}/);
  if (!coincidencia) return null;
  return { frame: parseInt(coincidencia[1]), total: parseInt(coincidencia[2]) };
}

function relojFalsoConEstado(): {
  avanzar: (ms: number) => void;
  obtener: () => number;
} {
  let avanzado = 0;
  return {
    avanzar: (ms: number) => {
      avanzado += ms;
    },
    obtener: () => avanzado,
  };
}

describe("hyperframes-cola", () => {
  describe("validarArgs", () => {
    it("solo acepta listas con banderas de la lista blanca y valores dentro del proyecto", () => {
      expect(validarArgs(["-o", "salida.mp4"])).toMatch(/argumento sin bandera/);
      expect(validarArgs(["-o", "salida.mp4", "--format=mp4"])).toBeNull();
      expect(validarArgs(["salida.mp4"])).toBe("argumento sin bandera");
      expect(validarArgs(["--rm", "x"])).toMatch(/no permitida/);
      expect(validarArgs(["-o", "/etc/passwd"])).toMatch(/fuera/);
      expect(validarArgs(["-o", "../x"])).toMatch(/fuera/);
      expect(validarArgs(["-o", "a\nb"])).toMatch(/control/);
    });

    it("lee las líneas @[clave] y descarta el ruido", () => {
      expect(progresoDeLinea('render @[clave] {"frame":12,"total":72}')).toEqual({ frame: 12, total: 72 });
      expect(progresoDeLinea("otra línea")).toBeNull();
      expect(progresoDeLinea("@[clave] {roto")).toBeNull();
      expect(progresoDeLinea("@[clave] [1]")).toBeNull();
    });
  });

  describe("crearCola", () => {
    it("renderiza en orden, copia args y apaga la telemetría", async () => {
      const d = diferido();
      const llamadas: { trabajo: Trabajo; opciones: Opciones }[] = [];
      const ejecutar = (trabajo: Trabajo, opciones: Opciones) => {
        llamadas.push({ trabajo, opciones });
        return d.promesa;
      };
      const cola = crearCola({ ejecutar, reloj: relojFalsoConEstado() });
      const id = cola.encolar({ id: "a", proyecto: "comp", args: ["--format", "mp4", "-o", "a.mp4"] });
      await espera();
      expect(cola.estado(id).estado).toBe(ESTADOS.RENDERIZANDO);
      expect(llamadas[0].trabajo).toEqual({
        id: "a", proyecto: "comp", args: ["--format", "mp4", "-o", "a.mp4"], env: { ...process.env },
      });
      expect(llamadas[0].opciones.senal).toBeInstanceOf(AbortSignal);
      llamadas[0].opciones.alProgreso('@[clave] {"frame":5,"total":10}');
      expect(cola.estado(id).progreso).toEqual({ frame: 5, total: 10 });
      d.resolver({ codigo: 0, salida: "a.mp4" });
      await espera();
      expect(cola.estado(id)).toMatchObject({ estado: ESTADOS.HECHO, resultado: { codigo: 0, salida: "a.mp4" } });
    });

    it("respeta el tope: el segundo espera en cola hasta que termina el primero", async () => {
      const a = diferido(), b = diferido();
      const lanzados: string[] = [];
      const ejecutar = (t: Trabajo, o: Opciones) => {
        lanzados.push(t.id);
        return t.id === "a" ? a.promesa : b.promesa;
      };
      const cola = crearCola({ ejecutar, reloj: relojFalsoConEstado() });
      cola.encolar({ id: "a", proyecto: "p", args: [] });
      cola.encolar({ id: "b", proyecto: "p", args: [] });
      await espera();
      expect(lanzados).toEqual(["a"]);
      expect(cola.estado("b").estado).toBe(ESTADOS.EN_COLA);
      a.resolver({ codigo: 0 });
      await espera();
      expect(lanzados).toEqual(["a", "b"]);
      expect(cola.estado("a").estado).toBe(ESTADOS.HECHO);
    });

    it("un código distinto de cero es fallo y no filtra rutas absolutas", async () => {
      const cola = crearCola({ ejecutar: async () => ({ codigo: 2, error: "no pudo /home/a/x.mp4" }), reloj: relojFalsoConEstado() });
      cola.encolar({ id: "x", proyecto: "p", args: [] });
      await espera();
      expect(cola.estado("x")).toMatchObject({ estado: ESTADOS.FALLO, resultado: { codigo: 2 } });
      expect(cola.estado("x").error).toContain("<ruta>"); expect(cola.estado("x").error).not.toContain("/home/");
    });

    it("cancela lo que espera sin lanzarlo y aborta lo que ya renderiza", async () => {
      const d = diferido();
      let senal: AbortSignal | undefined;
      const ejecutar = (_t: Trabajo, o: Opciones) => { senal = o.senal; return d.promesa; };
      const cola = crearCola({ ejecutar, reloj: relojFalsoConEstado() });
      cola.encolar({ id: "a", proyecto: "p", args: [] });
      cola.encolar({ id: "b", proyecto: "p", args: [] });
      await espera();
      expect(cola.cancelar("b")).toBe(true); expect(cola.estado("b").estado).toBe(ESTADOS.CANCELADO);
      expect(cola.cancelar("a")).toBe(true);
      expect(senal?.aborted).toBe(true);
      expect(cola.estado("a").estado).toBe(ESTADOS.CANCELADO);
      expect(cola.cancelar("a")).toBe(false);
      d.resolver({ codigo: 0 });
      await espera();
      expect(cola.estado("a").estado).toBe(ESTADOS.CANCELADO);
    });

    it("el tiempo máximo cancela el render en curso", async () => {
      const reloj = relojFalsoConEstado();
      const cola = crearCola({ ejecutar: () => diferido().promesa, reloj, maxSegundos: 2 });
      cola.encolar({ id: "a", proyecto: "p", args: [] });
      await espera();
      reloj.avanzar(1999);
      expect(cola.estado("a").estado).toBe(ESTADOS.RENDERIZANDO);
      reloj.avanzar(1);
      expect(cola.estado("a")).toMatchObject({ estado: ESTADOS.CANCELADO, motivo: "tiempo máximo" });
    });

    it("rechaza id repetido, proyecto fuera y args inseguros; lista en orden", async () => {
      const cola = crearCola({ ejecutar: async () => 0, reloj: relojFalsoConEstado() });
      cola.encolar({ id: "a", proyecto: "p", args: [] });
      expect(() => cola.encolar({ id: "a", proyecto: "p", args: [] })).toThrow(/id/);
      expect(() => cola.encolar({ id: "b", proyecto: "/etc", args: [] })).toThrow(/proyecto/);
      expect(() => cola.encolar({ id: "c", proyecto: "p", args: ["--rm"] })).toThrow(/bandera/);
      expect(cola.listar().map((t: { id: string }) => t.id)).toEqual(["a"]);
      await espera();
      expect(cola.estado("a").estado).toBe(ESTADOS.HECHO);
    });
  });
});