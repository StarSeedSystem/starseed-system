/**
 * Tests de `herramientas-logic.ts` — toda lógica pura, sin red ni React.
 */
import { describe, expect, it } from "vitest";
import type { BotPredeterminado, CapacidadInternet, CerebroSer, HerramientaDisponible, ResultadoSincronizacion, ViaSincronizacion } from "@/lib/astraura/genesis-types";
import {
  CAPACIDAD_INTERNET_VACIA,
  FUENTES_INTERNET,
  agruparHerramientasPorFuente,
  capacidadInternetEfectiva,
  cerebrosPropiosSeguros,
  conCerebroActualizado,
  describirCapacidadInternet,
  describirDeposito,
  describirDominios,
  estadoSyncEfectivo,
  estadoSyncTono,
  etiquetaFuenteHerramienta,
  huellaPaquetes,
  idsPendientesDeInstalar,
  motivoNoDisponible,
  paquetesDeLibreria,
  resumenSyncCerebro,
  resumirBots,
  resumirCerebros,
  resumirHerramientas,
  resumirResultadoGlobal,
  resumirVias,
  riesgoTono,
  sinCerebro,
  viasSeguras,
} from "../herramientas-logic";

/* ─────────────────────────── Internet: catálogo de fuentes ─────────────────────────── */

describe("FUENTES_INTERNET", () => {
  it("son exactamente las 4 fuentes que Alex pidió, cada una con su explicación y su nivel de riesgo", () => {
    expect(FUENTES_INTERNET).toHaveLength(4);
    const ids = FUENTES_INTERNET.map((f) => f.id);
    expect(ids).toEqual(["bibliotecaOS", "bibliotecaUsuario", "dispositivo", "web"]);
    for (const f of FUENTES_INTERNET) {
      expect(f.explicacion.length).toBeGreaterThan(20); // una frase de verdad, no una etiqueta
      expect(["bajo", "medio", "alto"]).toContain(f.riesgo);
    }
  });

  it("biblioteca del OS y carpetas del dispositivo son permisos explícitamente distintos, con distinto riesgo", () => {
    const os = FUENTES_INTERNET.find((f) => f.id === "bibliotecaOS")!;
    const dispositivo = FUENTES_INTERNET.find((f) => f.id === "dispositivo")!;
    expect(os.riesgo).not.toBe(dispositivo.riesgo);
    expect(os.explicacion).not.toBe(dispositivo.explicacion);
  });

  it("riesgoTono da tres looks distintos entre sí (nunca dos niveles con el mismo tono)", () => {
    const tonos = new Set((["bajo", "medio", "alto"] as const).map(riesgoTono));
    expect(tonos.size).toBe(3);
  });
});

/* ─────────────────────────── capacidadInternetEfectiva ─────────────────────────── */

describe("capacidadInternetEfectiva", () => {
  it("sin capacidad (ausente = nunca se le concedió) ⇒ la forma vacía, nunca un hueco", () => {
    expect(capacidadInternetEfectiva(null)).toEqual(CAPACIDAD_INTERNET_VACIA);
    expect(capacidadInternetEfectiva(undefined)).toEqual(CAPACIDAD_INTERNET_VACIA);
  });

  it("sanea un objeto a medias (backend viejo): campos no-booleanos y listas ausentes no revientan, se normalizan", () => {
    const sucio = { activa: 1, bibliotecaOS: "si", web: true } as unknown as CapacidadInternet;
    const limpio = capacidadInternetEfectiva(sucio);
    expect(limpio.activa).toBe(false); // "1" no es "true" estricto
    expect(limpio.bibliotecaOS).toBe(false);
    expect(limpio.web).toBe(true);
    expect(limpio.dominiosPermitidos).toEqual([]);
    expect(limpio.dominiosBloqueados).toEqual([]);
  });

  it("un objeto ya completo pasa con sus valores intactos", () => {
    const c: CapacidadInternet = {
      activa: true, bibliotecaOS: true, bibliotecaUsuario: false, dispositivo: false, web: true,
      dominiosPermitidos: ["starseed.social"], dominiosBloqueados: [], ultimoAcceso: 123, ultimoError: null,
    };
    expect(capacidadInternetEfectiva(c)).toEqual(c);
  });
});

/* ─────────────────────────── describirCapacidadInternet ─────────────────────────── */

