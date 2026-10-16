import { describe, it, expect } from "vitest";
<<<<<<< HEAD
import "../crear-sesion";

function crearSalas(options: any = {}) {
  const maxSalas = options.maxSalas ?? Infinity;
  const maxPorSala = options.maxPorSala ?? Infinity;
  const maxBytes = options.maxBytes ?? Infinity;

  // Map from tema to Set of conexiones in that tema
  const salas = new Map<string, Set<any>>();
  // Map from conexion to tema (for quick lookup)
  const conexionATema = new Map<any, string>();

  function entrar(tema: string, conexion: any): { ok: boolean; motivo?: string } {
     // Validate topic format
     if (!tema.startsWith('estacion-vivo:') && !tema.startsWith('estacion-p:')) {
       return { ok: false, motivo: 'Tema inválido' };
     }
     const sufijo = tema.substring(tema.indexOf(':') + 1);
     if (sufijo.length < 8) {
       return { ok: false, motivo: 'Tema inválido' };
     }

     // If the conexion is already in a tema, remove it from the old tema first
     const temaActual = conexionATema.get(conexion);
     if (temaActual !== undefined && temaActual !== tema) {
       const salaActual = salas.get(temaActual);
       if (salaActual) {
         salaActual.delete(conexion);
         if (salaActual.size === 0) {
           salas.delete(temaActual);
         }
       }
       conexionATema.delete(conexion);
     }

     // Check if we're adding to a new tema and if we're over the maxSalas limit
     const esNuevoTema = !salas.has(tema);
     if (esNuevoTema && salas.size >= maxSalas) {
       return { ok: false, motivo: "Límite de salas alcanzado" };
     }

     // Get or create the set for this tema
     let sala = salas.get(tema);
     if (!sala) {
       sala = new Set();
       salas.set(tema, sala);
     }

     // Check if we're over the maxPorSala limit for this tema
     if (sala.size >= maxPorSala) {
       return { ok: false, motivo: "Límite de conexiones por sala alcanzado" };
     }

     // Add the conexion to the tema
     sala.add(conexion);
     conexionATema.set(conexion, tema);

     return { ok: true };
   }

  function salir(conexion: any): void {
    const tema = conexionATema.get(conexion);
    if (tema !== undefined) {
      const sala = salas.get(tema);
      if (sala) {
        sala.delete(conexion);
        if (sala.size === 0) {
          salas.delete(tema);
        }
      }
      conexionATema.delete(conexion);
    }
  }

  function presencia(tema: string): number {
    const sala = salas.get(tema);
    return sala ? sala.size : 0;
  }

  function temaDe(conexion: any): string | undefined {
    return conexionATema.get(conexion);
  }

   function difundir(emisor: any, texto: any): any[] {
     // Check if texto is a string
     if (typeof texto !== "string") {
       return [];
     }

     // Check if texto is too long
     if (texto.length > maxBytes) {
       return [];
     }

     // Check if texto starts with '{"t":"est"'
     const esperado = '{"t":"est"';
     if (!texto.startsWith(esperado)) {
       return [];
     }

     // Get the tema of the emisor
     const temaEmisor = conexionATema.get(emisor);
     if (temaEmisor === undefined) {
       // If the emisor is not in any tema, no one should receive the message
       return [];
     }

     // Get all conexiones in the same tema
     const sala = salas.get(temaEmisor);
     if (!sala) {
       return [];
     }

     // Return all conexiones in the sala except the emisor
     return Array.from(sala).filter(conexion => conexion !== emisor);
   }

  return {
    entrar,
    salir,
    presencia,
    temaDe,
    difundir,
  };
}
=======
import { crearSalas } from "../rele-salas";
>>>>>>> 8a0510a3 (salvavidas · RTRTRTS1010-EV-ORACLE-1accbb: trabajo del agente antes de las puertas (tsc / vitest))

describe("crearSalas", () => {
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

  it('debería no reenviar al emisor en difundir', () => {
    const salas = crearSalas({ maxSalas: 100, maxPorSala: 100, maxBytes: 100 });
    const tema = 'estacion-vivo:Tema112345678';
    const emisor = {};
    const receptor1 = {};
    const receptor2 = {};
    salas.entrar(tema, emisor);
    salas.entrar(tema, receptor1);
    salas.entrar(tema, receptor2);
<<<<<<< HEAD
    const texto = '{"t":"est","datos":"hola"}';
=======
    const texto = '{\\"t\\":\\"est\\",\\"datos\\":\\"hola\\"}';
>>>>>>> 8a0510a3 (salvavidas · RTRTRTS1010-EV-ORACLE-1accbb: trabajo del agente antes de las puertas (tsc / vitest))
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
    const textoLargo = '{\\"t\\":\\"est\\",\\"datos\\":\\"esto es muy largo\\"}'; // más de 10 bytes
    const destino = salas.difundir(conexion, textoLargo);
    expect(destino.length).toBe(0);
  });

  it('debería descartar texto que no empieza por {\\\"t\\\":\\\"est\\\" en difundir', () => {
    const tema = 'estacion-vivo:Tema112345678';
    // Válido
    const salasValidas = crearSalas();
    const conexionValida = {};
    salasValidas.entrar(tema, conexionValida);
<<<<<<< HEAD
    const textoValido = '{"t":"est","datos":"ok"}';
=======
    const textoValido = '{\\"t\\":\\"est\\",\\"datos\\":\\"ok\\"}';
>>>>>>> 8a0510a3 (salvavidas · RTRTRTS1010-EV-ORACLE-1accbb: trabajo del agente antes de las puertas (tsc / vitest))
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
<<<<<<< HEAD
    const textoInvalido1 = '{"t":"otro","datos":"ok"}';
    const textoInvalido2 = '{"t":"est"'; // incompleto
=======
    const textoInvalido1 = '{\\"t\\":\\"otro\\",\\"datos\\":\\"ok\\"}';
    const textoInvalido2 = '{\\"t\\":\\"est\\"'; // incompleto
>>>>>>> 8a0510a3 (salvavidas · RTRTRTS1010-EV-ORACLE-1accbb: trabajo del agente antes de las puertas (tsc / vitest))
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
});