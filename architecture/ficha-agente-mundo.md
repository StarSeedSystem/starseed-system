# Ficha del agente del Mundo de los avatares (Ola 1025U · U2)

Lo pidió Alex: en el Mundo de los avatares, cada agente (una personalidad de la cuenta, un bot de un grupo, página o
comunidad, o un agente de grupo) tiene opciones propias de **cerebro**, **capas de conciencia**, **modelos** y
**desarrollo**. Contrato común: `src/lib/avatares/mundo/agente-mundo.ts` (`AgenteMundoRef`: todo habitante es una IA).

Regla de la ola: **una ficha no promete lo que no hace.** Cada ajuste dice si está *aplicado* (lo lee ya un motor del OS) o
*guardado en la ficha* (lo leerá el agente al responder; hoy lo consume quien llame a `promptDeAgente` y compañía).

## Dónde vive

| Qué | Archivo |
|---|---|
| Config pura, saneado y contratos de consumo | `src/lib/avatares/agente/config-agente.ts` |
| Percepción (rasgos, `filtroAPrompt`) y evolución con tope | `src/lib/avatares/agente/percepcion.ts` |
| Memorias recientes y vista de la evolución | `src/lib/avatares/agente/desarrollo.ts` |
| Almacén por agente + hook | `src/lib/avatares/agente/almacen-agente.ts` |
| Ficha y pestañas | `src/components/avatares/ficha/*` |

Almacén: `starseed.mundo.agente.<id del agente>.v1` (config) y `….recuerdos.v1` (recuerdos). Solo en el aparato: para que
viaje con la cuenta hay que añadir el prefijo `starseed.mundo.agente.` a `SYNCED_PREFIXES` de `settings-sync.ts`.

## Pestañas

1. **Identidad** — quién es, de quién, la chapa «Bot de IA» (siempre visible en la cabecera) y la sección **Desarrollo**
   (solo lectura): memorias recientes y evolución de rasgos.
2. **Cerebro** — propio (memoria individual) o vinculado a un `Brain` existente de la cuenta (cuenta, perfil, grupo,
   página, publicación). Modo de memoria: individual, colectiva o telepática. La telepatía reutiliza `VinculoTelepatico` y
   `planSincronizacion` (no se reimplementa la sincronía); para un cerebro vinculado se abre el diálogo de Telepatía del
   propio cerebro. **Alcance de memoria** (`nucleo/alcance-memoria.ts`): un agente solo vincula cerebros de un ámbito que
   su actor puede ver, y un recuerdo nunca fluye a un ámbito más abierto que el suyo.
3. **Capas** — lista ordenada con peso 0–1; añadir, quitar, conectar, subir y bajar. Las cuatro de conciencia
   (`CapaConciencia`) se aplican con `fijarCapaGuardada("agente", …)`; «Todo StarSeed OS» es la colectiva de la red
   (nunca lleva lo personal) y las capas propias entran en el prompt.
4. **Percepción** — curiosidad, empatía, escepticismo, humor y foco temático (0–1), temas y sentidos no íntimos.
   `filtroAPrompt(config)` produce el fragmento de instrucciones; siempre termina con los límites honestos.
5. **Motores** — un motor por papel: reflejo (Needle), juicio (Jev), palabra (BitNet 1.58 / Bonsai / enrutador económico /
   heredar) y profundo (opcional, externo). El papel «palabra» se aplica con `setPrimaryChoice("agente", id, …)`. Los de
   pago están apagados y piden permiso; hay un tope de llamadas por hora por agente.
6. **Herramientas** — familias de herramientas y habilidades de Astraura (`SKILL_CAPABILITIES`) que existen; «todas» por
   defecto, como en `chat-herramientas.ts`.
7. **Perfil y red** — monta `PerfilAgenteRed` (U3).

## Desarrollo (solo lectura)

- Memorias: `RecuerdoBot` (de `astraura-bots/memoria-bot.ts`), filtradas por lo que el actor del agente puede ver.
- Evolución: los rasgos **base** los fija la persona; la **deriva** (≤ 0,25, como `DERIVA_MAXIMA`) la mueve la experiencia con
  un **tope de 0,05 por rasgo y día UTC**; cada paso se puede **deshacer** y, aun deshecho, sigue contando en el tope.
- Sin datos, la sección lo dice; no se inventa actividad.

## Cómo lo usa quien hace hablar al agente (el mundo, U1)

Nada de lo «guardado en la ficha» se aplica solo: quien responda por el agente lo lee con estas funciones puras de
`config-agente.ts` (y `leerConfigAgente(agente)` de `almacen-agente.ts`):

| Necesito… | Función |
|---|---|
| El fragmento de instrucciones (quién es, capas con perspectiva, filtro de percepción y límites honestos) | `promptDeAgente(config, agente)` |
| Papeles apagados y hacia dónde inclinar el reparto de modelos | `preferenciasReparto(config.motores)`: da `apagadas` y, si el agente no hereda, `nivelador` y `externaFija` (si no trae `nivelador`, vale el que ya use el mundo) para `repartir()` |
| Saber si puede llamar a un modelo ahora | `puedeLlamar(config.motores, llamadasUltimaHora)` |
| Qué habilidades de Astraura puede usar | `habilidadesPermitidas(config.herramientas)` (para `skillsSystemPrompt(only)`) |
| Qué memoria lee y dónde escribe | `actorMemoriaDe(agente)` + `alcance-memoria.ts`; guardar con `registrarRecuerdo(agente, …)` |
| Dejar que la experiencia mueva sus rasgos | `registrarExperiencia(agente, empujes, motivo)` (tope 0,05 por rasgo y día) |

Lo que sí está aplicado ya: las cuatro capas de conciencia (`capas-entidad`, ámbito «agente») y el sistema del papel
«palabra» (`primary-system`, ámbito «agente»). El enrutador los lee cuando la petición lleva `agentId: agente.id` (el id
`<origen>:<idOrigen>` del contrato); si el mundo no pasa ese id, esos dos ajustes no tienen efecto.

La ficha pesa (catálogo de modelos, telepatía): quien la monte debe cargarla de forma perezosa (`next/dynamic`).