describe("describirCapacidadInternet", () => {
  it("apagado ⇒ lo dice sin importar qué fuentes individuales estén marcadas debajo", () => {
    const c: CapacidadInternet = { ...CAPACIDAD_INTERNET_VACIA, activa: false, web: true, bibliotecaOS: true };
    const r = describirCapacidadInternet(c);
    expect(r.resumen).toMatch(/apagado/i);
    expect(r.fuentesActivas).toBe(2); // se cuentan igual, pero el resumen dice claramente que no importa
  });

  it("encendido sin ninguna fuente ⇒ lo dice (no puede leer ni buscar nada)", () => {
    const r = describirCapacidadInternet({ ...CAPACIDAD_INTERNET_VACIA, activa: true });
    expect(r.fuentesActivas).toBe(0);
    expect(r.resumen).toMatch(/sin ninguna fuente/i);
  });

  it("encendido con fuentes ⇒ cuenta correctamente sobre el total real de fuentes", () => {
    const r = describirCapacidadInternet({ ...CAPACIDAD_INTERNET_VACIA, activa: true, bibliotecaOS: true, dispositivo: true });
    expect(r.fuentesActivas).toBe(2);
    expect(r.totalFuentes).toBe(4);
    expect(r.resumen).toBe("Acceso a internet encendido con 2 de 4 fuentes concedidas.");
  });

  it("un acceso roto NUNCA parece un acceso apagado: `tieneError` es verdad tanto si `activa` sigue encendida como si no", () => {
    const rotoEncendido = describirCapacidadInternet({ ...CAPACIDAD_INTERNET_VACIA, activa: true, ultimoError: "handshake TLS falló contra R2" });
    const rotoApagado = describirCapacidadInternet({ ...CAPACIDAD_INTERNET_VACIA, activa: false, ultimoError: "handshake TLS falló contra R2" });
    expect(rotoEncendido.tieneError).toBe(true);
    expect(rotoApagado.tieneError).toBe(true);
  });

  it("sin `ultimoError` (o vacío/espacios) ⇒ `tieneError` falso", () => {
    expect(describirCapacidadInternet({ ...CAPACIDAD_INTERNET_VACIA, ultimoError: null }).tieneError).toBe(false);
    expect(describirCapacidadInternet({ ...CAPACIDAD_INTERNET_VACIA, ultimoError: "   " }).tieneError).toBe(false);
  });
});

/* ─────────────────────────── describirDominios ─────────────────────────── */

describe("describirDominios", () => {
  it("sin listas ⇒ sin restricción", () => {
    expect(describirDominios(CAPACIDAD_INTERNET_VACIA).modo).toBe("sin-restriccion");
  });

  it("solo bloqueados ⇒ modo 'bloqueando-algunos'", () => {
    const r = describirDominios({ ...CAPACIDAD_INTERNET_VACIA, dominiosBloqueados: ["mal.example"] });
    expect(r.modo).toBe("bloqueando-algunos");
    expect(r.texto).toMatch(/1 bloqueado/);
  });

  it("permitidos no vacío GANA sobre bloqueados, y el texto lo explica (para que no parezca un bug)", () => {
    const r = describirDominios({ ...CAPACIDAD_INTERNET_VACIA, dominiosPermitidos: ["a.com", "b.com"], dominiosBloqueados: ["a.com"] });
    expect(r.modo).toBe("solo-permitidos");
    expect(r.texto).toMatch(/no se aplica/);
  });
});

/* ─────────────────────────── Herramientas: fuente y agrupado ─────────────────────────── */

describe("etiquetaFuenteHerramienta", () => {
  it("traduce las fuentes conocidas del contrato", () => {
    expect(etiquetaFuenteHerramienta("biblioteca-os")).toBe("Biblioteca del OS");
    expect(etiquetaFuenteHerramienta("dispositivo")).toBe("Dispositivo");
  });

  it("una fuente desconocida se enseña tal cual, nunca se esconde", () => {
    expect(etiquetaFuenteHerramienta("plugin-externo-x")).toBe("plugin-externo-x");
  });

  it("vacía/ausente ⇒ frase honesta, nunca cadena vacía", () => {
    expect(etiquetaFuenteHerramienta("")).toBe("sin fuente indicada");
    expect(etiquetaFuenteHerramienta(null)).toBe("sin fuente indicada");
    expect(etiquetaFuenteHerramienta(undefined)).toBe("sin fuente indicada");
  });
});

