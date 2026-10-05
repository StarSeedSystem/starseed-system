# Bloqueadas: reparar en vez de rechazar (una sola sección, reintentos automáticos de verdad)

> Petición de Alex (2026-10-05): en el Puente de Mando hay dos secciones de bloqueadas, la del medidor
> del pulso de trabajo y la de procesos (ramificación), y en ninguna funciona el reintento con cambio
> automático ni «reintentar las que sirven». Hay que unificarlas y hacer funcionales los reintentos
> automáticos con los directores, de forma inteligente. Además: **casi todo lo rechazado podía ser útil
> con cambios coherentes**. Rechazar debe ser la excepción.

## 1. Diagnóstico medido (2026-10-04, 23:40)

1. **(A) Medidor.** `POST /api/mando/medidores`:
   - Escribe `progreso.json` sin el cerrojo del orquestador, que lo sobrescribe con su copia en memoria.
   - Para tareas sin entrada en progreso (22 de 38 filas) hace `continue` y responde `ok` con `tareas: []`: parece un éxito y no hace nada (`medidores/route.ts:1018`).
2. **(B) Ramificación.** `POST /api/mando/reintentar` clasifica como «sin acción requerida» o «rechazo sin razón escrita» todo `sin_cambios`, `fallo_tsc`, `fallo_tests`, `rechazada` sin objeción escrita, `conflicto` e `interrumpida` sin huella de red (`reintento-inteligente.ts:200-263`).
3. **Los reintentos que sí crea:**
   - van al **final** de la cola viva, con horas de espera;
   - **heredan `modelo`**, así que reintentan con el mismo modelo que falló y con precedencia absoluta;
   - heredan `estado`, `nota` y `motivo`;
   - se duplican (`PA1005Ab` ×2 y luego `Ac`), porque no se sigue la cadena de sucesores.
4. **«Reintentar todas»** procesa también tareas `sustituida`, `informe`, `en_curso` y `pendiente`.
5. **Reasignar** sobre una tarea terminada no hace nada, aunque la interfaz promete «la vuelve a ejecutar desde cero».
6. **Directores.** `director-orquestacion.continuar_estancadas` sale si hay orquestador vivo, y `reintentar_sin_cambios` es código muerto. Además, el desatascador **rechaza en automático** toda revisión bloqueante en vez de repararla.

## 2. Principio nuevo: reparar primero

Ninguna tarea se tira por fallar. Cada fallo trae información y esa información se convierte en el
**cambio** del siguiente intento:

| Estado | Cambio automático que lleva el reintento |
|---|---|
| `rechazada` / `bloqueante` | La objeción del revisor (de `revisiones.md` o de los eventos) **literal**, con la instrucción de corregir cada punto y añadir pruebas de cada uno |
| `fallo_tests` | Las pruebas que fallan y su salida (de `olas/pasos/<id>.jsonl`, del log o reejecutando las pruebas del alcance) |
| `fallo_tsc` | Los errores de tsc de sus archivos |
| `sin_cambios` | «Tu intento no tocó tus archivos declarados: X, Y no existen o no cambiaron. Créalos o modifícalos según el contrato» |
| `interrumpida` / red / 429 | La misma tarea con **otro proveedor** |
| `conflicto` | Partir de `main` actual y rehacer sobre él |
| `faltan` (alcance incompleto) | La lista de archivos que faltan |

Reglas de todos los reintentos:

- **Otro modelo.** El reintento nunca hereda `modelo`, `estado`, `nota` ni `motivo`. Elige un modelo
  distinto del que falló: la recomendación del optimizador y del director de diseño, o la rotación. Al
  segundo intento, el más capaz disponible (Codex).
- **Sin duplicados.** Si una tarea ya tiene un sucesor vivo (`Ab`, `Ac`…), se actúa sobre el último
  de la cadena, nunca se crea otro en paralelo.
- **Delante de la cola.** Un reintento se pone el **primero** en la cola viva y se marca `adelantar`,
  como hace `asignar_huecos.reordenar_cola`.
- **Desde `main`.** Parte de `main` actual, no de la rama vieja, salvo si la rama tiene trabajo útil y
  está al día.
- **Escalado, no descarte.** Al tercer intento fallido no se descarta: el director la escala, primero
  con Codex y el contexto completo y después a Claude. Solo se pregunta a Alex si nadie puede.
- **Descartar** es solo para:
  - tareas sustituidas por otra viva;
  - duplicados;
  - tareas cuyos archivos ya integró otra tarea con el mismo propósito, comprobado por diff;
  - lo que Alex descarte a mano.

## 3. Una sola sección de bloqueadas

- **Componente único** `src/components/mando/bloqueadas-panel.tsx`. Se monta en el detalle del
  medidor «Bloqueadas» y en la sección de procesos, con paridad total. Muestra:
  - la tarea, su estado y su causa detectada;
  - el **cambio automático propuesto** (texto que se puede editar);
  - la cadena de sucesores y la posición en la cola;
  - los botones **Reparar ahora**, **Reparar con mi cambio**, **Escalar a director** y **Descartar**
    (este último a dos clics).
- **Una sola API.** `POST /api/mando/reintentar`, con `{ids?, cambio?, automatico?, escalar?}`. La
  ruta del medidor delega en ella y deja de escribir `progreso.json` por su cuenta. Las tareas que aún
  no han arrancado se muestran como **«en cola, posición N»**, nunca como un falso éxito ni como «no
  existe».
- **Reparar todas las que sirvan** procesa solo estados de fallo o bloqueo, nunca `sustituida`,
  `informe`, `en_curso` ni `pendiente`.

## 4. Directores: reparación automática continua

- **Desatascador.** Una revisión bloqueante ya **no rechaza**: crea la reparación automática con la
  objeción como cambio. Solo al tercer intento con objeción pasa a escalar.
- **Director de orquestación**, en cada ciclo de 180 s:
  - busca tareas en estado de fallo o bloqueo sin sucesor vivo y llama a `POST /api/mando/reintentar`
    con `{ids, automatico: true}`;
  - tope de 6 reparaciones por hora y de 2 simultáneas por ola;
  - decide con **Jev** en una sola llamada por ciclo (`elegir`: reparar, escalar o esperar), con el
    contexto de la tarea y del fallo;
  - si Jev no responde, repara siguiendo la tabla de §2.
- **Aviso.** Cada reparación y cada escalado van al Chat Director en una línea, sin esperar al parte
  horario.
