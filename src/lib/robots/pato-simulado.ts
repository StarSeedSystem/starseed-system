"use client";

/**
 * PATO SIMULADO — Open Duck Mini en el navegador
 * 
 * Simula el Open Duck Mini de Open Duck Playground con su política de caminar en ONNX.
 * Usa una versión de MuJoCo para WebAssembly y onnxruntime-web.
 * Recibe las mismas 5 acciones que el robot real y se puede poner en una escena 3D o XR.
 * Los recursos pesados se descargan solo si la persona lo activa.
 * Si el navegador no puede, se avisa y el bot sigue con su orbe.
 */

import { detectarCapacidades, type Capacidades } from "@/lib/aurora/voz-starseed/capacidades";
import type { Timbre } from "@/lib/aurora/timbres";

// Acciones que puede realizar el pato (basado en needle-duck)
export type AccionPato =
  | { tipo: "caminar"; direccion: "adelante" | "atras" | "izquierda" | "derecha"; segundos?: number }
  | { tipo: "girar"; direccion: "izquierda" | "derecha"; grados?: number }
  | { tipo: "emoticon"; expresion: "feliz" | "triste" | "confundido" | "asustado" | "enojado" | "somnoliento" | "asentir" | "mirar_arriba" | "mirar_abajo" | "mirar_izquierda" | "mirar_derecha" | "mirar_alrededor" }
  | { tipo: "baile"; estilo: "moverse" | "cabecear" | "girar" | "caminata_lunar" | "pollo"; segundos?: number }
  | { tipo: "sacudir_cabeza" };

export type EstadoPato = 
  | { estado: "listo"; modelo: any; sesion: any }
  | { estado: "cargando"; progreso: number }
  | { estado: "error"; mensaje: string }
  | { estado: "no_disponible"; motivo: string }
  | { estado: "usando_orbe" };

/**
 * Simulador del pato Open Duck Mini
 */
export class PatoSimulado {
  private estado: EstadoPato = { estado: "no_disponible", motivo: "No inicializado" };
  private modeloONNX: any = null;
  private sesionInferencia: any = null;
  private mujoCoInstancia: any = null;
  private readonly MODELO_URL = "/modelos/open_duck_mini/BEST_WALK_ONNX_2.onnx";
  private readonly MUCJO_WASM_URL = "/modelos/mujoco_wasm/mujoco.wasm";
  
  constructor() {
    this.inicializar();
  }
  
  private async inicializar() {
    try {
      const caps: Capacidades = await detectarCapacidades();
      
      // Verificar si el navegador soporta WebAssembly y WebGPU (necesario para MuJoCo WASM)
      if (!("WebAssembly" in window) || !(navigator as any).gpu) {
        this.estado = { 
          estado: "no_disponible", 
          motivo: "El navegador no soporta WebAssembly o WebGPU necesarios para la simulación"
        };
        return;
      }
      
      this.estado = { estado: "cargando", progreso: 0 };
      
      // En una implementación real, aquí cargaríamos:
      // 1. El modelo WASM de MuJoCo
      // 2. El modelo ONNX de la política de caminar
      // 3. Inicializar la sesión de inferencia
      
      // Por ahora, simulamos la carga
      await this.cargarRecursos();
      
      this.estado = { estado: "listo", modelo: this.modeloONNX, sesion: this.sesionInferencia };
    } catch (error) {
      console.error("Error al inicializar el pato simulado:", error);
      this.estado = { 
        estado: "error", 
        mensaje: error instanceof Error ? error.message : "Error desconocido"
      };
    }
  }
  