describe("agruparHerramientasPorFuente", () => {
  const h = (id: string, fuente: string, disponible = true): HerramientaDisponible => ({ id, nombre: id, fuente, disponible });

  it("agrupa en el orden fijo: os, usuario, dispositivo, web, nativa", () => {
    const lista = [h("w1", "web"), h("d1", "dispositivo"), h("o1", "biblioteca-os"), h("n1", "nativa"), h("u1", "biblioteca-usuario")];
    const grupos = agruparHerramientasPorFuente(lista);
    expect(grupos.map((g) => g.fuente)).toEqual(["biblioteca-os", "biblioteca-usuario", "dispositivo", "web", "nativa"]);
  });

  it("una fuente desconocida no se pierde: va al final, alfabética, con su etiqueta", () => {
    const lista = [h("z1", "zeta-plugin"), h("o1", "biblioteca-os"), h("a1", "alfa-plugin")];
    const grupos = agruparHerramientasPorFuente(lista);
    expect(grupos.map((g) => g.fuente)).toEqual(["biblioteca-os", "alfa-plugin", "zeta-plugin"]);
    expect(grupos[1].etiqueta).toBe("alfa-plugin");
  });

  it("forma inesperada (no-array) ⇒ sin grupos, nunca revienta", () => {
    expect(agruparHerramientasPorFuente(null)).toEqual([]);
    expect(agruparHerramientasPorFuente(undefined)).toEqual([]);
    expect(agruparHerramientasPorFuente("no es una lista" as unknown as HerramientaDisponible[])).toEqual([]);
  });
});

describe("resumirHerramientas", () => {
  it("cuenta disponibles/no disponibles sobre el total real", () => {
    const lista: HerramientaDisponible[] = [
      { id: "1", nombre: "a", fuente: "web", disponible: true },
      { id: "2", nombre: "b", fuente: "web", disponible: false, motivo: "sin permiso" },
      { id: "3", nombre: "c", fuente: "dispositivo", disponible: false },
    ];
    expect(resumirHerramientas(lista)).toEqual({ total: 3, disponibles: 1, noDisponibles: 2 });
  });

  it("un `disponible` que no es literalmente `true` (undefined, backend viejo) cuenta como NO disponible", () => {
    const lista = [{ id: "1", nombre: "a", fuente: "web" } as unknown as HerramientaDisponible];
    expect(resumirHerramientas(lista)).toEqual({ total: 1, disponibles: 0, noDisponibles: 1 });
  });
});

describe("motivoNoDisponible", () => {
  it("usa el motivo real cuando lo hay", () => {
    expect(motivoNoDisponible({ motivo: "requiere permiso de dispositivo" })).toBe("requiere permiso de dispositivo");
  });

  it("nunca en blanco: sin motivo (o vacío) cae a una frase honesta", () => {
    expect(motivoNoDisponible({ motivo: null })).toBe("No disponible — el backend no explicó por qué.");
    expect(motivoNoDisponible({ motivo: undefined })).toBe("No disponible — el backend no explicó por qué.");
    expect(motivoNoDisponible({ motivo: "   " })).toBe("No disponible — el backend no explicó por qué.");
  });
});

/* ─────────────────────────── Cerebros propios: estado de sync ─────────────────────────── */

describe("estadoSyncEfectivo", () => {
  it("'ok' y 'fallo' pasan tal cual", () => {
    expect(estadoSyncEfectivo({ estadoSync: "ok" })).toBe("ok");
    expect(estadoSyncEfectivo({ estadoSync: "fallo" })).toBe("fallo");
  });

  it("ausente, null o cualquier valor raro ⇒ 'nunca' — jamás un 'ok' regalado", () => {
    expect(estadoSyncEfectivo({ estadoSync: undefined })).toBe("nunca");
    expect(estadoSyncEfectivo({ estadoSync: null as unknown as undefined })).toBe("nunca");
    expect(estadoSyncEfectivo({ estadoSync: "sincronizado!" as unknown as "ok" })).toBe("nunca");
  });
});

describe("estadoSyncTono", () => {
  it("los tres estados se ven DISTINTOS entre sí — nunca dos con el mismo tono", () => {
    const tonos = new Set((["ok", "fallo", "nunca"] as const).map(estadoSyncTono));
    expect(tonos.size).toBe(3);
  });
});

