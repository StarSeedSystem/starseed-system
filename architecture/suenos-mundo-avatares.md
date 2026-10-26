# Sueños del Mundo de los avatares (Ola 1025U · U4)

Lo pidió Alex: los agentes del Mundo de los avatares **se conocen, interactúan y desarrollan sueños o procesos imaginativos,
individuales o colectivos, con varios agentes**, y con ello desarrollan **recuerdos nuevos y personalidad propia**.

Un sueño es un **proceso imaginativo**: uno a seis agentes (siempre IAs, siempre «Bot de IA») se turnan para imaginar un
tema. Lo que dicen es imaginación de una IA, **no hechos**, y la interfaz lo dice.

Reglas de la ola: **una ficha no promete lo que no hace** (sin IA no se inventa texto) y **ninguna IA se llama en bucle ni sin
tope** (local y gratis primero, con tope por hora y por agente, nada de pago sin permiso).

## Dónde vive

| Qué | Archivo |
|---|---|
| Reglas puras: plan, prompt, topes, memoria con alcance, creación para la crónica, automáticos, saneado | `src/lib/avatares/suenos/sueno.ts` |
| Almacén local acotado (últimos N por escenario, uso por hora) | `src/lib/avatares/suenos/almacen-suenos.ts` |
| Ejecutor: corre el sueño turno a turno, cancelable; al final recuerda y evoluciona | `src/lib/avatares/suenos/ejecutor.ts` |
| Generador sobre el enrutador económico (`astrauraChat`) | `src/lib/avatares/suenos/generador-router.ts` |
| Hook (`useSuenos`), botón, panel, formulario y transcripción | `src/components/avatares/suenos/*` |
| Montaje en el mundo | `src/components/avatares/mundo-avatares.tsx` |

## Cómo corre un sueño

1. **Plan** (`planSueno`): 1 agente = individual (3 turnos suyos); 2–6 = colectivo, 2 rondas en el orden elegido; nunca más de
   12 turnos. El tema se limpia y se acota a 120 caracteres.
2. **Topes** (`comprobarTopes`, antes de empezar): 6 sueños por hora, 3 por agente y hora, 2 automáticos por hora, y el
   `topePorHora` de **llamadas** de la ficha de cada agente (un turno = una llamada; cuentan también las de sueños anteriores).
   Cada llamada se apunta en el uso de la hora aunque falle. Todos los topes están en `TOPES_SUENO` y la interfaz los enseña.
3. **Un turno = una llamada** al generador, con el `agentId` del agente (así el enrutador aplica las capas y el sistema
   primario de su ficha), `maxTokens` 160 y una espera máxima de 45 s. El prompt sale de `promptDeAgente` (la ficha: quién es,
   capas y filtro de percepción con sus límites honestos) más las reglas del sueño. **El hilo solo lleva lo dicho en ese sueño:
   ninguna memoria de nadie entra en el prompt**, así un sueño compartido no filtra lo personal de un participante a otro.
4. **Final**: `completo` → cada participante que habló guarda su recuerdo y recibe su empujón de experiencia; el sueño entra en
   la crónica del mundo.

Estados: `en-curso`, `completo`, `cancelado`, `sin-ia`, `interrumpido`. Un sueño `en-curso` leído del disco (la pestaña se cerró
a medias) se muestra `interrumpido`.

## El generador: gratis, sin plantillas, sin mezclar lo personal

`crearGeneradorRouter` (carga el enrutador a demanda con `import()`):

- **Modo «manual»** de Inteligencia: **se rechaza** (delegaría en el proveedor que la persona eligió a mano, que puede ser de
  pago). Los sueños son del enrutador económico; el aviso dice cómo cambiarlo.
- **Sin pago sin permiso**: si la ficha no permite pagar y hay una fuente de pago conectada, se fija con `forceSource` la mejor
  que **no** sea de pago (`rankCandidates` con el pago apagado); si solo quedan de pago, no se llama. Si aun así la ruta
  resultara de pago, el texto se descarta. Si no se puede saber qué hay conectado, no se arriesga el gasto.
- **Sin plantillas**: cuando ninguna fuente responde, el enrutador contesta con una plantilla local (`route.local === true`,
  «Aurora (respuesta local)»). Eso **no es IA**: aquí es «sin IA». El sueño queda `sin-ia` con su motivo y los turnos que ya
  existían; jamás se rellena con texto inventado.
- **`soloAgente`** (único cambio fuera de la carpeta del área, aditivo, en `src/ai/astraura/router.ts`): el enrutador, por
  defecto, mezcla en cada prompt la personalidad activa de la cuenta, su contexto personal (perfiles, mensajes, archivos), el
  contexto de Aurora (secciones del OS, pantalla, voz, habilidades) y una instrucción de actuar «en nombre del usuario». Con
  `soloAgente: true` no entra nada de eso. Ausente o `false` = comportamiento de siempre
  (`src/ai/astraura/__tests__/router-solo-agente.test.ts` fija las dos mitades).

