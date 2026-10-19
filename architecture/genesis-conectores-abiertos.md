# Genesis abierto: cualquier IA, contenedor, herramienta y servicio, local primero, para cualquier cuenta y página

> **Petición de Alex (2026-10-19), resumida:** integración y sincronía total entre los artefactos de Claude y
> los sistemas de StarSeed OS, abierta también a otros servicios; que cualquier persona conecte sus entornos de
> Genesis y PoliGenesis con cualquier modelo de IA para cualquier tipo de agente (como los directores), con
> opciones sugeridas como en MetaGenesis: todas las opciones gratuitas encontradas (contenedores en la nube para
> los procesos de los agentes, modelos por tipo de agente y sus proveedores, herramientas y habilidades de la
> Biblioteca), para cualquier cuenta o página, funcionando solo, sugiriendo y usando lo gratis con los enlaces
> para vincular cuentas y servicios. **Siempre lo local más potente primero:** los directores usan los modelos
> locales de los servidores activos del cerebro de la cuenta o de la página para cada tarea, según su
> configuración y todos sus medios; Astraura lo más posible, y después los demás modelos, servicios,
> conectores, habilidades y contenedores para potenciar las tareas, con sus directores y preferencias.

Amplía `puente-mando-para-todos.md` (ámbitos, motores, permisos), `genesis-niveles-malla-universal-estaciones.md`
(Genesis, PoliGenesis, MetaGenesis), `apps-en-la-malla.md` (servidor de un contexto y bolsa),
`cerebros-fusion-telepatia.md` (servidores del cerebro), `capas-autoadaptables.md`, `colmena-relevo-contenedores.md`,
`vigia-modelos.md` y `orquestacion-economica.md`.

## 1. Lo que ya existe (medido el 2026-10-19)

| Pieza | Dónde | Estado |
|---|---|---|
| Niveles Genesis / PoliGenesis / MetaGenesis y operaciones tipadas | `src/lib/genesis/*`, `/api/genesis/proponer` | código; tabla `genesis_operaciones` sin aplicar |
| Ámbitos, motores con token (`ssm_`, solo hash), 12 permisos, presupuesto | `src/lib/mando/ambito.ts`, `motores.ts`, `motor-token.ts`, `permisos.ts` | diseñado y en parte escrito; tablas `mando_*` sin aplicar; `STARSEED_MANDO_TODOS` apagado |
| Enrutador de Astraura (capas, 1,58 local primero, capacidades de la red) | `src/ai/astraura/router.ts` (`rankCandidates`, `local158PriorityDelta`, `resolveNetworkCapacities`) | funciona por aparato |
| Servidor de un contexto y bolsa de ofertas | `apps-en-la-malla.md` §2–3 | diseñado |
| Servidores del cerebro | `src/lib/brains/servers.ts` (`brain_servers`, `brain_server_links`) | funciona |
| Catálogos de opciones gratis | `src/lib/mando/proveedores-catalogo.ts` (19) y `src/ai/astraura/free-catalog.ts` (~37) | dos catálogos que se solapan; límites en frases |
| Claves de proveedores | `~/.starseed/env` de la Mac o `localStorage` cifrado por aparato | no viajan con la cuenta ni sirven a un grupo |
| Patrón de bóveda en servidor | `src/lib/storage/credenciales-servidor.ts` (`storage_credentials`, AES-256-GCM) | funciona para Drive |
| Modelo por papel | `src/lib/mando/enrutamiento.ts` (`escritor`, `revisor`, `director`), `starseed-enjambre.py` (`MODELOS`, `orden_por_merito`) | global de la Mac |
| Preferencia de modelo por agente del usuario | `src/lib/agents/model.ts` (`AgentModelPrefs`) | pista para el enrutador |
| Contenedores | `scripts/puente/contenedores_nube.py`: GitHub Actions (gratis), Oracle A1 (Always Free); Hugging Face Spaces con Docker pide plan PRO; Google Cloud sin facturación | solo para Alex |
| Biblioteca y habilidades | `src/lib/library/packages.ts` (154 estáticos), `src/ai/astraura/skills.ts` (56), Protomolécula (~239), referencias (34) | por aparato; sin datos de «vincular» |
| MCP y API hacia fuera | `scripts/puente/mcp_director.py` (stdio), plugin `puente-de-mando` (solo la Mac), `api/flujos/gancho` (un secreto global) | sin tokens por cuenta para terceros |
| Artefactos de Claude | — | nada |