describe("resumenSyncCerebro", () => {
  const base: CerebroSer = { id: "c1", nombre: "Memoria larga", sincronizable: true };

  it("'ok' ⇒ etiqueta positiva, sin error que enseñar", () => {
    const r = resumenSyncCerebro({ ...base, estadoSync: "ok" });
    expect(r).toEqual({ estado: "ok", etiqueta: "Sincronizado", error: null });
  });

  it("'nunca' (o ausente) ⇒ etiqueta explícita de 'nunca', sin error — no es un hueco en blanco", () => {
    const r = resumenSyncCerebro(base); // sin estadoSync
    expect(r.estado).toBe("nunca");
    expect(r.etiqueta).toBe("Nunca sincronizado");
    expect(r.error).toBeNull();
  });

  it("'fallo' con `errorSync` real (el caso de hoy: R2 roto por TLS) ⇒ el error real se enseña tal cual, nunca un check verde", () => {
    const r = resumenSyncCerebro({ ...base, estadoSync: "fallo", errorSync: "handshake TLS falló contra Cloudflare R2" });
    expect(r.estado).toBe("fallo");
    expect(r.etiqueta).toBe("Sincronización fallida");
    expect(r.error).toBe("handshake TLS falló contra Cloudflare R2");
  });

  it("'fallo' SIN `errorSync` ⇒ igual se enseña un texto honesto, nunca en blanco", () => {
    const r = resumenSyncCerebro({ ...base, estadoSync: "fallo", errorSync: null });
    expect(r.error).toBe("Falló, pero el backend no dio detalle del error.");
  });
});

describe("resumirCerebros", () => {
  it("cuenta los tres estados, incluyendo estadoSync ausente/raro como 'nunca'", () => {
    const lista: CerebroSer[] = [
      { id: "1", nombre: "a", sincronizable: true, estadoSync: "ok" },
      { id: "2", nombre: "b", sincronizable: true, estadoSync: "fallo", errorSync: "x" },
      { id: "3", nombre: "c", sincronizable: false },
      { id: "4", nombre: "d", sincronizable: false, estadoSync: "ok" },
    ];
    expect(resumirCerebros(lista)).toEqual({ total: 4, ok: 2, fallo: 1, nunca: 1 });
  });

  it("forma inesperada ⇒ todo en cero, nunca revienta", () => {
    expect(resumirCerebros(null)).toEqual({ total: 0, ok: 0, fallo: 0, nunca: 0 });
  });
});

describe("conCerebroActualizado / sinCerebro", () => {
  const lista: CerebroSer[] = [
    { id: "c1", nombre: "Uno", sincronizable: true },
    { id: "c2", nombre: "Dos", sincronizable: false },
  ];

  it("conCerebroActualizado cambia solo el cerebro con ese id, sin tocar el resto del array (inmutable)", () => {
    const siguiente = conCerebroActualizado(lista, "c2", { enrutadoA: "r2://memorias" });
    expect(siguiente).not.toBe(lista);
    expect(siguiente[0]).toBe(lista[0]); // el que no cambió es el MISMO objeto
    expect(siguiente[1]).toEqual({ id: "c2", nombre: "Dos", sincronizable: false, enrutadoA: "r2://memorias" });
    expect(lista[1].enrutadoA).toBeUndefined(); // el original no se mutó
  });

  it("conCerebroActualizado con un id que no existe: no cambia nada", () => {
    expect(conCerebroActualizado(lista, "no-existe", { nombre: "x" })).toEqual(lista);
  });

  it("sinCerebro quita exactamente ese id", () => {
    expect(sinCerebro(lista, "c1")).toEqual([lista[1]]);
  });

  it("sinCerebro con un id que no existe: devuelve la lista igual (nunca lanza)", () => {
    expect(sinCerebro(lista, "no-existe")).toEqual(lista);
  });
});

/* ─────────────────────────── Bots predeterminados ─────────────────────────── */

describe("resumirBots", () => {
  it("cuenta instalados/pendientes sobre el total real (no asume que son 7)", () => {
    const lista: BotPredeterminado[] = [
      { id: "1", nombre: "a", rol: "x", procesoTipoId: "p1", instalado: true },
      { id: "2", nombre: "b", rol: "x", procesoTipoId: "p2", instalado: false },
      { id: "3", nombre: "c", rol: "x", procesoTipoId: "p3", instalado: false },
    ];
    expect(resumirBots(lista)).toEqual({ total: 3, instalados: 1, pendientes: 2 });
  });
});

