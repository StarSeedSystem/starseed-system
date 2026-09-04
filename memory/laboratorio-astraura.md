# Laboratorio de Astraura — memoria del subsistema

> Documento de la Ola 230 (commits `64a14d6` L1, `acea347` L2, `b517755` L4, `ffbdf86` L7).
> Código real: `src/lib/laboratorio/{genoma,versiones,cuantizacion}.ts`, `src/components/laboratorio/inspector-nodo.tsx`,
> pruebas en `src/lib/__tests__/laboratorio-*.test.ts`.
> ⚠️ `versiones.ts` (L2) vive hoy **solo en la rama `ola/L2`**, pendiente de fusión a `main`.

---

## 1. Para qué existe

El Laboratorio es el recinto de pruebas de la inteligencia de Astraura: **desarrollar, medir y afinar la IA sin probar nunca directamente sobre el OS**. Todo lo que aquí se edita —capas, parámetros, enlaces, precisiones— corre sobre copias del genoma guardadas en el navegador (localStorage), y el único puente hacia el OS real es un *plan de promoción* que la función de promoción devuelve pero **no ejecuta**: hace falta confirmación humana explícita. El Laboratorio no toca Supabase, no hace red, no lee ni escribe la configuración viva de la inteligencia del OS (`src/lib/astraura/primary-system.ts`, `starseed.config.json`).

El flujo pensado: editar el genoma → guardar versiones y ramas → comparar → preparar promoción → confirmar y aplicar al OS.

## 2. El genoma y sus nueve capas fásicas (`src/lib/laboratorio/genoma.ts`)

El genoma modela la IA como **nueve capas fásicas ordenadas de lo más fundamental (índice 0) a lo más cambiante (índice 8)**. Cada capa tiene mutabilidad (0–1) y color propios (`CAPAS`, única fuente de verdad):

| # | Capa | Mutabilidad | Color | Qué es |
|---|---|---|---|---|
| 0 | Núcleo | 0,05 | `#38BDF8` | Matemáticas fundacionales: ternaria 1,58 bits `{-1,0,1}`, ventana de contexto, semilla, precisión, presupuesto de cómputo |
| 1 | Propósito | 0,10 | `#F59E0B` | Para qué existe la IA; los tres límites pétreos de la Tríada (`petreo: true`) |
| 2 | Instinto | 0,20 | `#EF4444` | Reflejos y seguridad: no dañar, pedir permiso, no agotar créditos |
| 3 | Intuición | 0,40 | `#10B981` | Heurísticas aprendidas: gratis primero, relevo ante 429/402, caché |
| 4 | Creatividad | 0,60 | `#A855F7` | Temperatura, divergencia, imaginación intuitiva |
| 5 | Capacidad | 0,50 | `#EC4899` | Los diez medios: texto, voz, imagen, vídeo, sonido, programas, avatares, interacción, interconectividad (nodo `medio`) |
| 6 | Datos | 0,70 | `#EAB308` | Corpus, memoria raíz, recuerdos principales |
| 7 | Carácter | 0,60 | `#F97316` | Personalidad activa (Aurora), timbre de voz, gestos |
| 8 | Contexto | 0,95 | `#06B6D4` | Permisos, accesos y sabiduría de contexto; lo más cambiante |

Un genoma (`Genoma`) es una lista de nodos (`NodoGenoma`: `id`, `capa`, `nombre`, `descripcion`, `parametros`, `enlaces`, `medio?`, `origen: defecto|usuario`). El **genoma base** (`genomaBase()`, id `genoma-base`, versión `1.58.0`) trae 35 nodos de fábrica repartidos por las nueve capas.

**Por qué el núcleo casi no se toca:** es la base matemática de todo lo demás — si la ternaria 1,58 bits o la semilla cambian, cada resultado del sistema deja de ser reproducible y lo construido encima (intuición, carácter, contexto) se invalida. El propio código lo protege por partida doble: `validarGenoma()` emite avisos cuando un nodo de capa con mutabilidad < 0,2 (Núcleo, Propósito, Instinto) tiene `origen: "usuario"`, y el inspector obliga a confirmar cada edición de esas capas. La mutabilidad es pedagógica y de protocolo, no un candado duro.

`validarGenoma()` también comprueba ids repetidos y enlaces hacia nodos inexistentes (errores), y devuelve `{valido, errores, avisos}`.

## 3. Versiones: crear, ramificar, comparar y promover (`src/lib/laboratorio/versiones.ts`, rama `ola/L2`)

