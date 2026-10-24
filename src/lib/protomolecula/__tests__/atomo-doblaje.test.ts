/** Átomo «doblaje» (VST1018J): definición, registro y PLAN puro con licencia por contexto (personal frente a grupo/comunidad/
 *  público/comercial) y permiso para conservar la voz original. Sin red, micrófono, altavoz ni procesos. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { DOBLAJE, planDoblaje, type EntradaDoblaje, type HablantePlan } from "../atomos/doblaje";
import { ATOMOS_PROPIOS } from "../atomos";
import { limpiarRegistro, registrarAtomo } from "../registro-atomos";
import { MOTORES_VOZ } from "@/lib/aurora/catalogo-voces";
import type { PermisoVoz, UsoVoz } from "@/lib/aurora/voz-starseed/clonacion";

const AHORA = 1_000_000;
const base = (cambios: Partial<EntradaDoblaje> = {}): EntradaDoblaje => ({
  valores: {}, medio: "video", idiomaOrigen: "es", contexto: "personal", plataforma: "macos", ramGB: 8,
  oidoDisponibles: ["parakeet-v3", "moonshine"], solicitante: "alex", hablantes: ["alex"], permisos: [], ahora: AHORA, ...cambios,
});
const permiso = (para: UsoVoz[], extra: Partial<PermisoVoz> = {}): PermisoVoz => ({ id: "p1", titular: "ana", concedidoA: "alex", para, desde: 0, ...extra });
const motores = (e: EntradaDoblaje, paso: string) => planDoblaje(e).pasos.find((p) => p.paso === paso)?.motores ?? [];
const clase = (id: string | undefined) => MOTORES_VOZ.find((m) => m.id === id)?.claseLicencia;
const CONSERVAR = { "conservar-voz": true };
const NO_PERSONALES: UsoVoz[] = ["grupo", "comunidad", "publico", "comercial"];

describe("átomo doblaje · definición", () => {
  beforeEach(() => limpiarRegistro());
  it("declara el contrato de VoiceStudio, se registra y está en el índice", () => {
    expect(DOBLAJE).toMatchObject({ herramientaId: "voicestudio", categoria: "audio", integracion: "servicio-local", control: "total", ficha: { licencia: "AGPL-3.0-only" } });
    expect(DOBLAJE.parametros.map((p) => p.id)).toEqual(["idioma", "voz-por-hablante", "conservar-voz", "aislar-voz", "subtitulos"]);
    expect([DOBLAJE.entradas, DOBLAJE.salidas]).toEqual([expect.arrayContaining(["mp4", "wav"]), expect.arrayContaining(["wav", "srt"])]);
    expect(DOBLAJE.parametros.find((p) => p.id === "conservar-voz")?.defecto).toBe(false); // clonar nunca por defecto
    expect(registrarAtomo(DOBLAJE)).toEqual({ ok: true });
    expect(ATOMOS_PROPIOS).toContain(DOBLAJE);
  });
  it("el módulo es puro, sin claves ni IPs, y cabe en 120 líneas", () => {
    const src = readFileSync(path.join(__dirname, "..", "atomos", "doblaje.ts"), "utf8");
    expect(src.trimEnd().split("\n").length).toBeLessThanOrEqual(120);
    expect(src).not.toMatch(/from ["'](react|next|node:|fs|path|child_process)/);
    expect(src).not.toMatch(/\b(fetch|WebSocket|XMLHttpRequest|localStorage|navigator|setTimeout|spawn)\b|Date\.now|Math\.random|\bany\b/);
    expect(src).not.toMatch(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|sk-[A-Za-z0-9]{10}|Bearer\s/);
  });
});
describe("plan del doblaje", () => {
  it("cinco pasos en orden, con motor y licencia, y nada no comercial por defecto", () => {
    const plan = planDoblaje(base());
    expect(plan.pasos.map((p) => p.paso)).toEqual(["oido", "texto", "traduccion", "voz", "mezcla"]);
    for (const p of plan.pasos) expect(p.licencias.length).toBe(p.motores.length);
    expect(plan.pasos.map((p) => p.motores)).toEqual([["demucs", "pyannote"], ["parakeet-v3"], ["palabra"], ["cosyvoice3"], ["voicestudio"]]);
    expect(clase(plan.pasos[3].motores[0])).toBe("libre");
    expect(plan).toMatchObject({ idiomaDestino: "en", salidas: ["wav", "mp4", "srt"], etiqueta: null });
    expect(plan.avisos.join(" ")).toContain("atribución obligatoria (CC-BY-4.0)");
  });
  it("es puro: misma entrada, mismo plan, y la entrada no cambia", () => {
    const e = base({ valores: CONSERVAR, hablantes: ["alex", "ana"] }), copia = structuredClone(e);
    expect(planDoblaje(e)).toEqual(planDoblaje(e));
    expect(e).toEqual(copia);
  });
  it("salidas e idioma según medio y parámetros; un valor inválido vuelve al de por defecto", () => {
    expect(planDoblaje(base({ medio: "audio", valores: { subtitulos: "ninguno" } })).salidas).toEqual(["wav"]);
    expect(planDoblaje(base({ valores: { subtitulos: "vtt", idioma: "francés" } }))).toMatchObject({ salidas: ["wav", "mp4", "vtt"], idiomaDestino: "fr" });
    expect(planDoblaje(base({ valores: { idioma: "klingon", subtitulos: 3, "aislar-voz": "sí" } }))).toMatchObject({ idiomaDestino: "en", salidas: ["wav", "mp4", "srt"] });
  });
});
describe("licencia por contexto", () => {
  it("en lo personal, un motor «personal» solo suena si se pide a mano", () => {
    expect(motores(base({ motorVozPreferido: "voicemorphic" }), "voz")).toEqual(["voicemorphic"]);
    expect(motores(base(), "voz")).not.toEqual(["voicemorphic"]);
  });
  it.each(NO_PERSONALES)("en «%s» un motor «personal» pedido no entra: suena uno libre y se avisa", (contexto) => {
    for (const pedido of ["voicemorphic", "voicestudio"]) {
      const plan = planDoblaje(base({ contexto, motorVozPreferido: pedido }));
      expect(clase(plan.pasos[3].motores[0])).toBe("libre");
      expect(plan.avisos.join(" ")).toContain(`«${pedido}» no entra en «${contexto}»`);
    }
  });
  it.each(NO_PERSONALES)("en «%s» una medida de RAM rota no abre la puerta a un motor «personal»", (contexto) => {
    expect(clase(motores(base({ contexto, ramGB: Number.NaN }), "voz")[0])).toBe("libre");
  });
  it("fuera de lo personal un oído sin licencia conocida no entra, y el audio no sale a la malla sin permiso", () => {
    expect(motores(base({ oidoDisponibles: ["vibeasr-158", "moonshine"] }), "texto")).toEqual(["vibeasr-158"]);
    expect(motores(base({ oidoDisponibles: ["vibeasr-158", "moonshine"], contexto: "comercial" }), "texto")).toEqual(["moonshine"]);
    expect(motores(base({ oidoDisponibles: ["malla"] }), "texto")).toEqual(["navegador"]);
    expect(motores(base({ oidoDisponibles: ["malla"], audioPuedeSalir: true }), "texto")).toEqual(["malla"]);
  });
});
describe("conservar la voz original con permiso", () => {
  it("la voz propia se clona con marca de agua y la etiqueta «voz clonada»", () => {
    const plan = planDoblaje(base({ valores: CONSERVAR, marcaAguaDisponible: true }));
    expect([plan.hablantes, plan.pasos[4].motores]).toEqual([[{ id: "alex", voz: "clonada" }], ["voicestudio", "audioseal"]]);
    expect(plan.etiqueta).toMatchObject({ clonada: true, marcaAgua: "audioseal", etiqueta: "voz clonada", motor: "cosyvoice3" });
  });
  it("la voz de otra persona sin su permiso nunca se clona", () => {
    const plan = planDoblaje(base({ valores: CONSERVAR, hablantes: ["alex", "ana"] }));
    expect(plan.hablantes).toEqual([{ id: "alex", voz: "clonada" }, { id: "ana", voz: "sustituta", motivo: expect.stringContaining("ana") }]);
  });
  it.each<[string, PermisoVoz[], UsoVoz, HablantePlan["voz"]]>([
    ["con permiso para ese uso", [permiso(["comercial"])], "comercial", "clonada"],
    ["con permiso solo personal, en un grupo", [permiso(["personal"])], "grupo", "sustituta"],
    ["con el permiso revocado", [permiso(["comunidad"], { revocado: true })], "comunidad", "sustituta"],
    ["con el permiso caducado", [permiso(["publico"], { hasta: AHORA - 1 })], "publico", "sustituta"],
    ["con un permiso que aún no empieza", [permiso(["grupo"], { desde: AHORA + 1 })], "grupo", "sustituta"],
    ["con un permiso dado a otra cuenta", [permiso(["grupo"], { concedidoA: "eva" })], "grupo", "sustituta"],
  ])("la voz de ana %s → %s", (_, permisos, contexto, voz) => {
    expect(planDoblaje(base({ valores: CONSERVAR, contexto, hablantes: ["ana"], permisos, marcaAguaDisponible: true })).hablantes[0].voz).toBe(voz);
  });
  it("sin marca de agua, una voz clonada no sale de lo personal", () => {
    const fuera = planDoblaje(base({ valores: CONSERVAR, contexto: "grupo", hablantes: ["ana"], permisos: [permiso(["grupo"])] }));
    expect(fuera).toMatchObject({ hablantes: [{ id: "ana", voz: "sustituta" }], etiqueta: null });
    expect(fuera.avisos.join(" ")).toContain("marca de agua");
    expect(planDoblaje(base({ valores: CONSERVAR })).etiqueta).toMatchObject({ marcaAgua: "pendiente", publicaFueraPersonal: false });
  });
  it("con una sola voz para todos no se clona a nadie ni se separan hablantes", () => {
    const plan = planDoblaje(base({ valores: { ...CONSERVAR, "voz-por-hablante": false } }));
    expect([plan.hablantes[0].voz, plan.pasos[0].motores]).toEqual(["sustituta", ["demucs"]]);
    expect(plan.avisos.join(" ")).toContain("una sola voz para todos");
  });
  it("si la neurona no tiene un motor permitido que clone, voz sustituta libre y aviso", () => {
    const plan = planDoblaje(base({ valores: CONSERVAR, plataforma: "android", ramGB: 4 }));
    expect([plan.hablantes[0].voz, clase(plan.pasos[3].motores[0])]).toEqual(["sustituta", "libre"]);
    expect(plan.avisos.join(" ")).toContain("no tiene un motor permitido que clone");
  });
});
