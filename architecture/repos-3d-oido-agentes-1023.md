# Tanda de repos del 2026-10-23: 3D, contexto, oído y motores de agentes (SOP)

> Alex (2026-10-23): «también estos: [manimgx] para todo el desarrollo de modelos 3D con Astraura y la
> Protomolécula en cualquier medio y publicación o archivo · [codegraph] para su contexto · [earshot]
> para los sentidos de cada agente de Astraura y de la orbe flotante si tiene su ajuste de sentidos
> encendidos siempre escuchando» y «estos para los desarrollos de agentes de Astraura, Genesis,
> PoliGenesis y MetaGenesis en todos sus contextos y medios: agno, mastra, langgraph, pydantic-ai,
> openai-agents-python».

Fichas en la Biblioteca: `src/lib/library/repos-os.ts` (comprobación de versión automática).
Regla de la casa: lo que aún no corre en el OS va «próximamente» con su motivo.

## 1. Qué es cada uno (verificado 2026-10-23)

| Repo | Qué es | Licencia | Versión | Encaje |
|---|---|---|---|---|
| colbymchenry/codegraph | Grafo del código en SQLite local, MCP `codegraph_explore` | MIT (telemetría anónima por defecto: **apagada** aquí) | 1.6.2 (npm) | Contexto de los agentes que escriben el OS (MetaGenesis) |
| academa-labs/manimgx | Motor de animación con la API de Manim CE, núcleo Rust/wgpu, 2D y 3D a MP4; también en el navegador (Pyodide + WebGPU) | MIT (ruedas nativas con x264: GPL en conjunto) | 0.1.1 (npm) | Átomo 3D de la Protomolécula y acción de Astraura |
| Leonxlnx/earshot | Oído para sonidos (no voz): etiquetas AudioSet (AST), texto↔audio (CLAP), momentos, volumen, ritmo; CLI, Python y MCP | MIT; modelos Apache-2.0 y BSD-3 | 0.1.0 | Sentido de oído ambiental de agentes y orbe |
| agno-agi/agno | Framework + AgentOS (runtime con API, memoria, conocimiento, aprobación humana, OpenTelemetry, RBAC) | Apache-2.0 | 3.1.10 | Motor Python de equipos de agentes |
| mastra-ai/mastra | Framework TS: agentes, flujos en grafo, persona en el bucle, memoria, RAG, evals, MCP | Apache-2.0 (carpetas `ee/`: licencia empresarial, no se usan) | @mastra/core 1.79.0 | Motor TS (en la neurona, junto al servidor de IA en Hono) |
| langchain-ai/langgraph | Agentes con estado: ejecución duradera, persona en el bucle, memoria | MIT | 1.2.16 (Py) · 1.5.2 (JS) | Flujos largos de MetaGenesis |
| pydantic/pydantic-ai | Agentes tipados: salidas validadas, dependencias, MCP, ejecución duradera, evals | MIT | 2.60.0 | Directores con decisiones de forma exacta |
| openai/openai-agents-python | Agentes, traspasos, guardas, sesiones, voz; cualquier proveedor vía LiteLLM | MIT | 0.24.0 | Equipos de PoliGenesis con traspasos entre roles |

## 2. CodeGraph (ya en marcha)

- Instalado en la Mac: `npm i -g @colbymchenry/codegraph@1.6.2`, telemetría apagada
  (`codegraph telemetry off` + `CODEGRAPH_TELEMETRY=0`). Índice en `.codegraph/` del repo
  (ignorado por git; mismo trato que `.gitnexus/`).
- Los agentes lo usan por MCP con `codegraph serve --mcp --path <repo> --no-watch`: TODOS miran el
  índice de main (los worktrees no se indexan uno a uno: serían ~0,7 GB cada uno). El índice se
  pone al día con `codegraph sync` (servicio `com.starseed.codegraph-sync`, cada 15 min).
- Convive con GitNexus: CodeGraph para «quién llama / qué rompe», GitNexus para el mapa de procesos.

## 3. Reglas para lo que llega

- **Código que escribe un agente (ManimGX) nunca se ejecuta en el proceso del OS ni con permisos de
  la persona**: en el navegador va en un Worker con Pyodide; en una neurona, solo en un contenedor sin
  red y con tope de tiempo y memoria.
- **Oído (earshot)**: solo con los sentidos encendidos y la escucha activa; a la neurona que oye van
  fragmentos SIN voz (la voz ya la lleva el reconocimiento de habla) y no se guardan; el resultado son
  etiquetas («timbre», «lluvia», «perro») que entran al contexto del agente. Nada sale de las neuronas
  de la persona; el comando `llm` de earshot (sube audio a Gemini) queda prohibido.
- **Motores de agentes**: un solo contrato de agente de Genesis (persona, herramientas, memoria,
  ámbito, presupuesto) y varios motores intercambiables (nativo, Mastra, LangGraph, Pydantic AI,
  OpenAI Agents SDK, Agno). Los modelos siempre por el enrutador propio (gratis primero, Jev, la
  pasarela de Experiential, el servidor propio de IA); las trazas de terceros apagadas (OpenAI Agents
  SDK: `set_tracing_disabled(True)`); nada de LangSmith ni de nubes de los autores.
- Pesos y dependencias pesadas a la neurona que tenga sitio (la Mac va justa de disco y memoria; el A1
  tiene 15 GB libres y 7 GB de RAM).

## 4. Colas del enjambre

- `cola-repos-3d-oido-1023.json` (ola 1023X): ManimGX y earshot.
- `cola-motores-agentes-1023.json` (ola 1023A): contrato de motores de agentes y un adaptador por motor.
