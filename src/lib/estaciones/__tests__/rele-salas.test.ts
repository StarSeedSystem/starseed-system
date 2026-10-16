import { describe, expect, it } from "vitest";
import { crearSalas } from "../rele-salas";

describe("estaciones · rele de salas", () => {
  it("debería permitir entrar con tema válido y dentro de límites", () => {
    const salas = crearSalas({ maxSalas: 2, maxPorSala: 2, maxBytes: 100 });
    const tema = "estacion-vivo:ABCDEF1234";
    const conexion = {};
    const result = salas.entrar(tema, conexion);
    expect(result.ok).toBe(true);
    expect(salas.presencia(tema)).toBe(1);
    expect(salas.temaDe(conexion)).toBe(tema);
  });

  it("debería salir correctamente", () => {
    const salas = crearSalas();
    const tema = "estacion-p:Tema12345678";
    const conexion1 = {};
    const conexion2 = {};
    salas.entrar(tema, conexion1);
    salas.entrar(tema, conexion2);
    expect(salas.presencia(tema)).toBe(2);
    salas.salir(conexion1);
    expect(salas.presencia(tema)).toBe(1);
    expect(salas.temaDe(conexion1)).toBeUndefined();
    expect(salas.temaDe(conexion2)).toBe(tema);
    salas.salir(conexion2);
    expect(salas.presencia(tema)).toBe(0);
  });

  it("debería rechazar tema inválido", () => {
    const salas = crearSalas();
    const temaInv = "tema-no-valido";
    const conexion = {};
    const result = salas.entrar(temaInv, conexion);
    expect(result.ok).toBe(false);
    expect(salas.presencia(temaInv)).toBe(0);
    expect(salas.temaDe(conexion)).toBeUndefined();
  });

  it("debería alcanzar límite de salas", () => {
    const salas = crearSalas({ maxSalas: 1 });
    const tema1 = "estacion-a:1111";
    const tema2 = "estacion-b:2222";
    const c1 = {};
    const c2 = {};
    // primera sala ok
    expect(salas.entrar(tema1, c1).ok).toBe(true);
    // segunda sala debería fallar porque límite de salas alcanzado
    expect(salas.entrar(tema2, c2).ok).toBe(false);
    expect(salas.presencia(tema1)).toBe(1);
    expect(salas.presencia(tema2)).toBe(0);
  });

  it("debería alcanzar límite de conexiones por sala", () => {
    const salas = crearSalas({ maxSalas: 1, maxPorSala: 2 });
    const tema = "estacion-limite:9999";
    const c1 = {};
    const c2 = {};
    const c3 = {};
    expect(salas.entrar(tema, c1).ok).toBe(true);
    expect(salas.entrar(tema, c2).ok).toBe(true);
    // tercer conexión debería fallar
    expect(salas.entrar(tema, c3).ok).toBe(false);
    expect(salas.presencia(tema)).toBe(2);
  });

  it("debería no reenviar al emisor en difundir", () => {
    const salas = crearSalas({ maxBytes: 100 });
    const tema = "estacion-difusion:1";
    const emisor = {};
    const receptor = {};
    salas.entrar(tema, emisor);
    salas.entrar(tema, receptor);
     // asumimos que difundir devuelve un array de conexiones que deben recibir el mensaje
     const resultado = salas.difundir(tema, '{"t":"est", "hola":1}', emisor);
     // resultado debería contener al receptor pero no al emisor
     expect(resultado).toContain(receptor);
     expect(resultado).not.toContain(emisor);
  });

  it("debería descartar texto no string en difundir", () => {
    const salas = crearSalas({ maxBytes: 100 });
    const tema = "estacion-difusion:2";
    const conexion = {};
    salas.entrar(tema, conexion);
    // pasar un número en lugar de string debería ser ignorado
    const resultado = salas.difundir(tema, 123);
    // probablemente devuelve vacío o no afecta
    expect(resultado).toEqual([]); // asumiendo que devuelve array de conexiones que reciben
  });

  it("debería descartar texto demasiado largo en difundir", () => {
    const salas = crearSalas({ maxBytes: 5 });
    const tema = "estacion-difusion:3";
    const conexion = {};
    salas.entrar(tema, conexion);
    const mensajeLargo = '{"t":"est","data":"' + "x".repeat(200) + '"}'; // asegura longitud > maxBytes
    const resultado = salas.difundir(tema, mensajeLargo);
    expect(resultado).toEqual([]);
  });

  it("debería descartar texto que no empieza por {\"t\":\"est\" en difundir", () => {
    const salas = crearSalas({ maxBytes: 100 });
    const tema = "estacion-difusion:4";
    const conexion = {};
    salas.entrar(tema, conexion);
    const mensajeInvalido = '{"otro":1}';
    const resultado = salas.difundir(tema, mensajeInvalido);
    expect(resultado).toEqual([]);
  });

  it("debería devolver la presencia correcta", () => {
    const salas = crearSalas();
    const tema = "estacion-presencia:5";
    const c1 = {};
    const c2 = {};
    expect(salas.presencia(tema)).toBe(0);
    salas.entrar(tema, c1);
    expect(salas.presencia(tema)).toBe(1);
    salas.entrar(tema, c2);
    expect(salas.presencia(tema)).toBe(2);
    salas.salir(c1);
    expect(salas.presencia(tema)).toBe(1);
  });

  it("debería devolver el tema de una conexión", () => {
    const salas = crearSalas();
    const tema = "estacion-tema:6";
    const conexion = {};
    expect(salas.temaDe(conexion)).toBeUndefined();
    salas.entrar(tema, conexion);
    expect(salas.temaDe(conexion)).toBe(tema);
    salas.salir(conexion);
    expect(salas.temaDe(conexion)).toBeUndefined();
  });
});