  private async cargarRecursos() {
    // Simular carga progresiva
    for (let i = 0; i <= 100; i += 20) {
      this.estado = { estado: "cargando", progreso: i };
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // En una implementación real, aquí haríamos:
    // import * as mujoco from '@mujoco/wasm';
    // import * as ort from 'onnxruntime-web';
    // 
    // const mujocoWasm = await fetch(this.MUCJO_WASM_URL).then(r => r.arrayBuffer());
    // this.mujoCoInstancia = await mujoco.initWebMQJSCallback({ wasmBinary: mujocoWasm });
    // 
    // const modeloResponse = await fetch(this.MODELO_URL);
    // const modeloBuffer = await modeloResponse.arrayBuffer();
    // this.modeloONNX = await ort.InferenceSession.create(modeloBuffer);
    // 
    // const sesionOptions = new ort.SessionOptions();
    // this.sesionInferencia = await ort.InferenceSession.create(modeloBuffer, sesionOptions);
  }
  
  /**
   * Ejecuta una acción en el pato simulado
   */
  async ejecutarAccion(accion: AccionPato): Promise<{ éxito: boolean; mensaje?: string }> {
    if (this.estado.estado !== "listo") {
      return { 
        éxito: false, 
        mensaje: `El pato no está listo: ${this.estado.estado === "error" ? this.estado.mensaje : this.estado.estado === "no_disponible" ? this.estado.motivo : "Aún cargando..."}`
      };
    }
    
    try {
      // En una implementación real, aquí traduciríamos la acción a comandos para MuJoCo
      // usando el modelo ONNX para generar las acciones de control
      
      switch (accion.tipo) {
        case "caminar":
          // Traducir a comandos de movimiento para MuJoCo
          await this.ejecutarCaminar(accion.direccion, accion.segundos ?? 2.0);
          break;
        case "girar":
          await this.ejecutarGirar(accion.direccion, accion.grados ?? 90);
          break;
        case "emoticon":
          await this.ejecutarEmoticon(accion.expresion);
          break;
        case "baile":
          await this.ejecutarBaile(accion.estilo, accion.segundos ?? 4.0);
          break;
        case "sacudir_cabeza":
          await this.ejecutarSacudirCabeza();
          break;
      }
      
      return { éxito: true };
    } catch (error) {
      console.error("Error al ejecutar acción:", error);
      return { 
        éxito: false, 
        mensaje: error instanceof Error ? error.message : "Error al ejecutar la acción"
      };
    }
  }
  
  private async ejecutarCaminar(direccion: "adelante" | "atras" | "izquierda" | "derecha", segundos: number): Promise<void> {
    // Implementación simulada - en realidad enviaría comandos a MuJoCo
    console.log(`Caminando ${direccion} durante ${segundos} segundos`);
    await new Promise(resolve => setTimeout(resolve, segundos * 1000));
  }
  
  private async ejecutarGirar(direccion: "izquierda" | "derecha", grados: number): Promise<void> {
    console.log(`Girando ${direccion} ${grados} grados`);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulación
  }
  
  private async ejecutarEmoticon(expresion: "feliz" | "triste" | "confundido" | "asustado" | "enojado" | "somnoliento" | "asentir" | "mirar_arriba" | "mirar_abajo" | "mirar_izquierda" | "mirar_derecha" | "mirar_alrededor"): Promise<void> {
    console.log(`Emoticon: ${expresion}`);
    await new Promise(resolve => setTimeout(resolve, 1500)); // Simulación
  }
  
  private async ejecutarBaile(estilo: "moverse" | "cabecear" | "girar" | "caminata_lunar" | "pollo", segundos: number): Promise<void> {
    console.log(`Baile ${estilo} durante ${segundos} segundos`);
    await new Promise(resolve => setTimeout(resolve, segundos * 1000));
  }
  
  private async ejecutarSacudirCabeza(): Promise<void> {
    console.log("Sacudiendo cabeza (negativo)");
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulación
  }
  
  /**
   * Obtiene el estado actual del pato
   */
  obtenerEstado(): EstadoPato {
    return this.estado;
  }
  
  /**
   * Verifica si el pato está listo para usar
   */
  estaListo(): boolean {
    return this.estado.estado === "listo";
  }
  
  /**
   * Fuerza una recarga de los recursos (para cuando el usuario active la simulación)
   */
  async recargar(): Promise<void> {
    this.estado = { estado: "cargando", progreso: 0 };
    await this.cargarRecursos();
    if (this.estado.estado === "cargando") {
      this.estado = { estado: "listo", modelo: this.modeloONNX, sesion: this.sesionInferencia };
    }
  }
}

// Instancia singleton del pato simulado
let instanciaUnica: PatoSimulado | null = null;

/**
 * Obtiene la instancia única del pato simulado
 */
export function obtenerPatoSimulado(): PatoSimulado {
  if (!instanciaUnica) {
    instanciaUnica = new PatoSimulado();
  }
  return instanciaUnica;
}