## 2. La escalera: local más potente primero

Para cada tarea, cada agente elige candidatos en este orden, y solo baja de peldaño si el de arriba no puede
(no cabe, está ocupado, falla o no tiene la habilidad):

1. **Astraura en el propio contexto:** la neurona donde se pide y las neuronas activas de la misma cuenta (o
   de los miembros que prestan al grupo o página), más los servidores del cerebro (`brain_server_links`);
   la capa más potente que quepa, según `capas-autoadaptables.md`.
2. **Otros modelos locales del contexto** en esas mismas máquinas (Ollama, LM Studio, WebGPU…).
3. **La bolsa de la malla:** vecinos con capacidad pública y confianza. Nunca para lo privado.
4. **Contenedores gratuitos del contexto** para correr procesos de agentes (§5).
5. **Proveedores gratuitos en la nube** con las cuentas que la persona o el grupo vinculó (§3).
6. **De pago** solo si la preferencia del ámbito lo permite, con tope.

**«Más potente» se mide, no se supone:** tokens por segundo y aciertos por tipo de tarea de las pruebas del
vigía y de los registros del enrutador, por máquina. **Lo privado** (memorias, perfiles, mensajes) nunca sale
de las neuronas de la cuenta y de los servidores de su cerebro. Cada elección guarda su motivo para mostrarlo.

## 3. Un catálogo vivo de opciones (gratis primero)

Un solo catálogo, fusión de los dos actuales, con entradas de seis tipos: `modelo`, `proveedor`, `contenedor`,
`herramienta`, `habilidad` y `conector`. Cada entrada: id, nombre, tipo, papeles para los que sirve,
**límite gratis estructurado** (peticiones por minuto, tokens o peticiones al día, horas al mes, almacenamiento),
si pide cuenta, **enlace oficial para darse de alta y enlace a la página de la clave**, nombres de variables,
privacidad (local, nube con retención, nube sin retención), licencia y fecha de verificación. El vigía lo
refresca solo por canales oficiales (API de modelos, documentación) y marca «a revisar» lo que cambie; nunca
inventa límites.

**Sugerir:** para un ámbito, el OS cruza lo que ya tiene (neuronas, servidores del cerebro, cuentas vinculadas)
con lo que cada tipo de agente necesita y propone, en orden, lo local que falta activar, lo gratis que falta
vincular (con su botón «Vincular» al enlace oficial) y lo que no hay. Cada persona crea su propia cuenta en
cada servicio; el OS nunca crea cuentas ni escribe contraseñas por nadie.

## 4. Bóveda de claves por ámbito

Las claves que una persona vincula viven cifradas en el servidor por ámbito (cuenta, grupo, página), con el
patrón de `credenciales-servidor.ts`. Un grupo o página **usa** la clave que un miembro le presta, con tope y
fecha de fin, **sin verla nunca**. Las llamadas con esas claves salen solo desde el servidor del OS o desde un
motor del ámbito. Las claves que hoy están en `localStorage` se pueden subir a la bóveda con un botón.

## 5. Contenedores para los procesos de los agentes

Cada ámbito puede añadir **motores** (`nube-propia` o `servidor-propio` de `puente-mando-para-todos.md`) con su
token: su propio repositorio de GitHub con la plantilla de Actions del OS (gratis dentro de los minutos de su
plan), su Oracle Always Free, un servidor propio o una neurona marcada «usar como contenedor». El OS da la
plantilla, la guía y el código de emparejamiento de 15 minutos; los motores informan por las RPC de
`mando_motor_reportar` / `mando_motor_pendiente`.

## 6. Tipos de agente y directores, por ámbito

