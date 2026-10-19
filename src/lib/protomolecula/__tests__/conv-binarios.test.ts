import { describe, it, expect, beforeEach } from "vitest";
import {
  registrarConversor,
  limpiarConversores,
  rutaDeConversion,
  ejecutarRuta,
  type ResultadoEjecucion,
} from "../convertidores";
import { registrarConvertidoresBase } from "../convertidores-base";

// Función auxiliar para convertir base64 a Uint8Array
function base64ToUint8Array(base64: string): Uint8Array {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) {
    bytes[i] = binario.charCodeAt(i);
  }
  return bytes;
}

// Función auxiliar para extraer el contenido base64 de un data URI
function extraerBase64(dataUri: string): string {
  // Asumimos formato: "data:application/octet-stream;base64,...."
  const matches = dataUri.match(/^data:application\/octet-stream;base64,(.*)$/);
  if (!matches) {
    throw new Error("No es un data URI de base64 esperado");
  }
  return matches[1];
}

describe("CONVERSORES_BINARIOS", () => {
  beforeEach(() => {
    limpiarConversores();
    registrarConvertidoresBase();
  });

  describe("pcm→wav", () => {
    it("existe la ruta de conversión", () => {
      const ruta = rutaDeConversion("pcm", "wav");
      expect(ruta).not.toBeNull();
      expect(ruta?.pasos).toHaveLength(1);
      expect(ruta?.pasos[0].nombre).toBe("pcm-a-wav");
    });

    it("codifica correctamente un PCM sencillo (un sample, 1 canal, 44100 Hz)", () => {
      // Un sample: 0.0 -> debería codificarse a 0 en PCM 16-bit little endian
      const pcm = new Float32Array([0.0]);
      // Convertimos a Uint8Array little-endian del Float32
      const entrada = new Uint8Array(pcm.buffer);
      const opciones = { frecuencia: 44100, canales: 1 };
      const resultado = ejecutarRuta(
        rutaDeConversion("pcm", "wav") as NonNullable<typeof ruta>,
        entrada,
        opciones
      ) as ResultadoEjecucion;
      expect(resultado.ok).toBe(true);
      const wav = resultado.salida as Uint8Array;
      // WAV header: 44 bytes
      expect(wav.length).toBe(44 + 2 * 1 * 1); // 44 header + 2 bytes por sample * canales * samples
      // Cabecera RIFF
      expect(wav[0]).toBe(0x52); // 'R'
      expect(wav[1]).toBe(0x49); // 'I'
      expect(wav[2]).toBe(0x46); // 'F'
      expect(wav[3]).toBe(0x46); // 'F'
      // Tamaño total - 8
      let tamanoTotal = wav[4] | (wav[5] << 8) | (wav[6] << 16) | (wav[7] << 24);
      expect(tamanoTotal).toBe(wav.length - 8);
      // WAVE
      expect(wav[8]).toBe(0x57); // 'W'
      expect(wav[9]).toBe(0x41); // 'A'
      expect(wav[10]).toBe(0x45); // 'E'
      expect(wav[11]).toBe(0x46); // 'F'
      // fmt chunk
      expect(wav[12]).toBe(0x66); // 'f'
      expect(wav[13]).toBe(0x6D); // 'm'
      expect(wav[14]).toBe(0x74); // 't'
      expect(wav[15]).toBe(0x20); // ' '
      // Tamaño del chunk fmt (16 para PCM)
      expect(wav[16]).toBe(0x10);
      expect(wav[17]).toBe(0x00);
      expect(wav[18]).toBe(0x00);
      expect(wav[19]).toBe(0x00);
      // Formato (1 = PCM)
      expect(wav[20]).toBe(0x01);
      expect(wav[21]).toBe(0x00);
      // Canales
      expect(wav[22]).toBe(0x01);
      expect(wav[23]).toBe(0x00);
      // Frecuencia
      expect(wav[24]).toBe(44100 & 0xff);
      expect(wav[25]).toBe((44100 >> 8) & 0xff);
      expect(wav[26]).toBe((44100 >> 16) & 0xff);
      expect(wav[27]).toBe((44100 >> 24) & 0xff);
      // Bytes por segundo = frecuencia * canales * 2
      const bytesPorSegundo = 44100 * 1 * 2;
      expect(wav[28]).toBe(bytesPorSegundo & 0xff);
      expect(wav[29]).toBe((bytesPorSegundo >> 8) & 0xff);
      expect(wav[30]).toBe((bytesPorSegundo >> 16) & 0xff);
      expect(wav[31]).toBe((bytesPorSegundo >> 24) & 0xff);
      // Bloque de alineación = canales * 2
      expect(wav[32]).toBe(0x02);
      expect(wav[33]).toBe(0x00);
      // Bits por muestra
      expect(wav[34]).toBe(0x10);
      expect(wav[35]).toBe(0x00);
      // data chunk
      expect(wav[36]).toBe(0x64); // 'd'
      expect(wav[37]).toBe(0x61); // 'a'
      expect(wav[38]).toBe(0x74); // 't'
      expect(wav[39]).toBe(0x61); // 'a'
      // Tamaño del data
      let tamanoData = wav[40] | (wav[41] << 8) | (wav[42] << 16) | (wav[43] << 24);
      expect(tamanoData).toBe(2); // 1 sample * 1 canal * 2 bytes
      // Dato: sample 0.0 -> 0 en signed 16-bit little endian
      expect(wav[44]).toBe(0x00);
      expect(wav[45]).toBe(0x00);
    });

    it("satura valores fuera de [-1, 1]", () => {
      // Valor 1.5 debería saturarse a 32767 (0x7FFF)
      const pcm = new Float32Array([1.5]);
      const entrada = new Uint8Array(pcm.buffer);
      const opciones = { frecuencia: 44100, canales: 1 };
      const resultado = ejecutarRuta(
        rutaDeConversion("pcm", "wav") as NonNullable<typeof ruta>,
        entrada,
        opciones
      ) as ResultadoEjecucion;
      expect(resultado.ok).toBe(true);
      const wav = resultado.salida as Uint8Array;
      // El dato debería ser 0xFF 0x7F (little endian: 0x7FFF)
      expect(wav[44]).toBe(0xFF);
      expect(wav[45]).toBe(0x7F);
      // Valor -1.5 debería saturarse a -32768 (0x8000)
      const pcm2 = new Float32Array([-1.5]);
      const entrada2 = new Uint8Array(pcm2.buffer);
      const resultado2 = ejecutarRuta(
        rutaDeConversion("pcm", "wav") as NonNullable<typeof ruta>,
        entrada2,
        opciones
      ) as ResultadoEjecucion;
      expect(resultado2.ok).toBe(true);
      const wav2 = resultado2.salida as Uint8Array;
      expect(wav2[44]).toBe(0x00);
      expect(wav2[45]).toBe(0x80);
    });

    it("rechaza longitud no múltiplo de 4 bytes", () => {
      // 1 byte (no múltiplo de 4)
      const entrada = new Uint8Array([0x00]);
      const opciones = { frecuencia: 44100, canales: 1 };
      const resultado = ejecutarRuta(
        rutaDeConversion("pcm", "wav") as NonNullable<typeof ruta>,
        entrada,
        opciones
      ) as ResultadoEjecucion;
      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.motivo).toContain("Longitud de PCM inválida");
      }
      // 2 bytes
      const entrada2 = new Uint8Array([0x00, 0x00]);
      const resultado2 = ejecutarRuta(
        rutaDeConversion("pcm", "wav") as NonNullable<typeof ruta>,
        entrada2,
        opciones
      ) as ResultadoEjecucion;
      expect(resultado2.ok).toBe(false);
      if (!resultado2.ok) {
        expect(resultado2.motivo).toContain("Longitud de PCM inválida");
      }
      // 3 bytes
      const entrada3 = new Uint8Array([0x00, 0x00, 0x00]);
      const resultado3 = ejecutarRuta(
        rutaDeConversion("pcm", "wav") as NonNullable<typeof ruta>,
        entrada3,
        opciones
      ) as ResultadoEjecucion;
      expect(resultado3.ok).toBe(false);
      if (!resultado3.ok) {
        expect(resultado3.motivo).toContain("Longitud de PCM inválida");
      }
    });
  });

  describe("obj→gltf", () => {
    it("existe la ruta de conversión", () => {
      const ruta = rutaDeConversion("obj", "gltf");
      expect(ruta).not.toBeNull();
      expect(ruta?.pasos).toHaveLength(1);
      expect(ruta?.pasos[0].nombre).toBe("obj-a-gltf");
    });

    it("convierte un triángulo simple (sin normales)", () => {
      const obj = `
v 0.0 0.0 0.0
v 1.0 0.0 0.0
v 0.0 1.0 0.0
f 1 2 3
`.trim();
      const resultado = ejecutarRuta(
        rutaDeConversion("obj", "gltf") as NonNullable<typeof ruta>,
        obj
      ) as ResultadoEjecucion;
      expect(resultado.ok).toBe(true);
      const gltfJsonStr = resultado.salida as string;
      const gltf = JSON.parse(gltfJsonStr);
      // Debe tener un buffer y un acceso
      expect(gltf.buffers).toHaveLength(1);
      expect(gltf.bufferViews).toHaveLength(1);
      expect(gltf.accessors).toHaveLength(1);
      // El acceso debe ser de tipo VEC3 (3 componentes) y 3 vértices
      const accessor = gltf.accessors[0];
      expect(accessor.type).toBe("VEC3");
      expect(accessor.count).toBe(3);
      // El bufferView debe apuntar al buffer y tener byteLength = 3 * 3 * 4 (float32)
      const bufferView = gltf.bufferViews[0];
      expect(bufferView.buffer).toBe(0);
      expect(bufferView.byteLength).toBe(3 * 3 * 4); // 3 vértices * 3 componentes * 4 bytes
      // El buffer debe estar en base64 y ser decodificable
      const buffer = gltf.buffers[0];
      expect(buffer.uri).toMatch(/^data:application\/octet-stream;base64,/);
      const base64 = extraerBase64(buffer.uri);
      const datos = base64ToUint8Array(base64);
      // 3 vértices * 3 componentes * 4 bytes = 36 bytes
      expect(datos.length).toBe(36);
      // Verificar que los vértices están en little endian float32
      // Vértice 0: 0,0,0 -> 0x00000000 x3
      expect(datos[0]).toBe(0x00);
      expect(datos[1]).toBe(0x00);
      expect(datos[2]).toBe(0x00);
      expect(datos[3]).toBe(0x00);
      // Vértice 1: 1,0,0 -> 0x00000000 0x00000000 0x80?3f
      // Little endian: bytes 4-7: 0x00 0x00 0x00 0x3F (para 1.0)
      expect(datos[4]).toBe(0x00);
      expect(datos[5]).toBe(0x00);
      expect(datos[6]).toBe(0x00);
      expect(datos[7]).toBe(0x3F);
      // Vértice 2: 0,1,0 -> bytes 8-11: 0x00 0x00 0x80?3f 0x00
      expect(datos[8]).toBe(0x00);
      expect(datos[9]).toBe(0x00);
      expect(datos[10]).toBe(0x00);
      expect(datos[11]).toBe(0x3F);
    });

    it("convierte un cuadrado (dos triángulos) y calcula min/max correctamente", () => {
      const obj = `
v -1.0 -1.0 0.0
v  1.0 -1.0 0.0
v -1.0  1.0 0.0
v  1.0  1.0 0.0
f 1 2 3
f 2 4 3
`.trim();
      const resultado = ejecutarRuta(
        rutaDeConversion("obj", "gltf") as NonNullable<typeof ruta>,
        obj
      ) as ResultadoEjecucion;
      expect(resultado.ok).toBe(true);
      const gltf = JSON.parse(resultado.salida as string);
      const accessor = gltf.accessors[0];
      // El accessor debe tener min y max
      expect(accessor.min).toHaveLength(3);
      expect(accessor.max).toHaveLength(3);
      // Min: [-1, -1, 0], Max: [1, 1, 0]
      expect(accessor.min[0]).toBeCloseTo(-1.0);
      expect(accessor.min[1]).toBeCloseTo(-1.0);
      expect(accessor.min[2]).toBeCloseTo(0.0);
      expect(accessor.max[0]).toBeCloseTo(1.0);
      expect(accessor.max[1]).toBeCloseTo(1.0);
      expect(accessor.max[2]).toBeCloseTo(0.0);
    });

    it("maneja índices negativos (relativos)", () => {
      const obj = `
v 0.0 0.0 0.0
v 1.0 0.0 0.0
v 0.0 1.0 0.0
f -3 -2 -1
`.trim();
      const resultado = ejecutarRuta(
        rutaDeConversion("obj", "gltf") as NonNullable<typeof ruta>,
        obj
      ) as ResultadoEjecucion;
      expect(resultado.ok).toBe(true);
      const gltf = JSON.parse(resultado.salida as string);
      // Debe haber tres vértices en el accessor
      const accessor = gltf.accessors[0];
      expect(accessor.count).toBe(3);
      // Los vértices deben ser los mismos que en el triángulo simple pero en orden inverso?
      // El índice -3 es el primer vértice (0,0,0), -2 es el segundo (1,0,0), -1 es el tercero (0,1,0)
      // Entonces el triángulo es (0,0,0), (1,0,0), (0,1,0) -> mismo que antes
      // Verificamos el primer vértice del accessor (debería ser 0,0,0)
      const bufferView = gltf.bufferViews[0];
      const buffer = gltf.buffers[0];
      const base64 = extraerBase64(buffer.uri);
      const datos = base64ToUint8Array(base64);
      // Primer vértice: bytes 0-3
      expect(datos[0]).toBe(0x00);
      expect(datos[1]).toBe(0x00);
      expect(datos[2]).toBe(0x00);
      expect(datos[3]).toBe(0x00);
    });

    it("ignora vt y solo usa v y vn cuando se presentan como v//vn", () => {
      const obj = `
v 0.0 0.0 0.0
v 1.0 0.0 0.0
v 0.0 1.0 0.0
vt 0.0 0.0
vt 1.0 0.0
vt 0.0 1.0
vn 0.0 0.0 1.0
vn 0.0 0.0 1.0
vn 0.0 0.0 1.0
f 1//1 2//2 3//3
`.trim();
      const resultado = ejecutarRuta(
        rutaDeConversion("obj", "gltf") as NonNullable<typeof ruta>,
        obj
      ) as ResultadoEjecucion;
      expect(resultado.ok).toBe(true);
      // Debemos tener un accessor para posiciones (vértices)
      const gltf = JSON.parse(resultado.salida as string);
      // El acceso 0 debería ser posiciones (vértices)
      const accessorPos = gltf.accessors[0];
      expect(accessorPos.count).toBe(3);
      // También podríamos tener un accessor para normales si las soportamos, pero la tarea dice que solo soportamos posiciones e índices si no cabe en 120 líneas.
      // Sin embargo, vamos a intentar soportar normales si podemos, pero si no, al menos que las posiciones estén correctas.
      // Verificamos que las posiciones sean correctas
      const bufferView = gltf.bufferViews[0];
      const buffer = gltf.buffers[0];
      const base64 = extraerBase64(buffer.uri);
      const datos = base64ToUint8Array(base64);
      // Primer vértice: 0,0,0
      expect(datos[0]).toBe(0x00);
      expect(datos[1]).toBe(0x00);
      expect(datos[2]).toBe(0x00);
      expect(datos[3]).toBe(0x00);
    });
  });

  describe("registrarConvertidoresBase es idempotente", () => {
    it("llamar múltiples veces no duplica los conversores", () => {
      limpiarConversores();
      registrarConvertidoresBase();
      const inicial = listarConversores().length;
      registrarConvertidoresBase();
      const despues = listarConversores().length;
      expect(despues).toBe(inicial);
    });
  });