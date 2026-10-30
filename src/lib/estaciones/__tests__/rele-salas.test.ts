import { describe, it, expect } from 'vitest';
import { crearSalas } from '../../../../servicios/estaciones-rele/salas.mjs';

describe('crearSalas', () => {
  it('debería permitir entrar con tema válido y dentro de límites', () => {
    const salas = crearSalas({ maxSalas: 2, maxPorSala: 2, maxBytes: 100 });
    const tema = 'estacion-vivo:ABCDEF1234';
    const conexion = {};
    const result = salas.entrar(tema, conexion);
    expect(result.ok).toBe(true);
    expect(salas.presencia(tema)).toBe(1);
    expect(salas.temaDe(conexion)).toBe(tema);
  });

  it('debería rechazar tema inválido', () => {
    const salas = crearSalas();
    const conexion = {};
    // Tema demasiado corto
    let result = salas.entrar('estacion-vivo:ABC', conexion);
    expect(result.ok).toBe(false);
    expect(result.motivo).toBe('Tema inválido');
    // Tema con formato incorrecto
    result = salas.entrar('estacion-vivo', conexion);
    expect(result.ok).toBe(false);
    expect(result.motivo).toBe('Tema inválido');
    // Tema sin prefijo
    result = salas.entrar('otro-tema:ABCDEF1234', conexion);
    expect(result.ok).toBe(false);
    expect(result.motivo).toBe('Tema inválido');
  });

  it('debería alcanzar límite de salas', () => {
    const salas = crearSalas({ maxSalas: 2, maxPorSala: 100, maxBytes: 100 });
    // Llenar hasta el límite
    for (let i = 0; i < 2; i++) {
      const tema = `estacion-vivo:Tema${i}12345678`;
      const conexion = {};
      const result = salas.entrar(tema, conexion);
      expect(result.ok).toBe(true);
    }
    // Intentar agregar una nueva sala
    const conexionNueva = {};
    const result = salas.entrar('estacion-vivo:TemaNuevo12345678', conexionNueva);
    expect(result.ok).toBe(false);
    expect(result.motivo).toBe('Límite de salas alcanzado');
  });

  it('debería alcanzar límite de conexiones por sala', () => {
    const salas = crearSalas({ maxSalas: 100, maxPorSala: 2, maxBytes: 100 });
    const tema = 'estacion-vivo:Tema112345678';
    // Llenar la sala hasta el límite
    for (let i = 0; i < 2; i++) {
      const conexion = {};
      const result = salas.entrar(tema, conexion);
      expect(result.ok).toBe(true);
    }
    // Intentar agregar una conexión más
    const conexionExtra = {};
    const result = salas.entrar(tema, conexionExtra);
    expect(result.ok).toBe(false);
    expect(result.motivo).toBe('Límite de conexiones por sala alcanzado');
  });

  it('debería salir correctamente', () => {
    const salas = crearSalas();
    const tema = 'estacion-p:Tema12345678';
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

  it('salir dos veces no descuenta de más ni deja la sala contada', () => {
    // Rescatado de la rama nube: al cerrar un socket que ya se había ido (o al repetir el cierre),
    // la cuenta de la sala no puede bajar de cero ni quedar viva sin conexiones.
    const salas = crearSalas();
    const tema = 'estacion-p:Tema12345678';
    const conexion1 = {};
    const conexion2 = {};
    salas.entrar(tema, conexion1);
    salas.entrar(tema, conexion2);
    salas.salir(conexion1);
    salas.salir(conexion1);
    expect(salas.presencia(tema)).toBe(1);
    expect(salas.temaDe(conexion1)).toBeUndefined();
    salas.salir(conexion2);
    salas.salir(conexion2);
    expect(salas.presencia(tema)).toBe(0);
    expect(salas.temaDe(conexion2)).toBeUndefined();
  });

  it('debería no reenviar al emisor en difundir', () => {
    const salas = crearSalas({ maxSalas: 100, maxPorSala: 100, maxBytes: 100 });
    const tema = 'estacion-vivo:Tema112345678';
    const emisor = {};
    const receptor1 = {};
    const receptor2 = {};
    salas.entrar(tema, emisor);
    salas.entrar(tema, receptor1);
    salas.entrar(tema, receptor2);
    const texto = '{"t":"est","datos":"hola"}';
    const destino = salas.difundir(emisor, texto);
    expect(destino.length).toBe(2);
    expect(destino.includes(emisor)).toBe(false);
    expect(destino.includes(receptor1)).toBe(true);
    expect(destino.includes(receptor2)).toBe(true);
  });

  it('debería descartar texto no string en difundir', () => {
    const salas = crearSalas();
    const tema = 'estacion-vivo:Tema112345678';
    const conexion = {};
    salas.entrar(tema, conexion);
    // Número
    let destino = salas.difundir(conexion, 123);
    expect(destino.length).toBe(0);
    // Objeto
    destino = salas.difundir(conexion, {});
    expect(destino.length).toBe(0);
    // Null
    destino = salas.difundir(conexion, null);
    expect(destino.length).toBe(0);
    // Undefined
    destino = salas.difundir(conexion, undefined);
    expect(destino.length).toBe(0);
  });

  it('debería descartar texto demasiado largo en difundir', () => {
    const salas = crearSalas({ maxSalas: 100, maxPorSala: 100, maxBytes: 10 });
    const tema = 'estacion-vivo:Tema112345678';
    const conexion = {};
    salas.entrar(tema, conexion);
    const textoLargo = '{"t":"est","datos":"esto es muy largo"}'; // más de 10 bytes
    const destino = salas.difundir(conexion, textoLargo);
    expect(destino.length).toBe(0);
  });

  it('debería descartar texto que no empieza por {\"t\":\"est\" en difundir', () => {
    const tema = 'estacion-vivo:Tema112345678';
    // Válido
    const salasValidas = crearSalas();
    const conexionValida = {};
    salasValidas.entrar(tema, conexionValida);
    const textoValido = '{"t":"est","datos":"ok"}';
    let destino = salasValidas.difundir(conexionValida, textoValido);
    expect(destino.length).toBe(0); // estamos solos en la sala
    // Vamos a agregar un receptor para probar.
    const receptor = {};
    salasValidas.entrar(tema, receptor);
    destino = salasValidas.difundir(conexionValida, textoValido);
    expect(destino.length).toBe(1);
    expect(destino[0]).toBe(receptor);
    // Inválido - crear una nueva sala para asegurarnos de estar solos
    const salasInv = crearSalas();
    const conexionInv = {};
    salasInv.entrar(tema, conexionInv);
    const textoInvalido1 = '{"t":"otro","datos":"ok"}';
    const textoInvalido2 = '{"t":"est"'; // incompleto
    const textoInvalido3 = 'no es json';
    destino = salasInv.difundir(conexionInv, textoInvalido1);
    expect(destino.length).toBe(0);
    destino = salasInv.difundir(conexionInv, textoInvalido2);
    expect(destino.length).toBe(0);
    destino = salasInv.difundir(conexionInv, textoInvalido3);
    expect(destino.length).toBe(0);
  });

  it('debería devolver la presencia correcta', () => {
    const salas = crearSalas({ maxSalas: 2, maxPorSala: 2, maxBytes: 100 });
    const tema1 = 'estacion-vivo:Tema112345678';
    const tema2 = 'estacion-vivo:Tema212345678';
    expect(salas.presencia(tema1)).toBe(0);
    expect(salas.presencia(tema2)).toBe(0);
    const c1 = {};
    const c2 = {};
    const c3 = {};
    salas.entrar(tema1, c1);
    expect(salas.presencia(tema1)).toBe(1);
    expect(salas.presencia(tema2)).toBe(0);
    salas.entrar(tema1, c2);
    expect(salas.presencia(tema1)).toBe(2);
    salas.entrar(tema2, c3);
    expect(salas.presencia(tema2)).toBe(1);
    salas.salir(c1);
    expect(salas.presencia(tema1)).toBe(1);
    salas.salir(c2);
    expect(salas.presencia(tema1)).toBe(0);
  });

  it('al límite de la sala, volver a entrar con la misma conexión no la rechaza ni la cuenta dos veces', () => {
    const salas = crearSalas({ maxPorSala: 2 });
    const tema = 'estacion-vivo:Tema112345678';
    const conexion1 = {};
    const conexion2 = {};
    salas.entrar(tema, conexion1);
    salas.entrar(tema, conexion2);
    const conexionExtra = {};
    expect(salas.entrar(tema, conexionExtra).ok).toBe(false);
    expect(salas.entrar(tema, conexion1).ok).toBe(true);
    expect(salas.presencia(tema)).toBe(2);
  });
  it('debería aceptar temas con guiones y guiones bajos', () => {
    const salas = crearSalas();
    const tema = 'estacion-vivo:ABC_DEF-123';
    const conexion = {};
    const result = salas.entrar(tema, conexion);
    expect(result.ok).toBe(true);
  });
  it('debería rechazar tema demasiado largo (>80)', () => {
    const salas = crearSalas();
    const tema = 'estacion-vivo:' + 'A'.repeat(81);
    const conexion = {};
    const result = salas.entrar(tema, conexion);
    expect(result.ok).toBe(false);
    expect(result.motivo).toBe('Tema inválido');
  });
  it('debería aceptar el mismo objeto conexion repetidamente', () => {
    const salas = crearSalas();
    const tema = 'estacion-vivo:TemaTest';
    const conexion = {};
    const first = salas.entrar(tema, conexion);
    const second = salas.entrar(tema, conexion);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(salas.presencia(tema)).toBe(1);
  });



  it('debería devolver el tema de una conexión', () => {
    const salas = crearSalas();
    const tema = 'estacion-p:TemaX12345678';
    const conexion = {};
    const result = salas.entrar(tema, conexion);
    expect(result.ok).toBe(true);
    expect(salas.temaDe(conexion)).toBe(tema);
    salas.salir(conexion);
    expect(salas.temaDe(conexion)).toBeUndefined();
  });

  // OPF1024G: una conexión vive en UNA sola sala (el cliente abre `/ws?tema=…`).
  describe('cambio de sala (OPF1024G)', () => {
    const t1 = 'estacion-vivo:SalaUno12345';
    const t2 = 'estacion-vivo:SalaDos12345';

    it('al entrar en otra sala sale de la anterior: cada sala cuenta lo exacto', () => {
      const salas = crearSalas();
      const a = {};
      const b = {};
      salas.entrar(t1, a);
      salas.entrar(t1, b);
      expect(salas.entrar(t2, a).ok).toBe(true);
      expect(salas.temaDe(a)).toBe(t2);
      expect(salas.presencia(t1)).toBe(1);
      expect(salas.presencia(t2)).toBe(1);
      // Lo que b difunde en la sala 1 ya no le llega a a.
      expect(salas.difundir(b, '{"t":"est","x":1}')).toEqual([]);
    });

    it('al cerrar tras cambiar de sala no queda contada en ninguna', () => {
      const salas = crearSalas();
      const a = {};
      salas.entrar(t1, a);
      salas.entrar(t2, a);
      salas.salir(a);
      expect(salas.presencia(t1)).toBe(0);
      expect(salas.presencia(t2)).toBe(0);
      expect(salas.temaDe(a)).toBeUndefined();
    });

    it('si la nueva sala la rechaza, se queda donde estaba', () => {
      const salas = crearSalas({ maxPorSala: 1 });
      const a = {};
      const b = {};
      salas.entrar(t1, a);
      salas.entrar(t2, b);
      const r = salas.entrar(t2, a);
      expect(r.ok).toBe(false);
      expect(salas.temaDe(a)).toBe(t1);
      expect(salas.presencia(t1)).toBe(1);
      expect(salas.presencia(t2)).toBe(1);
    });

    it('la sala que deja vacía no cuenta para el límite de salas', () => {
      const salas = crearSalas({ maxSalas: 1 });
      const a = {};
      salas.entrar(t1, a);
      expect(salas.entrar(t2, a).ok).toBe(true);
      expect(salas.presencia(t1)).toBe(0);
      expect(salas.presencia(t2)).toBe(1);
    });
  });

  it('acepta un tema de exactamente 8 caracteres tras el prefijo', () => {
    const salas = crearSalas();
    const tema = 'estacion-vivo:ABCDEFGH';
    const conexion = {};
    const res = salas.entrar(tema, conexion);
    expect(res.ok).toBe(true);
    expect(salas.presencia(tema)).toBe(1);
  });

  it('rechaza un tema con espacios en el identificador', () => {
    const salas = crearSalas();
    const tema = 'estacion-vivo:ABC DEF';
    const conexion = {};
    const res = salas.entrar(tema, conexion);
    expect(res.ok).toBe(false);
    expect(res.motivo).toBe('Tema inválido');
  });

  it('al salir de la única sala se libera un hueco para otra sala', () => {
    const salas = crearSalas({ maxSalas: 1, maxPorSala: 2 });
    const conexion1 = {};
    const conexion2 = {};
    const tema1 = 'estacion-vivo:SalaUno12';
    const tema2 = 'estacion-vivo:SalaDos12';
    expect(salas.entrar(tema1, conexion1).ok).toBe(true);
    expect(salas.entrar(tema2, conexion2).ok).toBe(false);
    salas.salir(conexion1);
    expect(salas.entrar(tema2, conexion2).ok).toBe(true);
    expect(salas.presencia(tema1)).toBe(0);
    expect(salas.presencia(tema2)).toBe(1);
  });
});