Una `VersionLab` es una **instantánea congelada del genoma** (clon profundo), con `padre` (para ramas), `nota` y un contrato de métricas (`latenciaMs`, `tokens`, `aciertos`, `notas`).

- **Crear** — `crearVersion(genoma, nombre, nota)`: congela el genoma actual tal cual está.
- **Ramificar** — `ramificar(versionId, nombre)`: crea una hija cuyo `padre` apunta a la versión de origen, clonando su instantánea; `historia(versionId)` recorre la cadena de padres hasta la raíz (a prueba de ciclos). Así se puede explorar una idea arriesgada sin contaminar la línea principal.
- **Comparar** — `compararVersiones(a, b)`: diff completo campo a campo (nombre, descripción, capa, cada `parametro.*`, enlaces) clasificado en `añadidos`, `quitados` y `cambiados {antes, despues}`.
- **Promover** — `promoverAlOS(versionId)`: **nunca escribe en el OS**; devuelve un `PlanPromocion` con los `cambios` (sistema = capa, clave = id de nodo, valor = parámetros) y `avisos` para cada nodo de capa casi inmutable.

**Por qué promover siempre pide confirmación:** promover vuelca los parámetros del genoma de laboratorio sobre los sistemas vivos de la inteligencia del OS; un error no queda en una pestaña de prueba sino en el comportamiento real de Aurora para el usuario. Por eso el diseño es *plan primero, ejecutar solo con sí humano*: la función no tiene poder de escritura y, además, avisa cuando el cambio toca lo casi inmutable (mutabilidad < 0,2). Es la misma filosofía de «relevo antes del límite» aplicada a la configuración: nada automático sobre lo esencial.

## 4. El banco de pruebas y su aislamiento

El banco de pruebas hoy es **el armazón de versiones**: instantáneas aisladas, ramas, diffs y el contrato de métricas. Editar el genoma activo jamás altera una versión guardada; comparar es gratis y reversible.

**Qué NO toca del OS (aislamiento verificado en el código):**
- **Sin red ni Supabase**: ningún `fetch`, ningún cliente, ninguna tabla. Nada viaja fuera del navegador.
- **Sin configuración viva del OS**: ni `starseed.config.json`, ni `src/lib/astraura/primary-system.ts` / `neuron-persona-store.ts`, ni el router LLM, ni personalidades de producción.
- **Sin datos del usuario**: no lee cuentas, perfiles, corpus ni memoria raíz reales (solo los *nodos del genoma* que los representan).
- **Sin escrituras peligrosas**: `leerAlmacen`/`escribirAlmacen` tragan sus propios errores (JSON roto → empezar de cero; almacenamiento bloqueado → ignorar). El laboratorio nunca rompe la sesión del OS.

**Pendiente del banco:** la ejecución real de casos de prueba (un *runner* que corra el genoma contra casos y produzca las métricas de `VersionLab`). El contrato ya está declarado; falta quien lo llene.

## 5. Cuantización y adaptación por hardware (`src/lib/laboratorio/cuantizacion.ts`)

El Laboratorio decide, **para cada uno de los diez medios**, con qué precisión corre el modelo y a qué nivel, según el equipo. No duplica sondeos: reutiliza la detección de hardware de la Ola 228 (`src/lib/aurora/voz-starseed/capacidades.ts`: RAM, núcleos, WebGPU, WASM SIMD, móvil, demonio local — caché 5 min, sondeo del demonio con límite de 800 ms) y la escala de niveles de `niveles.ts` (estudio · alta · ligera · mínima).

**Franjas de equipo** (`franjaDelEquipo`):
- **Potente** (demonio local + ≥ 8 GB): la **ternaria 1,58-bit corre local** en texto (nivel estudio) y voz (el nivel que sostenga el equipo); el resto de medios a nivel alto.
- **Modesta** (demonio local o escritorio con WebGPU/SIMD): `q4-k-m` en todo y niveles ligeros; la voz al nivel que aguante el equipo.
- **Móvil**: solo lo imprescindible en local (interacción y permisos a nivel mínimo); el grueso se deriva a la nube.

**Precisions** (`PRECISIONES`):

| Precisión | Bits/peso | Memoria relativa | Calidad relativa |
|---|---|---|---|
| **Ternaria 1,58-bit** | 1,58 | 1,58 | 0,92 |
| Q4_K_M | 4,5 | 4,5 | 0,85 |
| Q8_0 | 8 | 8 | 0,97 |
| FP16 | 16 | 16 | 1 (referencia) |

