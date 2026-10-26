import { describe, expect, it, vi } from "vitest";
import type { ActorProto, ContextoProto, OperacionPedida, PlanPeticion, TipoCambioProto, VeredictoGobierno } from "../contrato";
import { contextoDelPaso, ejecutarConDependencias, tipoDePaso, type DependenciasEjecucion, type ResultadoPaso } from "../ejecutar";

const GRUPO: ContextoProto = { ruta: "/grupo/semilla", entidad: { tipo: "grupo", id: "semilla", nombre: "Semilla" }, gobernadaPor: { tipo: "grupo", id: "semilla", nombre: "Semilla" }, ambito: "grupo" };
const APLICAR: VeredictoGobierno = { decision: "aplicar", motivo: "ok", confirmar: false };

const hecho = (texto = "hecho"): ResultadoPaso => ({ estado: "hecho", texto });

/** Dependencias falsas: cada adaptador es un espía que devuelve «hecho» salvo que el test lo cambie. */
function deps(extra: Partial<DependenciasEjecucion> = {}): DependenciasEjecucion & { llamadas: string[] } {
  const llamadas: string[] = [];
  const paso = (nombre: string) => vi.fn(async () => { llamadas.push(nombre); return hecho(`${nombre} hecho`); });
  return {
    llamadas,
    decidir: vi.fn(() => APLICAR),
    actorPorDefecto: vi.fn(async (_c, origen) => ({ usuarioId: "u1", rol: "owner", esDueno: true, origen })),
    dictar: paso("dictar"), abrirEn: paso("abrirEn"), generarImagen: paso("generarImagen"), crearObjeto3d: paso("crearObjeto3d"),
    editarEntidad: paso("editarEntidad"), insertarEn: paso("insertarEn"), fondo: paso("fondo"), proponerMetagenesis: paso("proponerMetagenesis"),
    ...extra,
  };
}

const plan = (pasos: unknown[], extra: Partial<PlanPeticion> = {}): PlanPeticion => ({ resumen: "x", tipoCambio: "creacion", pasos: pasos as OperacionPedida[], fuera: [], motor: "reglas locales", ...extra });
const CUBO = { tipo: "crear-objeto-3d", descripcion: "cubo 3D", animado: true };
const FONDO = { tipo: "fondo", descripcion: "más cálido" };
const EDITAR = { tipo: "editar-entidad", objetivo: { tipo: "grupo", id: "semilla" }, cambio: "traduce la descripción", modo: "rama" };
const ejecutar = (p: PlanPeticion, d: DependenciasEjecucion, o: Partial<Parameters<typeof ejecutarConDependencias>[1]> = {}) => ejecutarConDependencias(p, { contexto: GRUPO, ...o }, d);

describe("ejecutar · camino feliz", () => {
  it("cada paso va a su adaptador, en orden, y todo se cuenta como hecho", async () => {
    const d = deps();
    const r = await ejecutar(plan([CUBO, FONDO, { tipo: "abrir-en", donde: "pizarra" }]), d);
    expect(d.llamadas).toEqual(["crearObjeto3d", "fondo", "abrirEn"]);
    expect(r.ok).toBe(true);
    expect(r.hechos).toEqual(["crearObjeto3d hecho", "fondo hecho", "abrirEn hecho"]);
    expect(r.pendientes).toEqual([]);
    expect(r.borradores).toEqual([]);
    expect(r.detalle?.map((x) => [x.paso, x.estado])).toEqual([[1, "hecho"], [2, "hecho"], [3, "hecho"]]);
    expect(r.motivo).toBeUndefined();
  });

  it("la ruta y la imagen de un paso llegan al detalle para los botones «Ver»", async () => {
    const d = deps({ generarImagen: vi.fn(async (): Promise<ResultadoPaso> => ({ estado: "hecho", texto: "Imagen lista", ruta: "/library", imagenUrl: "https://img.example/a.png" })) });
    const r = await ejecutar(plan([{ tipo: "generar-imagen", descripcion: "atardecer" }]), d);
    expect(r.detalle?.[0]).toMatchObject({ ruta: "/library", imagenUrl: "https://img.example/a.png" });
  });

  it("lo que un paso hecho no pudo hacer se suma a «pendientes» con su motivo", async () => {
    const d = deps({ crearObjeto3d: vi.fn(async (): Promise<ResultadoPaso> => ({ estado: "hecho", texto: "Objeto creado", pendiente: "La animación no está soportada por la escena." })) });
    const r = await ejecutar(plan([CUBO]), d);
    expect(r.ok).toBe(true);
    expect(r.hechos).toEqual(["Objeto creado"]);
    expect(r.pendientes).toEqual(["La animación no está soportada por la escena."]);
  });

  it("un paso «pendiente» (sin camino real) no es un éxito: ok=false y motivo honesto", async () => {
    const d = deps({ editarEntidad: vi.fn(async (): Promise<ResultadoPaso> => ({ estado: "pendiente", texto: "Editar publicaciones directamente no tiene camino aún." })) });
    const r = await ejecutar(plan([EDITAR], { tipoCambio: "contenido" }), d);
    expect(r.ok).toBe(false);
    expect(r.hechos).toEqual([]);
    expect(r.pendientes).toEqual(["Editar publicaciones directamente no tiene camino aún."]);
    expect(r.motivo).toMatch(/ningún paso tiene camino real/);
  });

  it("mezcla: lo hecho cuenta, lo pendiente se dice, ok=true", async () => {
    const d = deps({ fondo: vi.fn(async (): Promise<ResultadoPaso> => ({ estado: "pendiente", texto: "Fondo: sin camino." })) });
    const r = await ejecutar(plan([CUBO, FONDO]), d);
    expect(r.ok).toBe(true);
    expect(r.hechos).toEqual(["crearObjeto3d hecho"]);
    expect(r.pendientes).toEqual(["Fondo: sin camino."]);
  });
});

