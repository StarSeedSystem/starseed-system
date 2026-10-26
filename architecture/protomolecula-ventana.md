# La ventana de la Protomolécula (Ola 1026P · PRO1026P1)

Petición de Alex (2026-10-26): los ajustes de geometría y de estilo pasan a pestañas ocultas; lo principal son los
controles, con herramientas autoadaptativas y el control de Astraura; se le puede pedir cualquier cosa sin salir del
contexto; y los grupos, comunidades y páginas tienen sus opciones de privacidad y reglas. Esta nota fija el modelo.

## Estructura
`src/components/protomolecula/panel-orbe.tsx` (la ventana que abre la orbe) + `src/components/protomolecula/ventana/**`.
`PanelOrbeProps` sigue igual y gana un `ruta?` opcional (la orbe se lo pasa).

| Pestaña | Contenido | Cuándo |
|---|---|---|
| **Crear** (por defecto) | chip del contexto, barra de petición (texto/voz, «Directo» o «En una rama»), vista previa del plan, herramientas, historial | siempre |
| **Controles** | el panel completo (`PanelProtomoleculaAutonomo`, perezoso) | siempre |
| **Vínculos** | mandos MIDI y Gamepad: conectar, «Aprender», quitar (enrutador real de `almacen-vinculos.ts`) | siempre |
| **Gobierno** | `ResumenGobierno` (ranura de `GobiernoProtoResumen`) | solo si lo de delante es, o cuelga de, un grupo, comunidad o página |
| **Apariencia** | geometría, estilo y «Apagar orbe» | oculta tras el menú «⋯» (junto a «Abrir lienzo») |

Las pestañas ya visitadas siguen montadas (ocultas): el texto, el plan a medias y los mandos no se pierden al cambiar.

## El flujo de una petición
1. **Contexto.** `useContextoVentana(ruta)` = `leerContexto(ruta)` (P3) + lo último que la pantalla anunció con
   `EVENTO_CONTEXTO_PROTO`. La orbe escucha SIEMPRE mientras vive (`contexto-anunciado.ts`) para que lo anunciado antes de
   abrir la ventana no se pierda. Todo anuncio se valida (`normalizarAnuncio`): vocabulario cerrado, longitudes acotadas,
   sin caracteres de control; `null` quita un campo; el anuncio de otra ruta se descarta.
2. **Plan.** Un texto → `planificarPeticion({texto, contexto, modo})`; una herramienta → un plan hecho a mano con el
   vocabulario CERRADO (`OperacionPedida`), sin IA. Una sola petición a la vez, texto ≤ 600 caracteres, espera ≤ 45 s.
3. **Gobierno.** `decidirCambio(contexto, actor, plan.tipoCambio)` → aplicar · proponer · votar · denegar. Un plan que solo
   ABRE una vista (`abrir-en`) no cambia nada de nadie: no pasa por el gobierno y se ejecuta sin confirmar.
4. **Confirmar.** Nada se aplica sin el clic de la persona. *Aplicar* → `ejecutarPlan(plan)`. *Proponer/votar* → NO se
   ejecuta: se abre el compositor de propuestas del OS (`ProposalComposer`) dentro de la propia ventana, sembrado con el
   borrador `veredicto.propuesta` y la petición como texto. Al aprobarse se ejecuta el comando del borrador; el plan de
   Astraura no se aplica solo. *Denegar* → el botón no se puede pulsar y se dice el motivo.
5. **Resultado.** «Hecho» o «No se pudo aplicar» con lo hecho/pendiente. *Deshacer* solo aparece si quien ejecutó devuelve
   `deshacer()` en el resultado (extensión opcional del `ResultadoEjecucion`).