Cada ámbito tiene **asignaciones** por papel (escritor, revisor, chat, visión, voz, imagen, código) y por
director (chat, optimizador, diseño, producción, nube, medidores, aprendizaje): una cadena de candidatos con
respaldos y preferencias (local primero, privacidad, presupuesto). Por defecto, las sugeridas a partir de lo
que usa MetaGenesis; la persona las cambia en su Genesis y el grupo las vota en PoliGenesis si está en modo
democrático. MetaGenesis usa el mismo mecanismo con su archivo `asignaciones-agentes.json`.

## 7. Abierto a cualquier servicio: Genesis por MCP, API y ganchos

- **Servidor MCP remoto de Genesis** por ámbito (HTTP, JSON-RPC 2.0, `initialize`, `tools/list`,
  `tools/call`), con token por ámbito (`ssm_`, solo hash) o inicio de sesión, y los 12 permisos. Herramientas:
  `estado`, `tareas_listar`, `tareas_crear`, `agentes_listar`, `medidores`, `proponer` (operaciones de
  Genesis), `biblioteca_buscar`, `opciones_sugerir` y `chat`.
- **Tokens externos** por ámbito con alcance, caducidad, límite de uso y registro de cada llamada; se revocan
  al instante.
- **Ganchos firmados por ámbito** (HMAC con secreto propio) para n8n, Zapier, Make, Dify o cualquier servicio.

## 8. Sincronía con los artefactos de Claude

- Cualquier persona añade la URL MCP de su Genesis como **conector personalizado en claude.ai**: sus chats,
  Cowork y Claude Code ven y dirigen su Genesis.
- Un **artefacto de Claude** (por ejemplo un Dashboard de agentes o un tablero de tareas) declara la capacidad
  `mcp` con ese conector: muestra datos con `watchTool` y actúa con `callTool`, siempre con las credenciales
  de quien lo mira.
- La **Biblioteca** acepta enlaces de artefactos de Claude como paquetes «Abrir en Claude» y el OS muestra los
  pasos para añadir su Genesis a Claude con la URL lista para copiar.
- El **sistema de diseño** es el mismo en los dos lados: el artefacto Design System «StarSeed OS» y los tokens
  del repo (`memory/diseno/estudio-audiovisual/`).
- El plugin `puente-de-mando` pasará de `127.0.0.1` al MCP remoto de MetaGenesis cuando exista.

## 9. Seguridad y lo que necesita a Alex

Claves y tokens nunca en el cliente ni en registros; lo privado nunca en la nube; cada llamada externa queda
registrada; tope de gasto por ámbito. **Necesitan la palabra de Alex:** aplicar las migraciones (`mando_*`,
`metagenesis_nodos`, `genesis_operaciones` y la nueva `genesis_conectores`), encender `STARSEED_MANDO_TODOS`
y abrir el MCP remoto a internet.

## 10. Tareas (Ola 1019G, `cola-genesis-conectores-1019.json`)

| Bloque | Tareas |
|---|---|
| Catálogo | A fusión de catálogos · B contenedores gratis · C potencia medida · D vigía de opciones |
| Elección | E escalera local primero · F asignaciones por papel y director · G puente con el enrutador de Astraura · H lector Python para MetaGenesis |
| Bóveda y datos | I migración `genesis_conectores` (escrita, sin aplicar) · J bóveda por ámbito · K sugeridor |
| Interfaz y API | L API de opciones · M asistente «Conectar Genesis» · N panel de asignaciones |
| Contenedores | O plantilla de GitHub Actions · P registro de motores del ámbito |
| Abierto | Q protocolo MCP · R herramientas MCP · S ruta MCP con permisos · T tokens externos · U ganchos por ámbito |
| Biblioteca y Claude | V «vincular» en la Biblioteca · W habilidades para agentes · X artefactos de Claude |

Cada tarea toca como mucho 3 archivos y 120 líneas por archivo. Las escribe el enjambre; Claude dirige y
verifica en localhost (Genesis › Conectar, una cuenta de prueba y una página de grupo) y, cuando exista el MCP,
publica un artefacto Dashboard de Claude que lo use.