describe("ejecutar · el gobierno de la entidad manda", () => {
  it("«denegar»: no se llama al adaptador y se dice por qué", async () => {
    const d = deps({ decidir: vi.fn((): VeredictoGobierno => ({ decision: "denegar", motivo: "No eres miembro de este grupo.", confirmar: false })) });
    const r = await ejecutar(plan([CUBO]), d);
    expect(d.llamadas).toEqual([]);
    expect(r.ok).toBe(false);
    expect(r.hechos).toEqual([]);
    expect(r.pendientes[0]).toContain("No eres miembro de este grupo.");
    expect(r.detalle?.[0]).toMatchObject({ estado: "denegado", veredicto: "denegar" });
  });

  it.each(["proponer", "votar"] as const)("«%s»: NO se aplica y se devuelve el borrador de propuesta", async (decision) => {
    const propuesta = { titulo: "Cambiar el fondo", cuerpo: "…" } as never;
    const d = deps({ decidir: vi.fn((): VeredictoGobierno => ({ decision, motivo: "Los cambios de diseño se votan.", propuesta, confirmar: false })) });
    const r = await ejecutar(plan([FONDO]), d);
    expect(d.llamadas).toEqual([]);
    expect(r.ok).toBe(false);
    expect(r.hechos).toEqual([]);
    expect(r.borradores).toEqual([{ paso: 1, decision, motivo: "Los cambios de diseño se votan.", propuesta }]);
    expect(r.detalle?.[0]).toMatchObject({ estado: "propuesto", veredicto: decision });
    expect(r.motivo).toMatch(/propuesta o votación/);
  });

  it("el gobierno se consulta paso a paso: uno se aplica, otro se propone", async () => {
    const decidir = vi.fn((_c: ContextoProto, _a: ActorProto, tipo: TipoCambioProto): VeredictoGobierno =>
      tipo === "diseno" ? { decision: "votar", motivo: "El diseño se vota.", confirmar: false } : APLICAR);
    const d = deps({ decidir });
    const r = await ejecutar(plan([CUBO, FONDO]), d);
    expect(d.llamadas).toEqual(["crearObjeto3d"]);
    expect(decidir.mock.calls.map((c) => c[2])).toEqual(["creacion", "diseno"]);
    expect(r.ok).toBe(true);
    expect(r.borradores).toHaveLength(1);
    expect(r.borradores?.[0].paso).toBe(2);
  });

  it("abrir una vista y redactar un borrador de MetaGenesis no cambian la entidad: no pasan por el gobierno", async () => {
    const decidir = vi.fn(() => ({ decision: "denegar", motivo: "no", confirmar: false }) as VeredictoGobierno);
    const d = deps({ decidir });
    const r = await ejecutar(plan([{ tipo: "abrir-en", donde: "xr" }, { tipo: "proponer-metagenesis", que: "un conversor de PDF a EPUB" }]), d);
    expect(decidir).not.toHaveBeenCalled();
    expect(d.llamadas).toEqual(["abrirEn", "proponerMetagenesis"]);
    expect(r.ok).toBe(true);
  });

  it("un borrador de MetaGenesis que devuelve el adaptador llega en «borradores» y no se da por aplicado", async () => {
    const d = deps({ proponerMetagenesis: vi.fn(async (): Promise<ResultadoPaso> => ({ estado: "pendiente", texto: "Borrador listo; no se ha enviado.", borrador: { metagenesis: { id: "mg1", titulo: "Conversor", prompt: "haz un conversor" } } })) });
    const r = await ejecutar(plan([{ tipo: "proponer-metagenesis", que: "un conversor" }]), d);
    expect(r.borradores).toEqual([expect.objectContaining({ paso: 1, metagenesis: { id: "mg1", titulo: "Conversor", prompt: "haz un conversor" } })]);
    expect(r.detalle?.[0].estado).toBe("propuesto");
    expect(r.ok).toBe(false);
  });

  it("si el gobierno falla (lanza), se deniega: nunca se aplica «por si acaso»", async () => {
    const d = deps({ decidir: vi.fn(() => { throw new Error("boom"); }) });
    const r = await ejecutar(plan([CUBO]), d);
    expect(d.llamadas).toEqual([]);
    expect(r.detalle?.[0].estado).toBe("denegado");
    expect(r.pendientes[0]).toContain("No pude consultar las reglas");
  });

  it("una IA siempre necesita confirmación: con confirmado=false queda pendiente y no se aplica", async () => {
    const d = deps({ decidir: vi.fn(() => ({ decision: "aplicar", motivo: "ok", confirmar: true }) as VeredictoGobierno) });
    const sin = await ejecutar(plan([CUBO], { motor: "Gemma" }), d, { confirmado: false });
    expect(d.llamadas).toEqual([]);
    expect(sin.ok).toBe(false);
    expect(sin.detalle?.[0]).toMatchObject({ estado: "pendiente", veredicto: "aplicar" });
    const con = await ejecutar(plan([CUBO], { motor: "Gemma" }), d);
    expect(d.llamadas).toEqual(["crearObjeto3d"]);
    expect(con.ok).toBe(true);
  });

  it("el actor: reglas locales = humano; cualquier otro motor = ia; el de la ventana, si lo pasa, manda", async () => {
    const d = deps();
    await ejecutar(plan([CUBO], { motor: "reglas locales" }), d);
    await ejecutar(plan([CUBO], { motor: "Gemma local" }), d);
    expect(d.actorPorDefecto).toHaveBeenNthCalledWith(1, GRUPO, "humano");
    expect(d.actorPorDefecto).toHaveBeenNthCalledWith(2, GRUPO, "ia");
    const real: ActorProto = { usuarioId: "u9", rol: "member", origen: "humano" };
    await ejecutar(plan([CUBO]), d, { actor: real });
    expect(d.actorPorDefecto).toHaveBeenCalledTimes(2);
    expect((d.decidir as ReturnType<typeof vi.fn>).mock.calls[2][1]).toBe(real);
  });

  it("si no se puede deducir el actor, se sigue como anónimo (el gobierno decide)", async () => {
    const d = deps({ actorPorDefecto: vi.fn(async () => { throw new Error("sin sesión"); }) });
    await ejecutar(plan([CUBO]), d);
    expect((d.decidir as ReturnType<typeof vi.fn>).mock.calls[0][1]).toEqual({ usuarioId: null, origen: "humano" });
  });

  it("tipoDePaso y contextoDelPaso: cada operación se juzga con su tipo y la entidad que toca", () => {
    expect(tipoDePaso(CUBO as OperacionPedida, "contenido")).toBe("creacion");
    expect(tipoDePaso(FONDO as OperacionPedida, "contenido")).toBe("diseno");
    expect(tipoDePaso({ tipo: "dictar-molecula", orden: "x" }, "diseno")).toBe("contenido");
    expect(tipoDePaso(EDITAR as OperacionPedida, "creacion")).toBe("contenido");
    expect(tipoDePaso(EDITAR as OperacionPedida, "permisos")).toBe("permisos");
    expect(contextoDelPaso(EDITAR as OperacionPedida, GRUPO)).toBe(GRUPO);
    const otra = contextoDelPaso({ ...(EDITAR as object), objetivo: { tipo: "archivo", id: "f1" } } as OperacionPedida, { ...GRUPO, seleccion: { tipo: "archivo", id: "f1" } });
    expect(otra.entidad).toEqual({ tipo: "archivo", id: "f1" });
    expect(otra.seleccion).toBeUndefined();
    expect(otra.gobernadaPor).toEqual(GRUPO.gobernadaPor);
  });
});

