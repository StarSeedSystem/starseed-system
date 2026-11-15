# Contrato · Neuronas y aparatos (NEU1115G · 2026-11-15)

Petición de Alex (15-11): su móvil («Maggadroid») acabó siendo la neurona de su tableta («Maggaboard») y dos
aparatos respondían como uno. Pide poder desvincular, vincular y crear neuronas desde la sección Neuronas.
Reglas suyas: una neurona puede tener cualquier número de aparatos; lo hecho en un aparato llega a todos los
de esa neurona; lo normal y recomendado es **un aparato por neurona**; cada aparato tiene un nombre propio
editable, aparte del de la neurona. Hoy «solo déjala lista»: varios aparatos por neurona quedan preparados,
no usados.

## 1 · Causa del 15-11 (leída en el código; los datos reales solo los ven los aparatos)

Dos caminos movían a un aparato a la neurona de otro SIN que la persona eligiera:
1. `src/lib/neurons/adopcion-arranque.ts` (`decidirAdopcionArranque`, paso «pista»): seguía la cadena de alias
   y de marcas `fusionada` hasta «la neurona en la que acabó» la fila antigua del aparato. Con la APK nueva (otro
   origen web) la pista del móvil era su id antiguo `659d5e03…`; si esa fila estaba absorbida por la de la
   tableta (`e0b9faf2…`), el móvil adoptaba la de la tableta en silencio. Los pasos de «misma huella» y «mismo
   equipo» adoptaban también sin preguntar.
2. `src/lib/neurons/neurons.ts` (`resolverAliasEsteMedio`): el alias de fusión se sincroniza con la cuenta y
   cualquier aparato lo seguía al latir, aunque la fusión la hubiera hecho otro.
Qué de los dos ocurrió en el móvil real no se puede saber desde el contenedor (depende de su fila y de su alias).

## 2 · Reglas ahora

- Un aparato **nunca adopta una neurona en silencio**. La única excepción es recuperar su PROPIA identidad: la
  pista de migración a una fila viva, sin fusionar y que no sea de otro aparato (`compararAparatos`). Una pista a
  una fila absorbida (`pista-absorbida`), una huella o un equipo parecidos (`requiere-eleccion`) no adoptan:
  sin elección el aparato crea su neurona propia.
- Un alias de fusión solo mueve a este aparato si lo hizo este mismo origen (`alias.por` = su id de sync) o si la
  fila destino es de este mismo aparato (`compararAparatos` = «mismo»). Alias antiguos (sin `por`) no bastan.
- Tomar una neurona existente es siempre una elección en una lista que enseña, por neurona, su nombre y los
  aparatos que ya la usan (`neuronasParaElegir`; Ajustes › Neuronas › «Este aparato y su neurona»).

## 3 · Modelo (sin migración)

- **Neurona** = una fila de `neuron_devices` (su id es el id de neurona, `starseed.neuron.device-id`).
- **Aparato** = un origen con su id estable propio, el de sync (`starseed.device.id`; no se comparte jamás) y un
  nombre editable (`starseed.neuron.aparato-nombre.v1`, local; no está entre las claves que viajan con la cuenta). La lista
  vive en `capabilities.aparatos[idAparato] = { n, medio, so, equipo, ts, fuera? }` (jsonb existente). Cada
  aparato escribe SOLO su entrada; `combinarCapacidades` las funde por id (gana el `ts` mayor). `fuera >= ts` es
  una lápida: el aparato salió de esa neurona y un fundido viejo no lo resucita. Las neuronas antiguas sin lista
  enseñan su `capabilities.aparato` como aparato sin nombrar: siguen funcionando sin ningún paso.
- La clave del aparato para el control entre neuronas (`firma-aparato.ts`) es del aparato, no de la neurona:
  ningún cambio de neurona la toca.

## 4 · Direccionar una neurona con varios aparatos

- Mensajes y estado: llegan a todos los aparatos de la neurona (así funciona ya, porque todos usan la misma fila e id).
- Una llamada: suena en todos; contestar en uno para los demás. **No construido** (fuera de los límites de esta ola).
- Una orden del control entre neuronas: apunta a UN aparato (el id de aparato firma la orden). **No construido**:
  hoy apunta al id de neurona.
- Un par antiguo sigue hablando con el id de neurona de siempre: nada cambia en el cable.

## 5 · Qué hace cada botón (Ajustes › Neuronas)

- **Renombrar este aparato**: guarda el nombre aquí y en su entrada de la fila. No cambia el nombre de la neurona.
- **Desvincular este aparato de esta neurona**: lápida en la fila que deja y neurona nueva y propia para el
  aparato (un aparato no queda sin neurona). Desactivado si es su único aparato.
- **Vincularlo a otra neurona de mi cuenta**: lista (nombre + aparatos); aviso si ya la usa otro aparato.
- **Crear una neurona nueva para este aparato**: con el nombre que se escriba.
- Nada borra nada: la fila que se deja, las claves, el historial y los ajustes locales se quedan.
- Las neuronas absorbidas por una fusión no salen en la lista: para volver a tener una neurona con ese nombre se crea una nueva.

## 6 · Qué cubre «lo hecho en uno llega a todos» hoy, y la segunda fase

Hoy: nombre, permisos y ajustes de la neurona (cuelgan del id de neurona y viajan con la cuenta), presencia y fila.
Segunda fase: timbre en todos los aparatos con parada al contestar en uno; órdenes de control a un aparato
concreto; carrera de escritura del `capabilities` (un aparato lee-funde-escribe; dos a la vez pueden pisarse, la
entrada propia se reescribe en el siguiente latido); la ventana de bienvenida con la misma lista de aparatos.