La **ternaria 1,58 bits es la precisión propia del sistema** — pesos `{-1, 0, 1}`, nativa de Astraura 1.58-bit, la más ligera — y es la que el plan asigna en equipos potentes. Regla práctica del código: **nunca fp16 en local**; `q8-0` queda en la tabla como referencia (es la que usa el nivel *estudio* del motor de voz). `estimarMemoria(plan, parametrosPorMedio)` estima los MB por medio y el total (parámetros × bits/8) para avisar **antes** de que el equipo se ahogue.

## 6. El mapa 3D del genoma — cómo leerlo

El genoma está pensado como un mapa de **cáscaras concéntricas**. Las reglas de lectura (definidas en `CAPAS` + `enlaces`; el render 3D propiamente dicho aún no existe, ver §8):

- **Cada cáscara es una capa**: el **Núcleo (0) al centro**, el **Contexto (8) al borde**. Cuanto más cerca del centro, más fundamental y más lenta de cambiar; cuanto más afuera, más viva y reescrita. La mutabilidad es, literalmente, el ritmo al que late cada cáscara.
- **Cada color identifica la capa** (ver tabla de §2): azul cielo `#38BDF8` = lo matemático; ámbar `#F59E0B` = el propósito; rojo `#EF4444` = los reflejos; verde `#10B981` = lo aprendido; violeta `#A855F7` = lo creativo; rosa `#EC4899` = los medios; amarillo `#EAB308` = los datos; naranja `#F97316` = el carácter; cian `#06B6D4` = el momento presente.
- **Cada nodo es un punto en su cáscara**; los de la capa Capacidad llevan además su medio (el inspector los marca con «Medio: …»).
- **Cada enlace es una línea de un nodo a otro** — una «fusión de sistemas»: el inspector los lista, los explica con una frase por capa (`EXPLICA_ENLACE`) y permite añadirlos o quitarlos. Un enlace Núcleo→Creatividad (semilla→temperatura) se lee como «la semilla determinista condiciona la aleatoriedad creativa».

Para explorar el mapa hoy se usa el **inspector de nodo** (`src/components/laboratorio/inspector-nodo.tsx`): seleccionas un nodo y ves **Qué es** (descripción, mutabilidad en %, origen), **Parámetros** (controles por tipo —slider numérico con rango sensato según el nombre de la clave, interruptor booleano, campo de texto—, con «Restablecer» al valor de fábrica del genoma base) y **Conexiones** (enlaces, fusionar nuevos por id de nodo). Toda edición de una capa con mutabilidad < 0,2 muestra aviso ámbar y pide confirmación antes del primer cambio de ese nodo.

## 7. Claves de localStorage usadas

| Clave | Qué guarda | Fuente |
|---|---|---|
| `starseed.laboratorio.genomas.v1` | Mapa `id → Genoma` (todos los genomas, incluido el base) | `genoma.ts` |
| `starseed.laboratorio.versiones.v1` | Mapa `id → VersionLab` (instantáneas, ramas, métricas) | `versiones.ts` (rama `ola/L2`) |

Ambas se leen/escriben de forma tolerante: JSON corrupto o almacenamiento bloqueado nunca lanzan; a lo sumo se pierde lo del laboratorio, jamás la sesión del OS.

## 8. Qué falta

1. **Fusionar genomas entre sí**: `duplicarGenoma` clona un genoma, pero no existe mezclar dos genomas (p. ej. la creatividad de uno con el carácter de otro) con resolución de conflictos por capa.
2. **Entrenar desde el laboratorio**: no hay *runner* que ejecute casos contra un genoma y llene las `metricas` de `VersionLab` (latencia, tokens, aciertos). El contrato está declarado, sin productor aún.
3. **Exportar una versión como modelo cuantizado**: `planPorHardware` decide con qué precisión correría cada medio, pero nada genera aún los pesos exportables (GGUF u otro formato) a partir de una versión.
4. **Fusionar la rama `ola/L2` a `main`**: `versiones.ts` y sus pruebas existen solo ahí (commit `acea347`).
5. **Montar la interfaz**: `InspectorNodo` no está montado en ninguna ruta de `src/app` ni registrado en el OmniDock (`dock-config.ts`) o el catálogo de apps — según CLAUDE.md §11, hoy el laboratorio es invisible para el usuario.
6. **El render 3D del mapa** (three.js) y el **banco de pruebas ejecutable** descritos en §6 y §4.

---

*Bitácora: documento escrito en la Ola 230 (tarea L9) leyendo el código real de los commits L1/L2/L4/L7; pruebas verificadas: 17/17 pasando (`laboratorio-genoma.test.ts` 10, `laboratorio-cuantizacion.test.ts` 7).*
