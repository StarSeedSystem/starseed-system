import { describe, expect, it, vi } from "vitest";
import {
  MOTIVO_SIN_COMPUTADORA, apagar, ejecutar, encender, estadoComputadora, type FetchComputadora,
} from "../adaptadores/computadora-cliente";
import {
  PERMISOS_COMPUTADORA_DEFECTO, SIN_COMPUTADORA, elegirComputadora, normalizarPermisos, permisoParaOrden,
  type MedioDisponible, type PermisosComputadora,
} from "../computadora";
import type { OrigenBot } from "../tipos";

const bot = (origen: OrigenBot = "astraura", activo = true) => ({ origen, activo });
const libre = (medio: MedioDisponible["medio"], interactivo = true, esta = true): MedioDisponible => ({ medio, libre: esta, interactivo });
const todos = [libre("actions", false), libre("neurona"), libre("a1")];
const permisos = (o: Partial<PermisosComputadora> = {}): PermisosComputadora => ({ ...PERMISOS_COMPUTADORA_DEFECTO, terminal: true, ...o });
const puede = (orden: string, o: Partial<PermisosComputadora> = {}) => permisoParaOrden(permisos(o), orden);
const respuesta = (status: number, cuerpo?: object) => new Response(cuerpo ? JSON.stringify(cuerpo) : null, { status });
const simulado = (status: number, cuerpo?: object) => vi.fn<FetchComputadora>(async () => respuesta(status, cuerpo));

describe("permisos de la computadora del bot", () => {
  it("por defecto todo apagado y la red por lista; lo guardado raro se lee apagado", () => {
    expect(PERMISOS_COMPUTADORA_DEFECTO).toEqual({ navegador: false, archivos: false, terminal: false, red: "lista" });
    expect(Object.isFrozen(PERMISOS_COMPUTADORA_DEFECTO)).toBe(true);
    expect(normalizarPermisos(null)).toEqual(PERMISOS_COMPUTADORA_DEFECTO);
    expect(normalizarPermisos({ terminal: "true", navegador: 1, red: "todo" })).toEqual(PERMISOS_COMPUTADORA_DEFECTO);
    expect(normalizarPermisos({ terminal: true, red: "nada" })).toMatchObject({ terminal: true, red: "nada", archivos: false });
  });
});

describe("elegirComputadora", () => {
  it("orden a1 → neurona → actions, saltando lo ocupado", () => {
    expect(elegirComputadora(bot(), todos, { interactivo: true })).toEqual({ medio: "a1" });
    expect(elegirComputadora(bot(), [libre("a1", true, false), ...todos.slice(0, 2)], { interactivo: true })).toEqual({ medio: "neurona" });
    expect(elegirComputadora(bot(), [libre("actions", false), libre("neurona", true, false)], { interactivo: false })).toEqual({ medio: "actions" });
    expect(elegirComputadora(bot(), [], { interactivo: false })).toEqual({ motivo: SIN_COMPUTADORA });
  });
  it("un invitado (externo o AG-UI) nunca tiene computadora; un bot en pausa tampoco la enciende", () => {
    for (const origen of ["externo", "ag-ui"] as const) expect(elegirComputadora(bot(origen), todos, { interactivo: false })).toHaveProperty("motivo");
    expect(elegirComputadora(bot("astraura", false), todos, { interactivo: false })).toHaveProperty("motivo");
  });
  it("actions nunca para trabajo interactivo, aunque diga que lo es", () => {
    const soloActions = [libre("actions", true), libre("a1", false)];
    const r = elegirComputadora(bot(), soloActions, { interactivo: true });
    expect(r).not.toHaveProperty("medio");
    expect(r).toEqual({ motivo: expect.stringContaining("lotes") });
    expect(elegirComputadora(bot(), [...soloActions, libre("neurona")], { interactivo: true })).toEqual({ medio: "neurona" });
  });
});