describe("ejecutar · el plan se revalida antes de tocar nada", () => {
  it("un paso fuera del vocabulario o malicioso no se ejecuta, y el resto sigue", async () => {
    const d = deps();
    const r = await ejecutar(plan([
      { tipo: "ejecutar-codigo", cmd: "rm -rf /" },
      { tipo: "fondo", descripcion: "<script>alert(1)</script>" },
      { tipo: "editar-entidad", objetivo: { tipo: "grupo", id: "otro" }, cambio: "x", modo: "directo" },
      CUBO,
    ]), d);
    expect(d.llamadas).toEqual(["crearObjeto3d"]);
    expect(r.ok).toBe(true);
    expect(r.pendientes).toHaveLength(3);
    expect(r.pendientes[0]).toMatch(/Paso 1 no ejecutado.*vocabulario/);
    expect(r.detalle?.map((x) => x.estado)).toEqual(["denegado", "denegado", "denegado", "hecho"]);
  });

  it("el modo «directo» de un plan manipulado se conserva solo si la validación lo acepta (el modo no se sube)", async () => {
    const editar = vi.fn(async () => hecho("editado"));
    const d = deps({ editarEntidad: editar });
    await ejecutar(plan([{ ...EDITAR, modo: "directo" }], { tipoCambio: "contenido" }), d);
    expect(editar).toHaveBeenCalledTimes(1);
    expect((editar.mock.calls[0] as unknown[])[0]).toMatchObject({ modo: "directo" });
  });

  it("un plan vacío, sin pasos o corrupto no hace nada", async () => {
    const d = deps();
    for (const p of [plan([]), { ...plan([]), pasos: undefined as never }, undefined as never]) {
      const r = await ejecutar(p, d);
      expect(r.ok).toBe(false);
      expect(r.motivo).toMatch(/ningún paso/);
    }
    expect(d.llamadas).toEqual([]);
  });

  it("como mucho 6 pasos, aunque el plan traiga más", async () => {
    const d = deps();
    await ejecutar(plan(Array.from({ length: 10 }, () => CUBO)), d);
    expect(d.llamadas).toHaveLength(6);
  });
});