describe("idsPendientesDeInstalar", () => {
  it("solo incluye los que NO están instalados de verdad", () => {
    const lista: BotPredeterminado[] = [
      { id: "1", nombre: "a", rol: "x", procesoTipoId: "p1", instalado: true },
      { id: "2", nombre: "b", rol: "x", procesoTipoId: "p2", instalado: false },
    ];
    expect(idsPendientesDeInstalar(lista)).toEqual(["2"]);
  });

  it("'instalar no debe poder duplicar': un bot ya instalado NUNCA aparece en la lista a instalar", () => {
    const lista: BotPredeterminado[] = [{ id: "1", nombre: "a", rol: "x", procesoTipoId: "p1", instalado: true }];
    expect(idsPendientesDeInstalar(lista)).toEqual([]);
  });

  it("un `instalado` ambiguo (no es literalmente `true`) se trata como pendiente, nunca se esconde el bot", () => {
    const lista = [{ id: "1", nombre: "a", rol: "x", procesoTipoId: "p1" } as unknown as BotPredeterminado];
    expect(idsPendientesDeInstalar(lista)).toEqual(["1"]);
  });
});

/* ─────────────────────────── Cierre de deudas: biblioteca del usuario ─────────────────────────── */

describe("paquetesDeLibreria", () => {
  it("traduce id/kind/name/description al cuerpo mínimo del backend", () => {
    const libs = [{ id: "p1", kind: "function", name: "Traductor", description: "traduce texto" }];
    expect(paquetesDeLibreria(libs)).toEqual([{ id: "p1", kind: "function", name: "Traductor", description: "traduce texto" }]);
  });

  it("descarta silenciosamente entradas sin id o sin name real (nunca manda un paquete que no podría depositarse)", () => {
    const libs = [
      { id: "", kind: "app", name: "sin id" },
      { id: "p2", kind: "app", name: "   " },
      { id: "p3", kind: "app", name: "válido" },
    ];
    expect(paquetesDeLibreria(libs)).toEqual([{ id: "p3", kind: "app", name: "válido", description: undefined }]);
  });

  it("kind/description vacíos o ausentes se mandan como undefined, nunca como cadena vacía", () => {
    const libs = [{ id: "p1", kind: "", name: "Widget", description: "" }];
    expect(paquetesDeLibreria(libs)).toEqual([{ id: "p1", kind: undefined, name: "Widget", description: undefined }]);
  });

  it("forma inesperada (no-array) ⇒ lista vacía, nunca revienta", () => {
    expect(paquetesDeLibreria(null)).toEqual([]);
    expect(paquetesDeLibreria(undefined)).toEqual([]);
    expect(paquetesDeLibreria("no es una lista" as unknown as never)).toEqual([]);
  });
});

describe("huellaPaquetes", () => {
  it("la misma lista da la misma huella", () => {
    const paquetes = [{ id: "p1", name: "Uno" }, { id: "p2", kind: "app", name: "Dos", description: "dos" }];
    expect(huellaPaquetes(paquetes)).toBe(huellaPaquetes(paquetes.map((p) => ({ ...p }))));
  });

  it("contenido distinto da huellas distintas", () => {
    const a = [{ id: "p1", name: "Uno" }];
    const b = [{ id: "p1", name: "Uno (editado)" }];
    expect(huellaPaquetes(a)).not.toBe(huellaPaquetes(b));
  });

  it("la lista vacía tiene su propia huella estable", () => {
    expect(huellaPaquetes([])).toBe(huellaPaquetes([]));
  });
});

describe("describirDeposito", () => {
  it("inactivo ⇒ cadena vacía (nada que enseñar todavía)", () => {
    expect(describirDeposito({ fase: "inactivo" })).toBe("");
  });

  it("vacío ⇒ dice explícitamente que no hay paquetes propios", () => {
    expect(describirDeposito({ fase: "vacio" })).toMatch(/no tiene paquetes propios/);
  });

  it("depositando ⇒ frase de progreso", () => {
    expect(describirDeposito({ fase: "depositando" })).toMatch(/Depositando/);
  });

  it("ok sin descartados ⇒ cuenta recibidos, sin mencionar descartados", () => {
    const texto = describirDeposito({ fase: "ok", recibidos: 5, descartados: 0, en: 1000 });
    expect(texto).toBe("Biblioteca depositada: 5 paquetes recibidos.");
  });

  it("ok con descartados ⇒ los menciona también, nunca los esconde", () => {
    const texto = describirDeposito({ fase: "ok", recibidos: 1, descartados: 2, en: 1000 });
    expect(texto).toBe("Biblioteca depositada: 1 paquete recibido, 2 descartados.");
  });

  it("error ⇒ el motivo real se enseña tal cual, nunca en blanco", () => {
    expect(describirDeposito({ fase: "error", error: "HTTP 500: índice corrupto", en: 1 })).toBe("No se pudo depositar tu biblioteca: HTTP 500: índice corrupto");
  });
});

