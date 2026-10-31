import { describe, it, expect, beforeEach } from "vitest";
import {
  DURACIONES_STARSEED,
  CURVAS_STARSEED,
  type FotogramaStarseed,
} from "@/lib/design/movimiento-starseed";
import {
  DURACION_MAXIMA_MS,
  LICENCIA_FICHA,
  crearAdaptadorMovimiento,
  fichaBase,
  recetaDeFicha,
  registrarAdaptadoresMovimiento,
  validarFicha,
  type DepsMovimiento,
  type FichaMovimiento,
} from "../movimiento";
import { __resetRegistros, adaptadorDe } from "../../familias";

/** Devuelve una copia de la ficha con campos sueltos, aunque el tipo los prohíba. */
function conCambios(ficha: FichaMovimiento, cambios: Record<string, unknown>): FichaMovimiento {
  return { ...ficha, ...cambios } as FichaMovimiento;
}

/** Estado simulado por familia en memoria: sin DOM ni disco. */
function depsFalsas(): DepsMovimiento & { guardadas: FichaMovimiento[] } {
  const guardadas: FichaMovimiento[] = [];
  const actual = new Map<string, FichaMovimiento | null>();
  return {
    guardadas,
    leer: (familia) => actual.get(familia) ?? null,
    escribir: (familia, ficha) => {
      guardadas.push(ficha as FichaMovimiento);
      actual.set(familia, ficha);
    },
  };
}

const fichaRespiracion = (): FichaMovimiento =>
  fichaBase("animacion", "respiracion") as FichaMovimiento;