## Herramientas adaptativas (`herramientas.ts`)
De 6 a 9, según `contexto.entidad` y `contexto.seleccion`. Cada una hace una de cuatro cosas, nunca nada:
rellenar la barra (la persona termina la frase) · lanzar un plan cerrado · abrir el lienzo · ir a otra pestaña.
Siempre: objeto 3D animado, imagen, fondo, abrir en pizarra, abrir en XR, abrir el lienzo. Publicación: editar en rama,
añadir imagen/objeto 3D, insertar molécula. Grupo/comunidad/página: proponer cambio de diseño, pizarra de la entidad,
reglas y privacidad. Archivo: convertir, editar en rama. Mensaje: reescribir. Pizarra/escritorio/widget: insertar
molécula, rediseñar. Molécula: dar una orden. Perfil: rediseñar. Lo seleccionado añade «Retocar la selección».

## Honestidad y economía
- Sin IA: «Sin IA disponible: puedo hacerlo con las reglas locales…». El botón convierte el texto en un paso
  `dictar-molecula` (las reglas locales de `dictado.ts`), que pasa por el mismo plan y la misma confirmación.
- Fuera de vocabulario, tope por hora, tiempo agotado y excepciones se cuentan con su motivo y su camino
  (`pasos.ts#textoFallo`). Las herramientas no gastan IA y siguen disponibles.
- Historial: local (localStorage), máximo 8, sin duplicados, con «Borrar el historial». Solo en ese aparato.
- Los mandos funcionan mientras la ventana está abierta; HID, serie, OSC y pulsómetro no se vinculan desde aquí todavía.

## Cómo se integra con la ola (integrado el 2026-10-26)
- **P3 (petición):** `leerContexto`, `planificarPeticion`, `ejecutarPlan` y `actorDeLaSesion` desde
  `@/lib/protomolecula/peticion`. `ejecutarPlan(plan, { contexto, abrirRuta })` recibe la pantalla de la ventana y
  `router.push` (lo pasa el orbe por `PanelOrbe.abrirRuta` → `PestanaCrear` → `usePeticion(…, { abrirRuta })`), para
  navegar dentro del OS sin recargar.
- **P2 (gobierno):** `decidirCambio` desde `@/lib/protomolecula/gobierno`. La pestaña «Gobierno» monta
  `GobiernoProtoResumen` (`@/components/protomolecula/gobierno`) cargado a demanda desde `ventana/ranura-gobierno.tsx`;
  mientras llega (o si no carga) se ve `ResumenGobiernoLocal`, la tabla «tipo de cambio × cómo se decide».
- **Quién decide (actor real):** `usePeticion` lee al montar, y cada vez que cambia lo que gobierna la pantalla, el actor
  de la sesión con `actorDeLaSesion(contexto, "humano")` (= `peticion/dependencias.ts#actorPorDefecto`: cuenta y rol REAL
  en el grupo, la comunidad o la página que gobierna la pantalla, con `governance/membership.ts#roleFromMemberships`, el
  mismo censo de la gobernanza: `os_memberships` por slug y SIN las solicitudes pendientes). El veredicto previo usa ese
  actor —el mismo que usará la ejecución— y, mientras se lee o si no hay sesión, la deducción local `actorDeLaVentana`.
  Una comunidad que no esté en `os_memberships` (partidos y entidades federativas con censo propio) da rol `null`:
  «miembro sin rol», nunca un permiso inventado.
- **Planes que pide un agente:** `[[ACCION: protomolecula {"accion":"pedir"}]]` (`peticion/pedir.ts`) deja un
  `PlanPendiente` en la cola y emite `EVENTO_PLAN_PENDIENTE` (definido en `peticion/contrato.ts` para que el orbe lo
  escuche sin cargar el planificador). El orbe abre la ventana; `usePeticion` lo enseña como plan («Lo propone <agente>
  (bot de IA) · no se aplica nada hasta que lo confirmes»), con el veredicto calculado para LA PANTALLA EN QUE SE PIDIÓ.
  Confirmar lo saca de la cola (`tomarPlanPendiente`) y lo ejecuta contra esa pantalla; Cancelar lo descarta
  (`descartarPlanPendiente`). Nunca pisa un plan que la persona esté mirando ni algo en curso: espera en la cola y se
  enseña al volver a abrir la ventana (el más reciente).
