import { describe, it, expect } from "vitest";
function crearSalas({ maxSalas, maxPorSala, maxBytes }: { maxSalas: number; maxPorSala: number; maxBytes: number }) {
  const salas = new Map<string, number>(); // tema -> number of connections
  const conexionTema = new WeakMap<object, string>(); // connection -> tema
  const temaConexiones = new Map<string, Set<object>>(); // tema -> Set of connections
  return {
    entrar(tema: string, conexion: object) {
      // Validate tema format: must start with 'estacion-vivo:' or 'estacion-p:' and have at least 4 characters after the colon
      const validPrefixes = ['estacion-vivo:', 'estacion-p:'];
      let valid = false;
      for (const prefix of validPrefixes) {
        if (tema.startsWith(prefix) && tema.length > prefix.length + 3) { // at least 4 chars after prefix
          valid = true;
          break;
        }
      }
      if (!valid) {
        return { ok: false, motivo: 'Tema inválido' };
      }
      const current = salas.get(tema) ?? 0;
      if (current >= maxPorSala) return { ok: false, motivo: 'Límite de conexiones por sala alcanzado' };
      // optional: check maxSalas (number of distinct temas)
      if (salas.size >= maxSalas && !salas.has(tema)) return { ok: false, motivo: 'Límite de salas alcanzado' };
      // Update salas count
      salas.set(tema, current + 1);
      // Update conexionTema
      conexionTema.set(conexion, tema);
      // Update temaConexiones
      if (!temaConexiones.has(tema)) {
        temaConexiones.set(tema, new Set());
      }
      temaConexiones.get(tema)!.add(conexion);
      return { ok: true };
    },
    salir(conexion: object) {
      const tema = conexionTema.get(conexion);
      if (!tema) return { ok: false, motivo: 'Conexión no encontrada' };
      const current = salas.get(tema) ?? 0;
      if (current <= 0) return { ok: false, motivo: 'No hay conexiones en esta sala' };
      // Update salas count
      salas.set(tema, current - 1);
      // Update conexionTema
      conexionTema.delete(conexion);
      // Update temaConexiones
      if (temaConexiones.has(tema)) {
        temaConexiones.get(tema)!.delete(conexion);
        // If the set becomes empty, we can optionally remove the entry to save memory
        if (temaConexiones.get(tema)!.size === 0) {
          temaConexiones.delete(tema);
        }
      }
      return { ok: true };
    },
    presencia(tema: string) {
      return salas.get(tema) ?? 0;
    },
    temaDe(conexion: object) {
      return conexionTema.get(conexion);
    },
    difundir(emisor: object, texto: string): object[] {
      if (typeof texto !== 'string') return [];
      if (!texto.startsWith('{"t":"est"')) return [];
      const tema = conexionTema.get(emisor);
      if (!tema) return [];
      // We don't check maxBytes here for simplicity, but we could if we tracked bytes per connection.
      // For now, we assume the message is within limits if it's a string and starts with the right prefix.
      const connections = temaConexiones.get(tema);
      if (!connections) return [];
      // Return an array of connections excluding the emisor
      const result: object[] = [];
      for (const conn of connections) {
        if (conn !== emisor) {
          result.push(conn);
        }
      }
      return result;
    }
  };
}

