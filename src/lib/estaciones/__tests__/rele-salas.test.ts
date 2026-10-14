import { crearSalas } from '@/lib/estaciones/rele-salas';

describe('rele-salas', () => {
  const maxSalas = 2;
  const maxPorSala = 2;
  const maxBytes = 100;

  it('entrar: tema válido', () => {
    const salas = crearSalas({ maxSalas, maxPorSala, maxBytes });
    const conexion = {};
    const result = salas.entrar('estacion-vivo:ABCDEF1234567890', conexion);
    expect(result.ok).toBe(true);
    expect(salas.presencia('estacion-vivo:ABCDEF1234567890')).toBe(1);
    expect(salas.temaDe(conexion)).toBe('estacion-vivo:ABCDEF1234567890');
  });

  it('entrar: tema inválido por regex', () => {
    const salas = crearSalas({ maxSalas, maxPorSala, maxBytes });
    const conexion = {};
    // Tema demasiado corto
    let result = salas.entrar('estacion-vivo:ABC', conexion);
    expect(result.ok).toBe(false);
    expect(result.motivo).toBe('tema inválido');
    // Tema con caracteres no permitidos
    result = salas.entrar('estacion-vivo:ABC@', conexion);
    expect(result.ok).toBe(false);
    expect(result.motivo).toBe('tema inválido');
    // Tema sin prefijo
    result = salas.entrar('estacion:ABCDEF1234567890', conexion);
    expect(result.ok).toBe(false);
    expect(result.motivo).toBe('tema inválido');
  });

  it('entrar: cambia de sala', () => {
    const salas = crearSalas({ maxSalas, maxPorSala, maxBytes });
    const conexion = {};
    salas.entrar('estacion-vivo:AAAAAAAAAAAAAAAA', conexion);
    expect(salas.temaDe(conexion)).toBe('estacion-vivo:AAAAAAAAAAAAAAAA');
    salas.entrar('estacion-p:BBBBBBBBBBBBBBBB', conexion);
    expect(salas.temaDe(conexion)).toBe('estacion-p:BBBBBBBBBBBBBBBB');
    expect(salas.presencia('estacion-vivo:AAAAAAAAAAAAAAAA')).toBe(0);
    expect(salas.presencia('estacion-p:BBBBBBBBBBBBBBBB')).toBe(1);
  });

  it('entrar: límite de salas', () => {
    const salas = crearSalas({ maxSalas, maxPorSala, maxBytes });
    // Llenar hasta el límite
    salas.entrar('estacion-vivo:AAAAAAAAAAAAAAAA', {});
    salas.entrar('estacion-p:BBBBBBBBBBBBBBBB', {});
    const conexion3 = {};
    const result = salas.entrar('estacion-vivo:CCCCCCCCCCCCCCCC', conexion3);
    expect(result.ok).toBe(false);
    expect(result.motivo).toBe('límite de salas');
    // La tercera conexión no debe estar en ninguna sala
    expect(salas.temaDe(conexion3)).toBeUndefined();
  });

  it('entrar: límite de conexiones por sala', () => {
    const salas = crearSalas({ maxSalas, maxPorSala, maxBytes });
    // Llenar la sala
    salas.entrar('estacion-vivo:AAAAAAAAAAAAAAAA', {});
    salas.entrar('estacion-vivo:AAAAAAAAAAAAAAAA', {});
    const conexion3 = {};
    const result = salas.entrar('estacion-vivo:AAAAAAAAAAAAAAAA', conexion3);
    expect(result.ok).toBe(false);
    expect(result.motivo).toBe('límite de conexiones por sala');
    expect(salas.presencia('estacion-vivo:AAAAAAAAAAAAAAAA')).toBe(2);
    expect(salas.temaDe(conexion3)).toBeUndefined();
  });

  it('salir: elimina conexión y sala si queda vacía', () => {
    const salas = crearSalas({ maxSalas, maxPorSala, maxBytes });
    const conexion = {};
    salas.entrar('estacion-vivo:AAAAAAAAAAAAAAAA', conexion);
    expect(salas.presencia('estacion-vivo:AAAAAAAAAAAAAAAA')).toBe(1);
    salas.salir(conexion);
    expect(salas.presencia('estacion-vivo:AAAAAAAAAAAAAAAA')).toBe(0);
    // Salir de una conexión que no está en ninguna sala no debe hacer nada
    expect(() => salas.salir(conexion)).not.toThrow();
  });

  it('difundir: no reenvía al emisor', () => {
    const salas = crearSalas({ maxSalas, maxPorSala, maxBytes });
    const emisor = {};
    const receptor = {};
    salas.entrar('estacion-vivo:AAAAAAAAAAAAAAAA', emisor);
    salas.entrar('estacion-vivo:AAAAAAAAAAAAAAAA', receptor);
    const destinatarios = salas.difundir(emisor, '{\"t\":\"est\",\"d\":\"hola\"}');
    expect(destinatarios).toEqual([receptor]);
    expect(destinatarios).not.toContain(emisor);
  });

  it('difundir: descarta texto no string', () => {
    const salas = crearSalas({ maxSalas, maxPorSala, maxBytes });
    const conexion = {};
    salas.entrar('estacion-vivo:AAAAAAAAAAAAAAAA', conexion);
    const destinatarios = salas.difundir(conexion, 123);
    expect(destinatarios).toEqual([]);
  });

  it('difundir: descarta texto que supera maxBytes', () => {
    const salas = crearSalas({ maxSalas, maxPorSala, maxBytes });
    const conexion = {};
    salas.entrar('estacion-vivo:AAAAAAAAAAAAAAAA', conexion);
    // Un string que al codificar en UTF-8 exceda 100 bytes
    const largoTexto = '{\"t\":\"est\",\"d\":\"' + 'a'.repeat(200) + '\"}'; // Esto probablemente exceda 100 bytes
    const destinatarios = salas.difundir(conexion, largoTexto);
    expect(destinatarios).toEqual([]);
  });

  it('difundir: descarta texto que no empieza por {\\"t\\":\\"est', () => {
    const salas = crearSalas({ maxSalas, maxPorSala, maxBytes });
    const conexion = {};
    salas.entrar('estacion-vivo:AAAAAAAAAAAAAAAA', conexion);
    const destinatarios = salas.difundir(conexion, '{\"t\":\"otro\"}');
    expect(destinatarios).toEqual([]);
    const destinatarios2 = salas.difundir(conexion, 'no es json');
    expect(destinatarios2).toEqual([]);
  });

  it('difundir: retorna lista de conexiones destino cuando el texto es válido', () => {
    const salas = crearSalas({ maxSalas, maxPorSala: 3, maxBytes });
    const emisor = {};
    const receptor1 = {};
    const receptor2 = {};
    salas.entrar('estacion-vivo:AAAAAAAAAAAAAAAA', emisor);
    salas.entrar('estacion-vivo:AAAAAAAAAAAAAAAA', receptor1);
    salas.entrar('estacion-vivo:AAAAAAAAAAAAAAAA', receptor2);
    expect(salas.presencia('estacion-vivo:AAAAAAAAAAAAAAAA')).toBe(3);
    const destinatarios = salas.difundir(emisor, '{\"t\":\"est\",\"d\":\"hola\"}');
    expect(destinatarios).toEqual(expect.arrayContaining([receptor1, receptor2]));
    expect(destinatarios.length).toBe(2);
    expect(destinatarios).not.toContain(emisor);
  });

  it('presencia: retorna número de conexiones en la sala (alternativo)', () => {
    const salas = crearSalas({ maxSalas, maxPorSala, maxBytes });
    const c1 = {};
    const c2 = {};
    const c3 = {};
    expect(salas.presencia('estacion-vivo:AAAAAAAAAAAAAAAA')).toBe(0);
    salas.entrar('estacion-vivo:AAAAAAAAAAAAAAAA', c1);
    expect(salas.presencia('estacion-vivo:AAAAAAAAAAAAAAAA')).toBe(1);
    salas.entrar('estacion-vivo:AAAAAAAAAAAAAAAA', c2);
    expect(salas.presencia('estacion-vivo:AAAAAAAAAAAAAAAA')).toBe(2);
    salas.salir(c1);
    expect(salas.presencia('estacion-vivo:AAAAAAAAAAAAAAAA')).toBe(1);
    salas.salir(c2);
    expect(salas.presencia('estacion-vivo:AAAAAAAAAAAAAAAA')).toBe(0);
  });

  it('temaDe: retorna el tema de la conexión o undefined', () => {
    const salas = crearSalas({ maxSalas, maxPorSala, maxBytes });
    const conexion = {};
    expect(salas.temaDe(conexion)).toBeUndefined();
    salas.entrar('estacion-vivo:AAAAAAAAAAAAAAAA', conexion);
    expect(salas.temaDe(conexion)).toBe('estacion-vivo:AAAAAAAAAAAAAAAA');
    salas.salir(conexion);
    expect(salas.temaDe(conexion)).toBeUndefined();
  });
});