describe("movimiento · adaptadores de animacion, transicion y elemento-3d", () => {
  beforeEach(() => {
    __resetRegistros();
  });

  it("fichaBase no saca fichas de tipos que no le tocan a la familia", () => {
    expect(fichaBase("animacion", "barrido-horizonte")).toBeNull(); // el barrido es de transición
    expect(fichaBase("elemento-3d", "alquimia")).toBeNull(); // el 3D solo respira y cristaliza
    expect(fichaBase("transicion", "siembra")).toBeNull();
    expect(fichaBase("animacion", "cristalizacion")).not.toBeNull();
  });

  it("fichaBase lleva parámetros vigentes del ADN, movimiento reducido y licencia", () => {
    const ficha = fichaRespiracion();
    expect(ficha.clave).toBe("animacion:respiracion");
    expect(ficha.parametros).toEqual({
      duracionMs: DURACIONES_STARSEED.respiracion,
      curva: CURVAS_STARSEED.organica,
    });
    expect(ficha.movimientoReducido).toEqual({ duracionMs: 1, recorridoPx: 0 });
    expect(ficha.referencias.length).toBeGreaterThan(0);
    expect(ficha.licencia).toBe(LICENCIA_FICHA);
  });

  it("validarFicha acepta la ficha del vocabulario y una ficha con keyframes propios", () => {
    expect(validarFicha(fichaRespiracion())).toEqual([]);
    const propios: FotogramaStarseed[] = [
      { transform: "scale(0.9)", opacity: 0 },
      { transform: "scale(1)", opacity: 1, offset: 1 },
    ];
    expect(validarFicha(conCambios(fichaRespiracion(), { keyframes: propios }))).toEqual([]);
  });

  it("validarFicha solo permite duraciones enteras de 0 a 10000 ms", () => {
    for (const duracionMs of [-1, DURACION_MAXIMA_MS + 1, 220.5, "220" as unknown as number]) {
      const ficha = {
        ...fichaRespiracion(),
        parametros: { ...fichaRespiracion().parametros, duracionMs },
      };
      expect(validarFicha(ficha).join(" "), String(duracionMs)).toContain("duracionMs");
    }
  });

  it("validarFicha solo permite curvas cubic-bezier válidas", () => {
    for (const curva of ["linear", "cubic-bezier(1.5, 0, 0.3, 1)", "cubic-bezier(0.16, 1, abc, 1)"]) {
      const ficha = {
        ...fichaRespiracion(),
        parametros: { duracionMs: 240, curva },
      };
      expect(validarFicha(ficha).join(" "), curva).toContain("cubic-bezier");
    }
  });

  it("validarFicha rechaza propiedades que la marca no anima: solo transform, opacity, filter y clipPath", () => {
    const invalido = [{ color: "#ff0000" } as unknown as FotogramaStarseed];
    const motivos = validarFicha(conCambios(fichaRespiracion(), { keyframes: invalido }));
    expect(motivos.join(" ")).toContain("no se anima");
    const conColorDeFondo = [{ backgroundColor: "red" } as unknown as FotogramaStarseed];
    expect(validarFicha(conCambios(fichaRespiracion(), { keyframes: conColorDeFondo })).join(" ")).toContain("no se anima");
  });

  it("validarFicha pide offsets de 0 a 1 y movimiento reducido sin desplazamiento", () => {
    const conOffset = [{ opacity: 1, offset: 1.4 } as unknown as FotogramaStarseed];
    expect(validarFicha(conCambios(fichaRespiracion(), { keyframes: conOffset })).join(" ")).toContain("offset");
    const desplazado = { ...fichaRespiracion().movimientoReducido, recorridoPx: 24 };
    expect(validarFicha(conCambios(fichaRespiracion(), { movimientoReducido: desplazado })).join(" ")).toContain("recorridoPx");
  });

  it("validarFicha rechaza tipos de otra familia, claves raras y fichas sin referencias", () => {
    const ajena = fichaBase("animacion", "respiracion") as FichaMovimiento;
    expect(validarFicha({ ...ajena, familia: "transicion" }).join(" ")).toContain("no pertenece");
    expect(validarFicha(conCambios(ajena, { clave: "tema:synthwave" })).join(" ")).toContain("Clave");
    const sinReferencias = conCambios(ajena, { referencias: [] });
    expect(validarFicha(sinReferencias).join(" ")).toContain("Referencias");
    expect(validarFicha(null as unknown as FichaMovimiento).length).toBeGreaterThan(0);
  });

  it("recetaDeFicha respeta keyframes propios y parámetros vigentes", () => {
    const ficha = fichaBase("transicion", "entrada-cardinal") as FichaMovimiento;
    const receta = recetaDeFicha({ ...ficha, parametros: { duracionMs: 500, curva: CURVAS_STARSEED.genesis } });
    expect(receta.opciones).toEqual({ duration: 500, easing: CURVAS_STARSEED.genesis, fill: "both" });
    expect(receta.keyframes[0]).toEqual({ transform: "translateY(24px) scale(0.98)", opacity: 0 });
  });

  it("recetaDeFicha sin keyframes recurre al vocabulario del tipo", () => {
    const ficha = fichaBase("animacion", "siembra") as FichaMovimiento;
    const receta = recetaDeFicha(ficha);
    expect(receta.opciones.duration).toBe(DURACIONES_STARSEED.siembra);
    expect(receta.keyframes[0].clipPath).toContain("circle(0%");
  });

  it("recetaDeFicha con reducido devuelve un fundido simple de 1 ms sin desplazamiento", () => {
    const ficha = fichaBase("transicion", "entrada-cardinal") as FichaMovimiento;
    const receta = recetaDeFicha(ficha, true);
    expect(receta.opciones).toEqual({ duration: 1, delay: 0, iterations: 1, direction: "normal", fill: "both", easing: ficha.parametros.curva });
    expect(receta.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
  });

  it("capturar devuelve el propio estado de la familia, o su ficha base si aún no hay", () => {
    const deps = depsFalsas();
    const ficha = fichaBase("transicion", "barrido-horizonte") as FichaMovimiento;
    deps.escribir("transicion", ficha);
    const adaptador = crearAdaptadorMovimiento("transicion", deps);
    expect(adaptador.familia).toBe("transicion");
    expect(adaptador.capturar("transicion:barrido-horizonte")).toEqual(ficha);
    // aplicado a una familia ajena al adaptador: nada que capturar
    const observador = crearAdaptadorMovimiento("animacion", deps);
    expect(observador.capturar("transicion:barrido-horizonte")).toBeNull();
    expect(observador.capturar("animacion:respiracion")).toEqual(fichaBase("animacion", "siembra")); // cae a la ficha base del primer tipo
  });

  it("validar acepta el objeto y su JSON, y rechaza lo demás", () => {
    const ficha = fichaRespiracion();
    const adaptador = crearAdaptadorMovimiento("animacion", depsFalsas());
    expect(adaptador.validar(ficha)).toEqual({ ok: true, payload: ficha });
    expect(adaptador.validar(JSON.stringify(ficha)).ok).toBe(true);
    expect(adaptador.validar("{ json roto").ok).toBe(false);
    expect(adaptador.validar(42).ok).toBe(false);
  });

  it("aplicar escribe la ficha validada en la familia y deshacer restaura la anterior", () => {
    const deps = depsFalsas();
    const adaptador = crearAdaptadorMovimiento("elemento-3d", deps);
    const vieja = fichaBase("elemento-3d", "respiracion") as FichaMovimiento;
    deps.escribir("elemento-3d", vieja);
    const nueva = fichaBase("elemento-3d", "cristalizacion") as FichaMovimiento;
    const aplicado = adaptador.aplicar("elemento-3d:cristalizacion", nueva);
    expect(deps.leer("elemento-3d")).toEqual(nueva);
    aplicado.deshacer();
    expect(deps.leer("elemento-3d")).toEqual(vieja); // deshacer restaura lo que había antes
  });

  it("aplicar no toca nada con clave de otra familia o ficha inválida; su deshacer no rompe", () => {
    const deps = depsFalsas();
    const adaptador = crearAdaptadorMovimiento("animacion", deps);
    const ficha = fichaRespiracion();
    adaptador.aplicar("tema:synthwave", ficha).deshacer(); // clave ajena: seguir vacía
    expect(deps.guardadas).toEqual([]);
    const sinCurva = conCambios(ficha, { curva: "bounce" });
    adaptador.aplicar("animacion:respiracion", { ...sinCurva, parametros: { duracionMs: 240, curva: "bounce" } }).deshacer();
    expect(deps.guardadas).toEqual([]); // sin validar no se ejecuta nada
  });

  it("registrarAdaptadoresMovimiento deja las tres familias en el registro compartido", () => {
    __resetRegistros();
    registrarAdaptadoresMovimiento(depsFalsas());
    for (const familia of ["animacion", "transicion", "elemento-3d"]) {
      expect(adaptadorDe(`${familia}:prueba`), familia).not.toBeNull();
    }
    expect(adaptadorDe("tema:synthwave")).toBeNull();
  });
});