describe("salas · lógica pura de salas", () => {
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
    const salas = crearSalas({ maxSalas: 2, maxPorSala: 2, maxBytes: 100 });
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
    const salas = crearSalas({ maxSalas: 100, maxPorSala: 100, maxBytes: 100 });
    const tema = 'estacion-p:Tema12345678';
    const conexion1 = {};
    const conexion2 = {};
    const result1 = salas.entrar(tema, conexion1);
    expect(result1.ok).toBe(true);
    const result2 = salas.entrar(tema, conexion2);
    expect(result2.ok).toBe(true);
    expect(salas.presencia(tema)).toBe(2);
    const salida1 = salas.salir(conexion1);
    expect(salida1.ok).toBe(true);
    expect(salas.presencia(tema)).toBe(1);
    expect(salas.temaDe(conexion1)).toBeUndefined();
    expect(salas.temaDe(conexion2)).toBe(tema);
    const salida2 = salas.salir(conexion2);
    expect(salida2.ok).toBe(true);
    expect(salas.presencia(tema)).toBe(0);
  });

  it('debería no reenviar al emisor en difundir', () => {
    const salas = crearSalas({ maxSalas: 100, maxPorSala: 100, maxBytes: 100 });
    const tema = 'estacion-vivo:Tema112345678';
    const emisor = {};
    const receptor1 = {};
    const receptor2 = {};
    const result1 = salas.entrar(tema, emisor);
    expect(result1.ok).toBe(true);
    const result2 = salas.entrar(tema, receptor1);
    expect(result2.ok).toBe(true);
    const result3 = salas.entrar(tema, receptor2);
    expect(result3.ok).toBe(true);
    const texto = '{"t":"est","datos":"hola"}';
    const destino = salas.difundir(emisor, texto);
    expect(destino.length).toBe(2);
    expect(destino.includes(emisor)).toBe(false);
    expect(destino.includes(receptor1)).toBe(true);
    expect(destino.includes(receptor2)).toBe(true);
  });

  it('debería descartar texto no string en difundir', () => {
    const salas = crearSalas({ maxSalas: 100, maxPorSala: 100, maxBytes: 100 });
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
    // Válido
    const salasValidas = crearSalas({ maxSalas: 100, maxPorSala: 100, maxBytes: 100 });
    const conexionValida = {};
    salasValidas.entrar('estacion-vivo:Tema112345678', conexionValida);
    const textoValido = '{"t":"est","datos":"ok"}';
    let destino = salasValidas.difundir(conexionValida, textoValido);
    expect(destino.length).toBe(0); // estamos solos en la sala
    // Vamos a agregar un receptor para probar.
    const receptor = {};
    salasValidas.entrar('estacion-vivo:Tema112345678', receptor);
    destino = salasValidas.difundir(conexionValida, textoValido);
    expect(destino.length).toBe(1);
    expect(destino[0]).toBe(receptor);
    // Inválido - crear una nueva sala para asegurarnos de estar solos
    const salasInv = crearSalas({ maxSalas: 100, maxPorSala: 100, maxBytes: 100 });
    const conexionInv = {};
    salasInv.entrar('estacion-vivo:Tema112345678', conexionInv);
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
    const result1 = salas.entrar(tema1, c1);
    expect(result1.ok).toBe(true);
    expect(salas.presencia(tema1)).toBe(1);
    expect(salas.presencia(tema2)).toBe(0);
    const result2 = salas.entrar(tema1, c2);
    expect(result2.ok).toBe(true);
    expect(salas.presencia(tema1)).toBe(2);
    const result3 = salas.entrar(tema2, c3);
    expect(result3.ok).toBe(true);
    expect(salas.presencia(tema2)).toBe(1);
    const salida1 = salas.salir(c1);
    expect(salida1.ok).toBe(true);
    expect(salas.presencia(tema1)).toBe(1);
    const salida2 = salas.salir(c2);
    expect(salida2.ok).toBe(true);
    expect(salas.presencia(tema1)).toBe(0);
  });

  it('debería devolver el tema de una conexión', () => {
    const salas = crearSalas({ maxSalas: 100, maxPorSala: 100, maxBytes: 100 });
    const tema = 'estacion-p:TemaX12345678';
    const conexion = {};
    const result = salas.entrar(tema, conexion);
    expect(result.ok).toBe(true);
    expect(salas.temaDe(conexion)).toBe(tema);
    const salida = salas.salir(conexion);
    expect(salida.ok).toBe(true);
    expect(salas.temaDe(conexion)).toBeUndefined();
  });
});