/* ─────────────────────────── Cierre de deudas: sincronizar cerebros ─────────────────────────── */

describe("viasSeguras", () => {
  it("sanea cada vía: medio/ok/error con valores por defecto honestos", () => {
    const sucias = [{ medio: "supabase", ok: true }, { medio: "", ok: "sí" as unknown as boolean, error: "  " }] as ViaSincronizacion[];
    expect(viasSeguras(sucias)).toEqual([
      { medio: "supabase", ok: true, error: null },
      { medio: "medio sin nombre", ok: false, error: null },
    ]);
  });

  it("conserva el error real cuando la vía falló de verdad", () => {
    const vias: ViaSincronizacion[] = [{ medio: "r2", ok: false, error: "handshake TLS falló contra Cloudflare R2" }];
    expect(viasSeguras(vias)).toEqual([{ medio: "r2", ok: false, error: "handshake TLS falló contra Cloudflare R2" }]);
  });

  it("forma inesperada (no-array) ⇒ ninguna vía, nunca revienta", () => {
    expect(viasSeguras(null)).toEqual([]);
    expect(viasSeguras(undefined)).toEqual([]);
    expect(viasSeguras("no es una lista" as unknown as ViaSincronizacion[])).toEqual([]);
  });
});

describe("resumirVias — el caso de hoy: Supabase salva, R2 sigue roto", () => {
  it("una vía falla y otra funciona ⇒ `algunaFalla` es verdad AUNQUE haya al menos un `ok`, y el texto lo dice", () => {
    const vias: ViaSincronizacion[] = [{ medio: "supabase", ok: true }, { medio: "r2", ok: false, error: "handshake TLS falló contra Cloudflare R2" }];
    const r = resumirVias(vias);
    expect(r.okCount).toBe(1);
    expect(r.algunaFalla).toBe(true); // nunca se esconde detrás de un ok global
    expect(r.texto).toBe("supabase ok · r2 con fallo");
  });

  it("todas ok ⇒ `algunaFalla` falso", () => {
    const r = resumirVias([{ medio: "supabase", ok: true }, { medio: "r2", ok: true }]);
    expect(r.algunaFalla).toBe(false);
    expect(r.okCount).toBe(2);
  });

  it("sin vías ⇒ resumen vacío pero con forma completa, nunca undefined", () => {
    const r = resumirVias(null);
    expect(r).toEqual({ vias: [], okCount: 0, algunaFalla: false, texto: "" });
  });
});

describe("cerebrosPropiosSeguros", () => {
  it("un ser con array real lo devuelve tal cual", () => {
    const cerebros: CerebroSer[] = [{ id: "c1", nombre: "Memoria", sincronizable: true }];
    expect(cerebrosPropiosSeguros({ cerebrosPropios: cerebros })).toBe(cerebros);
  });

  it("ausente, null o forma rara ⇒ array vacío, nunca revienta un `.map()` en el panel", () => {
    expect(cerebrosPropiosSeguros(null)).toEqual([]);
    expect(cerebrosPropiosSeguros(undefined)).toEqual([]);
    expect(cerebrosPropiosSeguros({ cerebrosPropios: "no es un array" as unknown as CerebroSer[] })).toEqual([]);
  });
});

describe("resumirResultadoGlobal", () => {
  it("junta el desglose de vías con cerebrosTocados/en del resultado global", () => {
    const resultado: ResultadoSincronizacion = {
      ok: true,
      vias: [{ medio: "supabase", ok: true }, { medio: "r2", ok: false, error: "handshake TLS" }],
      cerebrosTocados: 3,
      en: 12345,
    };
    const r = resumirResultadoGlobal(resultado);
    expect(r.cerebrosTocados).toBe(3);
    expect(r.en).toBe(12345);
    expect(r.vias.algunaFalla).toBe(true);
    expect(r.vias.okCount).toBe(1);
  });

  it("cerebrosTocados no-finito (backend roto) ⇒ se sanea a 0", () => {
    const resultado = { ok: true, vias: [], cerebrosTocados: Number.NaN, en: 1 } as ResultadoSincronizacion;
    expect(resumirResultadoGlobal(resultado).cerebrosTocados).toBe(0);
  });
});