## Memoria: cada quien recuerda dentro de su alcance

`nucleo/alcance-memoria.ts`: personal › perfil › grupo › pública, nunca hacia lo más abierto.

- Dónde escribe cada agente (`alcanceDeRecuerdo`): el alcance **más privado** donde su actor puede escribir — una personalidad,
  en lo **personal**; un agente de grupo, en lo de **grupo**; el bot de una página, en lo **público**. Un agente público no
  guarda nada personal.
- Qué lleva su recuerdo (`textoRecuerdo`, `puedeRecordarLinea`): con quién soñó, el tema, **lo que él dijo** y, de lo que dijeron
  los demás, solo lo que su recuerdo puede llevar sin abrirlo (lo público cabe en uno personal; lo personal **no** entra en
  uno público; entre dos agentes de grupo, solo del mismo grupo). Es texto plano de ≤ 400 caracteres.
- Se guarda con `registrarRecuerdo` (origen «sueño»), que aplica la cuota de memoria del medio.

## Personalidad propia: la experiencia empuja poco y se puede deshacer

`registrarExperiencia` con empujes de **0,01** por rasgo — curiosidad y empatía en un sueño compartido, curiosidad y foco a
solas — y solo si el agente habló. El tope es el de la ficha: **0,05 por rasgo y día UTC**, deriva máxima 0,25, y cada paso se
puede **deshacer** desde la pestaña Identidad → Desarrollo de su ficha. Si el tope del día ya se gastó, el sueño lo dice
(«sus rasgos ya se movieron hoy todo lo permitido»); no se esconde. Un sueño cancelado, cortado o sin IA **no** deja recuerdos
ni mueve rasgos.

## Sueños automáticos (apagados de fábrica)

Un interruptor por escenario en el panel «Sueños». Encendido, un sueño nace de un **encuentro nuevo** del mundo (los de antes
de encender no cuentan) entre dos agentes que **ya se conocen** (vínculo ≥ 0,3), con el mundo **en marcha** (sin pausa y con la
pestaña visible), sin sueño de la misma pareja en los últimos 30 min, con el tema de su encuentro, y pasa por los mismos topes
más el suyo propio (2 por hora). Si un tope lo frena, el panel lo dice («Sueño automático omitido: …»).

## Interfaz

- Botón **«Soñar juntos»** en la cabecera del mundo (también sin WebGL): abre el panel «Sueños» (`PanelCristal`, panel lateral
  en pantallas anchas y hoja inferior en el móvil, 360 px, objetivos de 44 px). **Un solo panel a la vez**: abrir los sueños
  suelta la ficha y elegir a alguien cierra los sueños.
- El panel: formulario (agentes con su chapa «Bot de IA», tema, «Elegir a quien descansa en Sueños»), interruptor de
  automáticos con los topes a la vista, el sueño en curso con **Cancelar**, y los últimos 12 del escenario con su transcripción
  turno a turno (cada autor con la chapa de `EtiquetaBotIA`, que no se puede ocultar) y qué dejó el sueño en cada uno.
- La crónica del mundo recibe una creación de tipo «sueño» por autor (`sueno:<id>:<autor>`), solo de sueños completos.

## Persistencia y límites honestos

- Los sueños en sí (transcripciones y ajustes) viven solo en este aparato (`starseed.mundo.suenos.<escenario>.v1` y
  `starseed.mundo.suenos.uso.v1`) y **no** están en `SYNCED_PREFIXES`: el tema lo escribe la persona. Se borran al borrar el
  escenario. Lo que el sueño deja en cada agente —su **recuerdo** (`starseed.mundo.agente.<id>.recuerdos.v1`, que lleva el tema
  y lo que dijo él) y su **deriva** de rasgos (`….<id>.v1`)— vive en el almacén de la ficha, que **sí** viaja con la cuenta.
- El tope de llamadas por hora cuenta **solo las llamadas de los sueños**; no ve lo que el mismo agente gaste en otras partes
  del OS. El enrutador tiene además sus propios límites de cuota y enfriamiento.
- Los sueños no leen la memoria de nadie: el hilo del sueño es lo único que reciben los agentes. Recordar es una escritura al
  despertar, no una lectura.
- Cambiar de escenario o cerrar el mundo **cancela** el sueño que corre (sus agentes eran de aquel mundo) y lo deja guardado
  como cancelado en el suyo.
- Con la pestaña oculta o el mundo en pausa no nacen sueños automáticos; uno manual ya empezado sigue hasta acabar.
- No hay motor de voz ni de imagen en los sueños: son texto.
