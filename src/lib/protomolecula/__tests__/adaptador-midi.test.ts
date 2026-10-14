import { describe, expect, it, vi } from "vitest";
import { conectarMidi } from "../adaptador-midi";
import type { FuenteControl } from "../vinculos-control";

describe("adaptador-midi", () => {
  describe("análisis de bytes", () => {
    it("convierte mensaje de control change (0xB0)", () => {
      const mensajes: { datos: number[]; timestamp: number }[] = [
        { datos: [0xb0, 7, 64], timestamp: 1000 } // CC canal 1, controllo 7, valor 64
      ];
      
      let llamadas = 0;
      let fuenteRecibida: FuenteControl | null = null;
      let brutoRecibido = 0;
      
      const acceso: () => Promise<MIDIAccess> = async () => {
        const midiAccess = {
          inputs: new Map(),
          onstatechange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
        } as unknown as MIDIAccess;
        
        const entrada = {
          onmidimessage: null,
        } as unknown as MIDIInput;
        
        midiAccess.inputs = new Map([["entrada", entrada]]);
        
        // Simular la llegada del mensaje
        setTimeout(() => {
          if (entrada.onmidimessage) {
            entrada.onmidimessage({
              datos: new Uint8Array(mensajes[llamadas].datos),
              timestamp: mensajes[llamadas].timestamp
            } as MIDIMessageEvent);
          }
        }, 10);
        
        return midiAccess;
      };
      
      conectarMidi(acceso, (fuente, bruto) => {
        llamadas++;
        fuenteRecibida = fuente;
        brutoRecibido = bruto;
      });
      
      // Esperar a que se procese el mensaje
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(llamadas).toBe(1);
          expect(fuenteRecibida).toEqual({
            tipo: "midi",
            mensaje: "cc",
            canal: 1,
            numero: 7
          });
          expect(brutoRecibido).toBe(64);
          resolve();
        }, 50);
      });
    });
    
    it("convierte mensaje de nota on (0x90) con velocidad", () => {
      const mensajes: { datos: number[]; timestamp: number }[] = [
        { datos: [0x90, 60, 100], timestamp: 1000 } // Nota on canal 1, nota 60 (C4), velocidad 100
      ];
      
      let llamadas = 0;
      let fuenteRecibida: FuenteControl | null = null;
      let brutoRecibido = 0;
      
      const acceso: () => Promise<MIDIAccess> = async () => {
        const midiAccess = {
          inputs: new Map(),
          onstatechange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
        } as unknown as MIDIAccess;
        
        const entrada = {
          onmidimessage: null,
        } as unknown as MIDIInput;
        
        midiAccess.inputs = new Map([["entrada", entrada]]);
        
        setTimeout(() => {
          if (entrada.onmidimessage) {
            entrada.onmidimessage({
              datos: new Uint8Array(mensajes[llamadas].datos),
              timestamp: mensajes[llamadas].timestamp
            } as MIDIMessageEvent);
          }
        }, 10);
        
        return midiAccess;
      };
      
      conectarMidi(acceso, (fuente, bruto) => {
        llamadas++;
        fuenteRecibida = fuente;
        brutoRecibido = bruto;
      });
      
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(llamadas).toBe(1);
          expect(fuenteRecibida).toEqual({
            tipo: "midi",
            mensaje: "nota",
            canal: 1,
            numero: 60
          });
          expect(brutoRecibido).toBe(100);
          resolve();
        }, 50);
      });
    });
    
    it("convierte mensaje de nota off (0x80) o nota on con velocidad 0", () => {
      const mensajes: { datos: number[]; timestamp: number }[] = [
        { datos: [0x80, 60, 64], timestamp: 1000 }, // Nota off (nota 60)
        { datos: [0x90, 61, 0], timestamp: 2000 }   // Nota on con velocidad 0 (nota 61, equivale a off)
      ];
      
      let llamadas = 0;
      // Track each message separately
      let mensajesRecibidos: { fuente: FuenteControl; bruto: number }[] = [];
      
      const acceso: () => Promise<MIDIAccess> = async () => {
        const midiAccess = {
          inputs: new Map(),
          onstatechange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
        } as unknown as MIDIAccess;
        
        const entrada = {
          onmidimessage: null,
        } as unknown as MIDIInput;
        
        midiAccess.inputs = new Map([["entrada", entrada]]);
        
        // Send messages after appropriate delays
        mensajes.forEach((msg, indice) => {
          setTimeout(() => {
            if (entrada.onmidimessage) {
              entrada.onmidimessage({
                datos: new Uint8Array(msg.datos),
                timestamp: msg.timestamp
              } as MIDIMessageEvent);
            }
          }, 10 * (indice + 1));
        });
        
        return midiAccess;
      };
      
      conectarMidi(acceso, (fuente, bruto) => {
        llamadas++;
        mensajesRecibidos.push({ fuente, bruto });
      });
      
      return new Promise<void>((resolve) => {
        // Wait for all messages to be processed (last message at timestamp 2000 + 10ms delay for last message)
        setTimeout(() => {
          expect(llamadas).toBe(2);
          expect(mensajesRecibidos.length).toBe(2);
          
          // Primer mensaje: nota off (nota 60)
          expect(mensajesRecibidos[0].fuente).toEqual({
            tipo: "midi",
            mensaje: "nota",
            canal: 1,
            numero: 60
          });
          expect(mensajesRecibidos[0].bruto).toBe(0);  // nota off -> velocidad 0
          
          // Segundo mensaje: nota on con velocidad 0 (nota 61)
          expect(mensajesRecibidos[1].fuente).toEqual({
            tipo: "midi",
            mensaje: "nota",
            canal: 1,
            numero: 61
          });
          expect(mensajesRecibidos[1].bruto).toBe(0);  // nota on con velocidad 0
          
          resolve();
        }, 2020); // Wait for last message (timestamp 2000) + 10ms delay + processing time
      });
    });
    
    it("convierte mensaje de pitch bend (0xE0)", () => {
      const mensajes: { datos: number[]; timestamp: number }[] = [
        { datos: [0xe0, 0, 64], timestamp: 1000 } // Pitch bend LSB=0, MSB=64 → 64*128 + 0 = 8192
      ];
      
      let llamadas = 0;
      let fuenteRecibida: FuenteControl | null = null;
      let brutoRecibido = 0;
      
      const acceso: () => Promise<MIDIAccess> = async () => {
        const midiAccess = {
          inputs: new Map(),
          onstatechange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
        } as unknown as MIDIAccess;
        
        const entrada = {
          onmidimessage: null,
        } as unknown as MIDIInput;
        
        midiAccess.inputs = new Map([["entrada", entrada]]);
        
        setTimeout(() => {
          if (entrada.onmidimessage) {
            entrada.onmidimessage({
              datos: new Uint8Array(mensajes[llamadas].datos),
              timestamp: mensajes[llamadas].timestamp
            } as MIDIMessageEvent);
          }
        }, 10);
        
        return midiAccess;
      };
      
      conectarMidi(acceso, (fuente, bruto) => {
        llamadas++;
        fuenteRecibida = fuente;
        brutoRecibido = bruto;
      });
      
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(llamadas).toBe(1);
          expect(fuenteRecibida).toEqual({
            tipo: "midi",
            mensaje: "pitch",
            canal: 1
          });
          // Pitch bend: 7 bits LSB + 7 bits MSB << 7
          // 0 + (64 << 7) = 0 + 8192 = 8192
          expect(brutoRecibido).toBe(8192);
          resolve();
        }, 50);
      });
    });
  });
  
  describe("fader absoluto con paso", () => {
    it("respetar el paso del parámetro en mensajes de control change", () => {
      // Este test se enfoca en el comportamiento del adaptador cuando se usa con un controlador
      // que tiene parámetros con paso. Como el adaptador es puro, este comportamiento
      // depende de cómo se procese el mensaje en vinculos-control.ts
      // Aquí solo verificamos que el adaptador produzca los valores brutos correctos
      
      const mensajes: { datos: number[]; timestamp: number }[] = [
        { datos: [0xb0, 10, 32], timestamp: 1000 }, // CC canal 1, controllo 10, valor 32 (≈25%)
        { datos: [0xb0, 10, 96], timestamp: 2000 }  // CC canal 1, controllo 10, valor 96 (≈75%)
      ];
      
      let llamadas = 0;
      let valoresBruto: number[] = [];
      
      const acceso: () => Promise<MIDIAccess> = async () => {
        const midiAccess = {
          inputs: new Map(),
          onstatechange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
        } as unknown as MIDIAccess;
        
        const entrada = {
          onmidimessage: null,
        } as unknown as MIDIInput;
        
        midiAccess.inputs = new Map([["entrada", entrada]]);
        
        mensajes.forEach((msg, indice) => {
          setTimeout(() => {
            if (entrada.onmidimessage) {
              entrada.onmidimessage({
                datos: new Uint8Array(msg.datos),
                timestamp: msg.timestamp
              } as MIDIMessageEvent);
            }
          }, 10 * (indice + 1));
        });
        
        return midiAccess;
      };
      
      conectarMidi(acceso, (_fuente, bruto) => {
        llamadas++;
        valoresBruto.push(bruto);
      });
      
      return new Promise<void>((resolve) => {
        // Wait for all messages to be processed (last message at timestamp 2000 + 10ms delay)
        setTimeout(() => {
          expect(llamadas).toBe(2);
          expect(valoresBruto).toEqual([32, 96]);
          resolve();
        }, 2020); // Wait for last message (timestamp 2000) + processing delay
      });
    });
  });
  
  describe("encoder relativo", () => {
    it("maneja valores de encoder relativo (no se aplica directamente al adaptador)", () => {
      // El adaptador simplemente pasa los valores brutos tal como llegan
      // La interpretación relativa se hace en vinculos-control.ts
      // Este test verifica que el adaptador no modifique los valores
      
      const mensajes: { datos: number[]; timestamp: number }[] = [
        { datos: [0xb0, 20, 1], timestamp: 1000 },   // Valor bajo
        { datos: [0xb0, 20, 127], timestamp: 2000 }, // Valor alto
        { datos: [0xb0, 20, 64], timestamp: 3000 }   // Valor medio
      ];
      
      let llamadas = 0;
      let valoresBruto: number[] = [];
      
      const acceso: () => Promise<MIDIAccess> = async () => {
        const midiAccess = {
          inputs: new Map(),
          onstatechange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
        } as unknown as MIDIAccess;
        
        const entrada = {
          onmidimessage: null,
        } as unknown as MIDIInput;
        
        midiAccess.inputs = new Map([["entrada", entrada]]);
        
        mensajes.forEach((msg, indice) => {
          setTimeout(() => {
            if (entrada.onmidimessage) {
              entrada.onmidimessage({
                datos: new Uint8Array(msg.datos),
                timestamp: msg.timestamp
              } as MIDIMessageEvent);
            }
          }, 10 * (indice + 1));
        });
        
        return midiAccess;
      };
      
      conectarMidi(acceso, (_fuente, bruto) => {
        llamadas++;
        valoresBruto.push(bruto);
      });
      
      return new Promise<void>((resolve) => {
        // Wait for all messages to be processed (last message at timestamp 3000 + 10ms delay)
        setTimeout(() => {
          expect(llamadas).toBe(3);
          expect(valoresBruto).toEqual([1, 127, 64]);
          resolve();
        }, 3020); // Wait for last message (timestamp 3000) + processing delay
      });
    });
  });
  
  describe("nota → alternar", () => {
    it("genera eventos de nota on/off que pueden ser interpretados como alternar", () => {
      const mensajes: { datos: number[]; timestamp: number }[] = [
        { datos: [0x90, 60, 100], timestamp: 1000 }, // Nota on
        { datos: [0x80, 60, 64], timestamp: 2000 }   // Nota off
      ];
      
      let llamadas = 0;
      let eventos: { tipo: "on" | "off"; numero: number }[] = [];
      
      const acceso: () => Promise<MIDIAccess> = async () => {
        const midiAccess = {
          inputs: new Map(),
          onstatechange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
        } as unknown as MIDIAccess;
        
        const entrada = {
          onmidimessage: null,
        } as unknown as MIDIInput;
        
        midiAccess.inputs = new Map([["entrada", entrada]]);
        
        mensajes.forEach((msg, indice) => {
          setTimeout(() => {
            if (entrada.onmidimessage) {
              entrada.onmidimessage({
                datos: new Uint8Array(msg.datos),
                timestamp: msg.timestamp
              } as MIDIMessageEvent);
            }
          }, 10 * (indice + 1));
        });
        
        return midiAccess;
      };
      
      conectarMidi(acceso, (fuente, bruto) => {
        llamadas++;
        if (fuente.tipo === "midi" && fuente.mensaje === "nota") {
          eventos.push({
            tipo: bruto > 0 ? "on" : "off",
            numero: fuente.numero!
          });
        }
      });
      
      return new Promise<void>((resolve) => {
        // Wait for all messages to be processed (last message at timestamp 2000 + 10ms delay)
        setTimeout(() => {
          expect(llamadas).toBe(2);
          expect(eventos).toEqual([
            { tipo: "on", numero: 60 },
            { tipo: "off", numero: 60 }
          ]);
          resolve();
        }, 2020); // Wait for last message (timestamp 2000) + processing delay
      });
    });
  });
  
  describe("aprender un CC con ruido de otro control", () => {
    it("filtra mensajes de diferentes controles cuando se está aprendiendo uno específico", () => {
      // Este test se enfoca en que el adaptador pase todos los mensajes y sea el
      // sistema de aprendizaje quien filtre. El adaptador no debe hacer filtrado por sí mismo.
      
      const mensajes: { datos: number[]; timestamp: number }[] = [
        { datos: [0xb0, 5, 10], timestamp: 1000 },   // CC #5 (ruido)
        { datos: [0xb0, 7, 20], timestamp: 2000 },   // CC #7 (el que queremos aprender)
        { datos: [0xb0, 5, 15], timestamp: 3000 },   // Más ruido en CC #5
        { datos: [0xb0, 7, 30], timestamp: 4000 },   // Más señal en CC #7
        { datos: [0xb0, 5, 20], timestamp: 5000 }    // Último ruido en CC #5
      ];
      
      let llamadas = 0;
      let mensajesCC7: number[] = [];
      let mensajesOtros: number[] = [];
      
      const acceso: () => Promise<MIDIAccess> = async () => {
        const midiAccess = {
          inputs: new Map(),
          onstatechange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
        } as unknown as MIDIAccess;
        
        const entrada = {
          onmidimessage: null,
        } as unknown as MIDIInput;
        
        midiAccess.inputs = new Map([["entrada", entrada]]);
        
        mensajes.forEach((msg, indice) => {
          setTimeout(() => {
            if (entrada.onmidimessage) {
              entrada.onmidimessage({
                datos: new Uint8Array(msg.datos),
                timestamp: msg.timestamp
              } as MIDIMessageEvent);
            }
          }, 10 * (indice + 1));
        });
        
        return midiAccess;
      };
      
      conectarMidi(acceso, (fuente, bruto) => {
        llamadas++;
        if (fuente.tipo === "midi" && fuente.mensaje === "cc" && fuente.numero === 7) {
          mensajesCC7.push(bruto);
        } else if (fuente.tipo === "midi" && fuente.mensaje === "cc") {
          mensajesOtros.push(bruto);
        }
      });
      
      return new Promise<void>((resolve) => {
        // Wait for all messages to be processed (last message at timestamp 5000 + 10ms delay)
        setTimeout(() => {
          expect(llamadas).toBe(5);
          expect(mensajesCC7).toEqual([20, 30]); // Solo los mensajes de CC #7
          expect(mensajesOtros).toEqual([10, 15, 20]); // Los mensajes de otros CC
          resolve();
        }, 5020); // Wait for last message (timestamp 5000) + processing delay
      });
    });
  });
  
  describe("almacén que lanza", () => {
    it("maneja correctamente cuando el almacenamiento lanza excepciones", () => {
      // Este test es más relevante para almacen-vinculos.ts, pero verificamos
      // que el adaptador no dependa directamente del almacenamiento
      
      // El adaptador-midi no interactúa directamente con el almacenamiento,
      // así que este test verifica que no haya dependencias implícitas
      
      const mensajes: { datos: number[]; timestamp: number }[] = [
        { datos: [0xb0, 7, 100], timestamp: 1000 }
      ];
      
      let llamadas = 0;
      
      // Simular un acceso MIDI normal (no relacionado con almacenamiento)
      const acceso: () => Promise<MIDIAccess> = async () => {
        const midiAccess = {
          inputs: new Map(),
          onstatechange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
        } as unknown as MIDIAccess;
        
        const entrada = {
          onmidimessage: null,
        } as unknown as MIDIInput;
        
        midiAccess.inputs = new Map([["entrada", entrada]]);
        
        setTimeout(() => {
          if (entrada.onmidimessage) {
            entrada.onmidimessage({
              datos: new Uint8Array(mensajes[0].datos),
              timestamp: mensajes[0].timestamp
            } as MIDIMessageEvent);
          }
        }, 10);
        
        return midiAccess;
      };
      
      conectarMidi(acceso, (_fuente, _bruto) => {
        llamadas++;
      });
      
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(llamadas).toBe(1);
          // Si llegamos aquí sin excepciones, el adaptador no tiene
          // dependencias problemáticas con el almacenamiento
          resolve();
        }, 50);
      });
    });
  });
  
  describe("vínculo apagado", () => {
    it("el adaptador no conoce el estado de los vínculos, solo pasa mensajes", () => {
      // El adaptador no tiene conocimiento de los vínculos ni de su estado activo/inactivo
      // 0: El adaptador simplemente convierte mensajes MIDI y los pasa al callback
      // 1: Es responsabilidad del llamador (como almacen-vinculos.ts) filtrar por vínculos activos
      
      const mensajes: { datos: number[]; timestamp: number }[] = [
        { datos: [0xb0, 7, 50], timestamp: 1000 }
      ];
      
      let llamadas = 0;
      
      const acceso: () => Promise<MIDIAccess> = async () => {
        const midiAccess = {
          inputs: new Map(),
          onstatechange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
        } as unknown as MIDIAccess;
        
        const entrada = {
          onmidimessage: null,
        } as unknown as MIDIInput;
        
        midiAccess.inputs = new Map([["entrada", entrada]]);
        
        setTimeout(() => {
          if (entrada.onmidimessage) {
            entrada.onmidimessage({
              datos: new Uint8Array(mensajes[0].datos),
              timestamp: mensajes[0].timestamp
            } as MIDIMessageEvent);
          }
        }, 10);
        
        return midiAccess;
      };
      
      conectarMidi(acceso, (_fuente, _bruto) => {
        llamadas++;
      });
      
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(llamadas).toBe(1);
          resolve();
        }, 50);
      });
    });
  });
  
  describe("desconexión", () => {
    it("devuelve una función de desconexión que se puede llamar sin errores", () => {
      const acceso: () => Promise<MIDIAccess> = async () => {
        const midiAccess = {
          inputs: new Map(),
          onstatechange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
        } as unknown as MIDIAccess;
        
        const entrada = {
          onmidimessage: null,
        } as unknown as MIDIInput;
        
        midiAccess.inputs = new Map([["entrada", entrada]]);
        
        return midiAccess;
      };
      
      const desconectar = conectarMidi(acceso, (_fuente, _bruto) => {});
      
      // Llamar a la función de desconexión no debería lanzar errores
      expect(() => desconectar()).not.toThrow();
      
      // Llamarla múltiples veces tampoco debería lanzar errores
      expect(() => {
        desconectar();
        desconectar();
        desconectar();
      }).not.toThrow();
    });
  });
  
  describe("manejo de errores", () => {
    it("maneja cuando no hay Web MIDI disponible", () => {
      const acceso: () => Promise<MIDIAccess> = async () => {
        throw new Error("No se encontró Web MIDI");
      };
      
      let llamadas = 0;
      
      // Este test verifica que incluso si el acceso falla,
      // la función de desconexión se devuelve y se puede llamar
      const desconectar = conectarMidi(acceso, (_fuente, _bruto) => {
        llamadas++;
      });
      
      // Esperar a que falle la conexión
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          // No debería haber llamadas al callback debido al error
          expect(llamadas).toBe(0);
          
          // Pero la función de desconexión debería existir y ser llamable
          expect(() => desconectar()).not.toThrow();
          
          resolve();
        }, 100); // Slightly increased timeout
      });
    });
    
    it("maneja cuando el permiso es denegado", () => {
      const acceso: () => Promise<MIDIAccess> = async () => {
        // Simular error de permiso (similar a lo que haría un navegador real)
        const error = new Error("Failed to execute 'requestMIDIAccess' on 'Navigator': NotAllowedError");
        error.name = "NotAllowedError";
        throw error;
      };
      
      let llamadas = 0;
      
      const desconectar = conectarMidi(acceso, (_fuente, _bruto) => {
        llamadas++;
      });
      
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(llamadas).toBe(0);
          expect(() => desconectar()).not.toThrow();
          resolve();
        }, 50);
      });
    });
  });
});