describe("permisoParaOrden", () => {
  it("la shell solo con terminal; lo normal pasa", () => {
    expect(permisoParaOrden(PERMISOS_COMPUTADORA_DEFECTO, "ls -la")).toMatchObject({ permitido: false, requiere: "terminal" });
    for (const o of ["ls -la", "awk '{print $1}' datos.csv | sort", "rm -rf build/*", "ls *.py", "[ -f a ] && echo si",
      "git status", "grep -n 'fin$' notas.txt", "set -e", "find . -name x -exec rm {} \\;", "awk '{print $1,$2}' a",
      "cat d.json | python3 -m json.tool", "git commit -m 'arreglo!'"]) {
      expect(puede(o)).toMatchObject({ permitido: true, requiere: "nada" });
    }
  });
  it.each([
    "docker ps", "sudo apt install x", "ssh servidor", "cat /proc/self/environ", "cat .env", "cat config/.env.local",
    "ls; sudo id", "ls\nsudo id", "ls & sudo id", "ls |& sudo id", "echo $(id)", "echo `id`", "diff <(ls) a",
    "s\"u\"do id", "/usr/bin/sudo id", "X=1 sudo id", "doc\\\nker ps", "cat /pr?c/self/environ", "cat */self/environ",
    "cat .en*", "alias l=ls", "$CMD -la", "bash -c 'X=su; $X id'", "cat {.env,a}", "cat</proc/1/environ", "printenv", "export -p",
    "echo ${HOME}", "echo \"$HOME\"", "echo 'abierto", "bash -c \"echo $'\\x73'\"",
    // Llaves, extglob, `:!` de vim y texto por tubería a una shell: arman la palabra prohibida sin escribirla.
    "cat /pr{o,o}c/1/environ", "s{u,' 'u}do id", "do{c,c}ker ps", "/usr/bin/+(s)udo id", "vim -c ':!sudo id'",
    "echo c3VkbyBpZA== | base64 -d | sh", "echo x |& bash", "echo x |\n /bin/sh",
  ])("nunca: %s", (orden) => {
    expect(puede(orden, { navegador: true, archivos: true, red: "defecto" })).toMatchObject({ permitido: false, requiere: "nunca" });
  });
  it("red «nada» bloquea curl, wget y git clone; con la lista pasan", () => {
    for (const o of ["curl https://ejemplo.org", "wget ejemplo.org/a.zip", "git -C repo clone https://x.org/r", "npm install", "npm ci", "ping ejemplo.org"]) {
      expect(puede(o, { red: "nada" })).toMatchObject({ permitido: false, requiere: "red" });
      expect(puede(o, { red: "lista" }).permitido).toBe(true);
    }
    expect(puede("git status", { red: "nada" }).permitido).toBe(true);
  });
  it("el navegador de la computadora va aparte", () => {
    expect(puede("chromium --headless")).toMatchObject({ permitido: false, requiere: "navegador" });
    expect(puede("chromium --headless", { navegador: true }).permitido).toBe(true);
  });
});

describe("cliente honesto de la computadora", () => {
  const abierta = { permisos: permisos() };
  it("si la ruta no existe (404) dice «próximamente» en las cuatro llamadas", async () => {
    const f = simulado(404);
    for (const r of [await estadoComputadora("b1", { fetch: f }), await encender("b1", { fetch: f }),
      await apagar("b1", { fetch: f }), await ejecutar("b1", "ls", { ...abierta, fetch: f })]) {
      expect(r).toEqual({ ok: false, motivo: MOTIVO_SIN_COMPUTADORA });
    }
    expect(f).toHaveBeenCalledTimes(4);
    expect(f.mock.calls[0][0]).toBe("/api/bots/computadora/estado?botId=b1");
  });
  it("nunca envía claves: ni cabecera de autorización ni una orden con forma de clave", async () => {
    const f = simulado(200, { ok: true, salida: "hola", codigo: 0 });
    expect(await ejecutar("b1", "ls", { ...abierta, fetch: f })).toEqual({ ok: true, datos: { salida: "hola", codigo: 0 } });
    const init = f.mock.calls[0][1];
    expect(JSON.stringify(init.headers ?? {})).not.toMatch(/authorization/i);
    expect(init.credentials).toBe("same-origin");
    expect(JSON.parse(String(init.body))).toEqual({ botId: "b1", orden: "ls" });
    const clave = ["s", "k-", "abcd1234efgh"].join("");
    expect((await ejecutar("b1", `echo ${clave}`, { ...abierta, fetch: f })).ok).toBe(false);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("sin permisos del bot la terminal se da por apagada y no se envía nada", async () => {
    const f = simulado(200, { ok: true });
    expect(await ejecutar("b1", "ls", { fetch: f })).toMatchObject({ ok: false, motivo: expect.stringContaining("terminal") });
    expect(await ejecutar("../b1", "ls", { ...abierta, fetch: f })).toMatchObject({ ok: false });
    expect(f).not.toHaveBeenCalled();
  });
  it("lee el estado con desconfianza y sin red dice que no hay conexión", async () => {
    const f = simulado(200, { encendida: true, medio: "marte", permisos: { terminal: "si" } });
    expect(await estadoComputadora("b1", { fetch: f })).toEqual({ ok: true, datos: { encendida: true, medio: null, permisos: PERMISOS_COMPUTADORA_DEFECTO } });
    const caido = vi.fn<FetchComputadora>(async () => { throw new TypeError("sin red"); });
    expect(await encender("b1", { fetch: caido })).toEqual({ ok: false, motivo: expect.stringContaining("sin conexión") });
    expect(await apagar("b1", { fetch: simulado(500, { motivo: "El A1 no responde." }) })).toEqual({ ok: false, motivo: "El A1 no responde." });
  });
});
