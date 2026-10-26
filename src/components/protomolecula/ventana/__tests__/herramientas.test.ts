import { describe, expect, it } from "vitest";
import type { ContextoProto, EntidadProto, TipoEntidadProto } from "@/lib/protomolecula/peticion/contrato";
import { MAX_HERRAMIENTAS, MIN_HERRAMIENTAS, esPlanSoloDeApertura, herramientasPara, sugerenciaPara } from "../herramientas";
import { entidadGobernante } from "../contexto";

const ent = (tipo: TipoEntidadProto, nombre = "Semilla"): EntidadProto => ({ tipo, id: `${tipo}-1`, nombre });
const ctx = (entidad?: EntidadProto, extra: Partial<ContextoProto> = {}): ContextoProto => ({ ruta: "/x", ambito: "personal", ...(entidad ? { entidad } : {}), ...extra });
const ids = (c: ContextoProto) => herramientasPara(c).map((h) => h.id);

const TODOS: TipoEntidadProto[] = ["perfil", "grupo", "comunidad", "pagina", "publicacion", "mensaje", "archivo", "pizarra", "escritorio", "widget", "molecula"];

describe("herramientas adaptativas", () => {
  it("siempre hay entre 6 y 9, sin repetir, con o sin entidad y con o sin selección", () => {
    const contextos: ContextoProto[] = [
      ctx(),
      ...TODOS.map((t) => ctx(ent(t))),
      ...TODOS.map((t) => ctx(ent(t), { seleccion: { tipo: "bloque", id: "b1", resumen: "Titular" } })),
    ];
    for (const c of contextos) {
      const lista = herramientasPara(c);
      expect(lista.length).toBeGreaterThanOrEqual(MIN_HERRAMIENTAS);
      expect(lista.length).toBeLessThanOrEqual(MAX_HERRAMIENTAS);
      expect(new Set(lista.map((h) => h.id)).size).toBe(lista.length);
    }
  });

  it("siempre ofrece objeto 3D animado, fondo, abrir en pizarra o XR", () => {
    for (const c of [ctx(), ctx(ent("publicacion")), ctx(ent("grupo")), ctx(ent("archivo"))]) {
      const i = ids(c);
      for (const id of ["objeto3d", "fondo", "pizarra", "xr"]) expect(i).toContain(id);
    }
  });

  it("en una publicación: editar en rama, añadir imagen o objeto 3D e insertar molécula", () => {
    const lista = herramientasPara(ctx(ent("publicacion", "Mi post")));
    const por = Object.fromEntries(lista.map((h) => [h.id, h]));
    expect(por.rama.accion).toMatchObject({ tipo: "rellenar", modo: "rama" });
    expect(por.imagen.nombre).toBe("Añadir imagen");
    expect(por.objeto3d.nombre).toBe("Añadir objeto 3D");
    expect(por.molecula.accion.tipo).toBe("plan");
    if (por.molecula.accion.tipo === "plan") {
      expect(por.molecula.accion.plan.pasos[0]).toMatchObject({ tipo: "insertar-en", destino: { tipo: "publicacion", id: "publicacion-1" } });
    }
  });

  it("en un grupo: proponer cambio de diseño, pizarra del grupo y las reglas (pestaña Gobierno)", () => {
    const lista = herramientasPara(ctx(ent("grupo", "Semilla"), { ambito: "grupo" }));
    const por = Object.fromEntries(lista.map((h) => [h.id, h]));
    expect(por.propuesta.accion).toMatchObject({ tipo: "rellenar" });
    expect(por.pizarra.nombre).toBe("Pizarra del grupo");
    expect(por.pizarra.accion).toMatchObject({ tipo: "plan", plan: { pasos: [{ tipo: "abrir-en", donde: "pizarra", que: "Semilla" }] } });
    expect(por.gobierno.accion).toEqual({ tipo: "pestana", destino: "gobierno" });
  });

  it("en un archivo: convertir y editar en una rama", () => {
    const i = ids(ctx(ent("archivo")));
    expect(i).toContain("convertir");
    expect(i).toContain("rama");
  });

  it("cambian con el contexto", () => {
    expect(ids(ctx(ent("publicacion")))).not.toEqual(ids(ctx(ent("grupo"))));
    expect(ids(ctx(ent("archivo")))).not.toEqual(ids(ctx(ent("mensaje"))));
    expect(ids(ctx())).toContain("diseno");
  });

  it("lo seleccionado añade «Retocar la selección» al principio", () => {
    const lista = herramientasPara(ctx(ent("publicacion"), { seleccion: { tipo: "imagen", id: "i1", resumen: "Portada" } }));
    expect(lista[0].id).toBe("seleccion");
    expect(lista[0].accion).toMatchObject({ tipo: "rellenar" });
    if (lista[0].accion.tipo === "rellenar") expect(lista[0].accion.texto).toContain("Imagen: Portada");
  });

  it("ninguna herramienta sin destino real: texto, plan con pasos, lienzo o una pestaña que existe para ese contexto", () => {
    for (const c of [ctx(), ...TODOS.map((t) => ctx(ent(t)))]) {
      for (const h of herramientasPara(c)) {
        const a = h.accion;
        if (a.tipo === "rellenar") expect(a.texto.trim().length).toBeGreaterThan(3);
        if (a.tipo === "plan") {
          expect(a.plan.pasos.length).toBeGreaterThan(0);
          expect(a.plan.fuera).toEqual([]);
          expect(a.plan.motor).toContain("sin IA");
        }
        // «Gobierno» solo se ofrece donde la pestaña Gobierno existe.
        if (a.tipo === "pestana" && a.destino === "gobierno") expect(entidadGobernante(c)).toBeDefined();
      }
    }
  });

  it("abrir algo es un plan que no cambia nada de nadie; insertar sí", () => {
    const por = Object.fromEntries(herramientasPara(ctx(ent("pizarra"))).map((h) => [h.id, h]));
    expect(por.xr.accion.tipo === "plan" && esPlanSoloDeApertura(por.xr.accion.plan)).toBe(true);
    expect(por.molecula.accion.tipo === "plan" && esPlanSoloDeApertura(por.molecula.accion.plan)).toBe(false);
  });

  it("la sugerencia de la barra habla del contexto", () => {
    expect(sugerenciaPara(ctx(ent("grupo", "Semilla")))).toContain("Semilla");
    expect(sugerenciaPara(ctx(ent("publicacion")))).toMatch(/publicaci/);
    expect(sugerenciaPara(ctx())).toMatch(/Astraura/);
  });
});
