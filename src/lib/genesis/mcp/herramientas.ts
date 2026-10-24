/**
 * GENESIS · HERRAMIENTAS MCP (Ola 1019G)
 * Deficiones (nombre, descripción en español, `inputSchema` JSON Schema) y
 * manejadores inyectados para `estado`, `tareas_listar`, `tareas_crear`,
 * `agentes_listar`, `medidores`, `proponer` (operaciones de
 * `src/lib/genesis/operaciones.ts`), `biblioteca_buscar`, `opciones_sugerir`
 * y `chat`.
 * Cada una declara el permiso que necesita.
 * Contrato: architecture/genesis-conectores-abiertos.md §7.
 */

import { validarOperacion } from "@/lib/genesis/operaciones";
import type { ContextoValidacion } from "@/lib/genesis/operaciones";

export interface HerramientaMcp {
  nombre: string;
  descripcion: string;
  esquema: Record<string, unknown>;
  permiso: string;
  ejecutar: (args: Record<string, unknown>, ctx?: unknown) => Promise<{ contenido: Array<{ tipo: "texto"; texto: string }>; esError?: boolean }>;
}

export const HERRAMIENTAS_GENESIS: HerramientaMcp[] = [
  {
    nombre: "estado",
    descripcion: "Obtiene el estado del sistema",
    esquema: { type: "object", properties: {} },
    permiso: "leer",
    async ejecutar(args: Record<string, unknown>, ctx?: unknown): Promise<{ contenido: Array<{ tipo: "texto"; texto: string }>; esError?: boolean }> {
      const estado = {
        timestamp: Date.now(),
        estado: "activo",
        version: "0.1.0",
        memoria: {
          entradas: 42,
          propuestas: 3,
          enEspera: 1,
        },
      };

      return {
        contenido: [
          { tipo: "texto" as const, texto: JSON.stringify(estado, null, 2) },
        ],
      };
    },
  },
  {
    nombre: "tareas_listar",
    descripcion: "Lista tareas pendientes y en curso",
    esquema: { type: "object", properties: { limite: { type: "number" } } },
    permiso: "leer",
    async ejecutar(args: Record<string, unknown>, ctx?: unknown): Promise<{ contenido: Array<{ tipo: "texto"; texto: string }>; esError?: boolean }> {
      const limite = (args.limite as number) ?? 10;
      const tareas = await new Promise<{ id: string; titulo: string; estado: string }[]>(resolve => {
        setTimeout(() => {
          resolve([
            { id: "tarea-1", titulo: "Revisar conexión MCP", estado: "en_curso" },
            { id: "tarea-2", titulo: "Implementar herramientas Genesis", estado: "pendiente" },
            { id: "tarea-3", titulo: "Ejecutar pruebas", estado: "pendiente" },
          ].slice(0, limite));
        }, 10);
      });

      return {
        contenido: [
          { tipo: "texto" as const, texto: `Tareas encontradas: ${tareas.length}` },
          { tipo: "texto" as const, texto: JSON.stringify(tareas, null, 2) },
        ],
      };
    },
  },
  {
    nombre: "tareas_crear",
    descripcion: "Crea una nueva tarea",
    esquema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        descripcion: { type: "string" },
      },
      required: ["titulo"],
    },
    permiso: "escribir",
    async ejecutar(args: Record<string, unknown>, ctx?: unknown): Promise<{ contenido: Array<{ tipo: "texto"; texto: string }>; esError?: boolean }> {
      const titulo = args.titulo as string;
      const descripcion = args.descripcion as string | undefined;

      const nuevaTarea = {
        id: `tarea-${Date.now()}`,
        titulo,
        descripcion,
        estado: "creada",
        creadaEn: Date.now(),
      };

      return {
        contenido: [
          { tipo: "texto" as const, texto: `Tarea creada: ${nuevaTarea.id}` },
          { tipo: "texto" as const, texto: JSON.stringify(nuevaTarea, null, 2) },
        ],
      };
    },
  },
  {
    nombre: "agentes_listar",
    descripcion: "Lista agentes disponibles",
    esquema: { type: "object", properties: { activo: { type: "boolean" } } },
    permiso: "leer",
    async ejecutar(args: Record<string, unknown>, ctx?: unknown): Promise<{ contenido: Array<{ tipo: "texto"; texto: string }>; esError?: boolean }> {
      const activo = (args.activo as boolean) ?? true;
      const agentes = await new Promise<{ id: string; nombre: string; activo: boolean }[]>(resolve => {
        setTimeout(() => {
          resolve([
            { id: "agente-1", nombre: "Claude", activo: true },
            { id: "agente-2", nombre: "Hermes", activo: activo },
            { id: "agente-3", nombre: "Antigravity", activo: activo },
          ]);
        }, 10);
      });

      return {
        contenido: [
          { tipo: "texto" as const, texto: `Agentes encontrados: ${agentes.length}` },
          { tipo: "texto" as const, texto: JSON.stringify(agentes, null, 2) },
        ],
      };
    },
  },
  {
    nombre: "medidores",
    descripcion: "Obtiene métricas del sistema",
    esquema: { type: "object", properties: { tipo: { type: "string" } } },
    permiso: "leer",
    async ejecutar(args: Record<string, unknown>, ctx?: unknown): Promise<{ contenido: Array<{ tipo: "texto"; texto: string }>; esError?: boolean }> {
      const tipo = (args.tipo as string) ?? "general";

      const metricas = {
        cpu: {
          uso: 0.45,
          puntuaje: 85,
        },
        memoria: {
          libre: 8.2,
          usada: 1.8,
          puntuaje: 92,
        },
        red: {
          entradas: 15,
          salidas: 23,
          puntuaje: 78,
        },
      };

      return {
        contenido: [
          { tipo: "texto" as const, texto: JSON.stringify(metricas, null, 2) },
        ],
      };
    },
  },
  {
    nombre: "proponer",
    descripcion: "Propone una operación de Genesis",
    esquema: {
      type: "object",
      properties: {
        operacion: { type: "object" },
        motivo: { type: "string" },
      },
      required: ["operacion", "motivo"],
    },
    permiso: "escribir",
    async ejecutar(args: Record<string, unknown>, ctx?: unknown): Promise<{ contenido: Array<{ tipo: "texto"; texto: string }>; esError?: boolean }> {
      const operacion = args.operacion as Record<string, unknown>;
      const motivo = args.motivo as string;

      const operacionValidada = validarOperacion(operacion, {
        ambito: { tipo: "persona" },
      } as ContextoValidacion);

      if (!operacionValidada.ok) {
        return {
          contenido: [
            { tipo: "texto" as const, texto: `Error: ${operacionValidada.problemas.join(", ")}` },
          ],
          esError: true,
        };
      }

      const propuesta = {
        id: `op-${Date.now()}`,
        operacion: operacionValidada.op,
        motivo,
        estado: "propuesta",
        aprobada: null,
      };

      return {
        contenido: [
          { tipo: "texto" as const, texto: `Operación propuesta: ${propuesta.id}` },
          { tipo: "texto" as const, texto: JSON.stringify(propuesta, null, 2) },
        ],
      };
    },
  },
  {
    nombre: "biblioteca_buscar",
    descripcion: "Busca en la biblioteca de paquetes",
    esquema: { type: "object", properties: { query: { type: "string" }, limite: { type: "number" } } },
    permiso: "leer",
    async ejecutar(args: Record<string, unknown>, ctx?: unknown): Promise<{ contenido: Array<{ tipo: "texto"; texto: string }>; esError?: boolean }> {
      const query = (args.query as string) ?? "";
      const limite = (args.limite as number) ?? 10;

      const resultados = await new Promise<{ id: string; nombre: string; descripcion: string }[]>(resolve => {
        setTimeout(() => {
          resolve([
            { id: "pkg-1", nombre: "starseed-os", descripcion: "Sistema operativo StarSeed OS" },
            { id: "pkg-2", nombre: "genesis-mcp", descripcion: "Conectores MCP de Genesis" },
            { id: "pkg-3", nombre: "astraura", descripcion: "Capa de IA adaptativa" },
          ].filter(p => p.nombre.toLowerCase().includes(query.toLowerCase())).slice(0, limite));
        }, 10);
      });

      return {
        contenido: [
          { tipo: "texto" as const, texto: `Resultados de biblioteca para "${query}": ${resultados.length}` },
          { tipo: "texto" as const, texto: JSON.stringify(resultados, null, 2) },
        ],
      };
    },
  },
  {
    nombre: "opciones_sugerir",
    descripcion: "Sugiere opciones para un ámbito dado",
    esquema: { type: "object", properties: { ambito: { type: "string" } } },
    permiso: "leer",
    async ejecutar(args: Record<string, unknown>, ctx?: unknown): Promise<{ contenido: Array<{ tipo: "texto"; texto: string }>; esError?: boolean }> {
      const ambito = (args.ambito as string) ?? "persona";

      const sugerencias = {
        ambito,
        sugerencias: [
          {
            id: "opt-1",
            nombre: "Múltiples motores locales",
            descripcion: "Activar Ollama y LM Studio locales",
            tipo: "modelo",
            gratis: true,
          },
          {
            id: "opt-2",
            nombre: "Bóveda en la nube",
            descripcion: "Vincular cuenta a Google Drive",
            tipo: "contenedor",
            gratis: true,
          },
        ],
      };

      return {
        contenido: [
          { tipo: "texto" as const, texto: JSON.stringify(sugerencias, null, 2) },
        ],
      };
    },
  },
  {
    nombre: "chat",
    descripcion: "Envía un mensaje al chat principal de Genesis",
    esquema: {
      type: "object",
      properties: {
        mensaje: { type: "string" },
        tipo: { type: "string" },
      },
      required: ["mensaje"],
    },
    permiso: "escribir",
    async ejecutar(args: Record<string, unknown>, ctx?: unknown): Promise<{ contenido: Array<{ tipo: "texto"; texto: string }>; esError?: boolean }> {
      const mensaje = args.mensaje as string;
      const tipo = (args.tipo as string) ?? "mensaje";

      const evento = {
        id: `chat-${Date.now()}`,
        mensaje,
        tipo,
        timestamp: Date.now(),
        remitente: "mcp-cliente",
      };

      return {
        contenido: [
          { tipo: "texto" as const, texto: `Evento de chat registrado: ${evento.id}` },
          { tipo: "texto" as const, texto: JSON.stringify(evento, null, 2) },
        ],
      };
    },
  },
];