describe("ejecutar · cuando un adaptador falla", () => {
  it("una excepción es un «fallo» con mensaje corto; los demás pasos siguen y el resultado no es ok", async () => {
    const d = deps({ fondo: vi.fn(async () => { throw new Error("x".repeat(500)); }) });
    const r = await ejecutar(plan([FONDO, CUBO]), d);
    expect(d.llamadas).toEqual(["crearObjeto3d"]);
    expect(r.detalle?.map((x) => x.estado)).toEqual(["fallo", "hecho"]);
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/Algún paso falló/);
    expect(r.pendientes[0].length).toBeLessThan(300);
  });

  it("un adaptador que devuelve «fallo» también cuenta", async () => {
    const d = deps({ generarImagen: vi.fn(async (): Promise<ResultadoPaso> => ({ estado: "fallo", texto: "El servicio de imágenes no respondió." })) });
    const r = await ejecutar(plan([{ tipo: "generar-imagen", descripcion: "x" }]), d);
    expect(r.ok).toBe(false);
    expect(r.pendientes).toEqual(["El servicio de imágenes no respondió."]);
  });

  it("el adaptador de una entidad ajena recibe la entidad del paso, no la de la pantalla", async () => {
    const editar = vi.fn(async (_op: unknown, ctx: ContextoProto) => hecho(ctx.entidad?.id ?? "?"));
    const d = deps({ editarEntidad: editar as never });
    const ctx: ContextoProto = { ...GRUPO, seleccion: { tipo: "archivo", id: "f1" } };
    const r = await ejecutarConDependencias(plan([{ ...EDITAR, objetivo: { tipo: "archivo", id: "f1" } }], { tipoCambio: "contenido" }), { contexto: ctx }, d);
    expect(r.ok).toBe(true);
    expect((d.decidir as ReturnType<typeof vi.fn>).mock.calls[0][0].entidad).toEqual({ tipo: "archivo", id: "f1" });
  });
});
