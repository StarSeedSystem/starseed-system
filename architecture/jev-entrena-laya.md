# Jev entrena a Laya: la libreta de ejemplos con desenlace

> **Contrato JLA1116A (2026-11-16):** Jev y Laya se usan automáticamente e inteligentemente.
> Jev entrena a Laya local mediante una libreta de ejemplos con desenlace real para
> mejorar su estructura y buscar más independencia local. Ambos se usan en MetaGenesis.

## 1. Qué es cada uno y cómo se integran

- **Jev** es un modelo ajeno de decisiones tipadas (`noul`, `choice`, `score`) con probabilidad, no un modelo propio.
  `scripts/puente/jev.py:798` (`decidir`) lo sirve por una pirámide: BitNet local (`:8790`) → Laya local (`:624`) →
  Experiential Labs gratis → OpenRouter `~typesafe/jev-latest` de pago (`:29`), con techo de 0,20 $/día y 2 $/mes
  (`:49-50`) y caché de 6 h. Corre donde corra el director que lo llama (la Mac; también la nube por
  `src/app/api/jev/systemone/route.ts`). Guarda contadores en `~/.starseed/jev-uso.json` y, desde 2026-11-10, la
  captura completa de cada decisión en `~/.starseed/jev-captura/` (`jev_captura.py`, 14 días y 200 MB, fuera del repo).
- **Laya** es un codificador de terceros (ModernBERT, 322-421 M de parámetros; `architecture/laya-y-habilidades.md` §1)
  que responde preguntas tipadas sin generar texto. Lo corre `native/laya/servidor-laya.mjs` (127.0.0.1:4470, ~1,6 GB de
  RAM; 2-3 s por petición en el A1, `laya-y-habilidades.md` §2 y §8). No es un modelo que hayamos entrenado nosotros.
  En la Mac de 8 GB solo se carga con ≥ 2,5 GB libres (`native/laya/README.md`); el 2026-11-10 devolvía 503.
- **Los dos comparten contrato** (`POST /v1/systemone`). Eso es lo que hace posible que uno enseñe al otro.

## 2. Lo que hay hoy para «entrenar» y lo que no (leído, no supuesto)

| Pieza | Estado |
|---|---|
| Captura de las decisiones de Jev con su prompt completo | Existe y enciende por defecto (`jev_captura.py`). |
| Sombra: repetir las decisiones con Needle, Laya y BitNet y medir acuerdo | Existe (`jev_sombra.py:69`), sin veredicto hasta 1.000 llamadas en 5 estratos. Mide si el modelo pequeño sustituye a Jev; no entrena a nadie. |
| Registro de casos de Laya y recalibrado del umbral | El código existe (`aprendizaje-laya.ts:45,65,90`), pero **nada lo alimenta**: `anotar` no tiene llamador fuera de pruebas y el panel recibe un registro vacío (`inteligencia-section.tsx:339`). |
| Cuaderno de afinado de Laya | Citado (`laya-y-habilidades.md:106`), **no existe** en el repo. |
| Fábrica de adaptadores (QVAC, Soup, LlamaFactory) | Módulos puros que preparan configuración (`src/lib/astraura/aprendizaje/`); apuntan a BitNet y bases de Hugging Face, **no a Laya**. No ejecutan nada. |
| Ciclo nocturno de Needle con lo acertado | Anunciado (`metagenesis.md:352`); `experiencias.para_needle` (`:144`) solo tiene llamador en una prueba. No lo encontré programado. |
| Resultados de las decisiones | `decidir.confirmar` solo lo llaman el analista de sueños y la línea de órdenes. Casi todas las experiencias quedan **sin desenlace**. |

**Conclusión: hoy nada entrena ni adapta a Laya, ni Jev ni otra cosa.** Lo que existe mide y registra.

## 3. Qué puede significar con verdad «Jev entrena a Laya»

Laya cabe en 400 MB (int8, navegador) o 1,6 GB (A1); sus pesos no se tocan en un móvil. Hay tres cosas distintas, en
orden de coste, y solo la tercera toca pesos:

1. **Libreta de ejemplos con desenlace.** Cada decisión de Jev (prompt de `jev_captura`) se une a su desenlace real
   (integrada o revertida, acierto confirmado, corrección de Alex). Un ejemplo es: punto de decisión, estado, respuesta
   de Jev, **desenlace**. Es lo que Laya consulta por vecinos más cercanos y lo que se usa para calibrar.
2. **Calibración por punto y ámbito.** Con ≥ 30 casos con desenlace (`MIN_CASOS_UMBRAL`) se recalibra el umbral de cada
   punto de `puntos-decision.ts`. Ya está escrito; falta alimentarlo. Cabe en cualquier aparato: son números.
3. **Afinado o adaptador**, solo en una máquina que pueda: GPU gratuita de Kaggle o Colab, por decisión expresa de Alex
   (`fabricas.ts`: la Mac de 8 GB y el A1 no entrenan, solo preparan). Nunca en un móvil o tableta.

**Regla de verdad:** el maestro no es Jev; es el **desenlace**. Jev se equivoca (en RS3b contestó «descartar» 0,65 con
confianza 0,47 y la regla humana era reintentar; `orquestacion-economica.md` §9). Un ejemplo sin desenlace se guarda
marcado «etiqueta débil de Jev» y no entra en el afinado ni en la evaluación; solo sirve para medir acuerdo. Entrenar a
Laya con las opiniones de Jev la haría heredar sus errores sin saberlo.

No sé si Laya aprovecha ejemplos puestos en su `state` ni cómo se afina su cabeza tipada: el código de entrenamiento de
su repo **no lo he leído**. Por eso la fase 2 lo mide en sombra antes de asumirlo; si no sirve, los ejemplos actúan como
un vecino más cercano al lado de Laya y como calibrador de su confianza, que ya es una mejora honesta.

## 4. Qué puede cada aparato

| Aparato | Hace | No hace |
|---|---|---|
| Mac de 8 GB | Captura, une desenlaces, construye la libreta, mide la sombra (con la máquina libre, `jev_sombra.py`). | Entrenar; cargar Laya si el enjambre escribe (`metagenesis.md`, guardia de memoria). |
| Tableta Android | Consulta la capa de ejemplos de su cuenta (cientos de ejemplos, vecinos por huella de palabras, sin modelo) y calibra; Laya int8 solo si `laya-navegador.ts` lo permite, si no por la malla. | Afinar, guardar la libreta de otra cuenta, cargar WebGPU sin 4 GB. |
| Servidor A1 (CPU, 2 núcleos, ~2 s por petición) | Sirve Laya, recalcula calibraciones, evalúa una capa nueva contra la reserva. | Entrenar pesos. |
| GPU gratuita (Kaggle, Colab) | Afinar y exportar un adaptador cuando Alex lo autoriza. | Ver datos privados: solo recibe el JSONL no privado. |

## 5. Qué se guarda, dónde y quién lo lee

| Ámbito | Qué | Dónde | Quién lo lee | Sale de ahí |
|---|---|---|---|---|
| Personal (cuenta) | Libreta con estado en claro y desenlaces; umbrales | Neuronas de la persona y sus servidores propios | La persona y sus agentes personales | Nunca sin que la persona lo elija |
| Página, grupo, comunidad | Libreta de ese ámbito; umbrales | Servidor de la página | Quien la página decida; entran solo ejemplos públicos o aprobados por la entidad | Solo por decisión de la página |
| Colectivo público | Libreta de decisiones públicas | Malla / A1 | Cualquiera con acceso al ámbito | Sí, sin texto privado |
| Fábrica (desarrollo del OS) | Decisiones del enjambre y sus desenlaces | Mac (`~/.starseed/`), fuera del repo | Alex | No va a informes ni al repo |

Reglas heredadas, no nuevas: lo privado se guarda como huella y no sale en la exportación (`aprendizaje-laya.ts:45,90`);
**un adaptador es un archivo que otros cargan y lo que aprendió se puede recitar**, así que uno de página nunca vio memoria
personal (`destino-adaptador.ts`); el puente de Telegram es el mayor llamador de Jev y sus prompts son privados
(`jev_captura.py`): **no entran en ninguna libreta compartida**. Una capa lleva su procedencia (qué ejemplos, qué
versión), se borra con la cuenta o la página, y ninguna capa se activa sin su SHA en `config/capas-astraura.json`.

## 6. Evaluar antes de reemplazar

Una capa nueva (umbrales, ejemplos o adaptador) sustituye a la vigente solo si, sobre una **reserva** que no usó al
construirse (20 % de los casos con desenlace, fijada por huella y no por sorteo):
1. hay ≥ 1.000 casos repartidos en los estratos, o el informe dice «faltan datos» y no se reemplaza;
2. no es peor en **ningún** estrato (el acuerdo con el desenlace no baja) y mejora en alguno;
3. no deja pasar más «integrar» que se hayan revertido que la vigente;
4. reutiliza los umbrales de `jev_sombra.py:69` (acuerdo ≥ 0,90 en casos confiables, cobertura ≥ 0,40, mediana ≤ 3 s);
5. la vigente se guarda y el retorno es un cambio de puntero, no un reentrenamiento.

## 7. Dentro de la fábrica, y lo que nunca decide Jev solo

Hoy Jev opina en veredictos de bloqueadas, aprobación sola, publicación, elección de escritor tras un fallo, orden de
revisores, triaje de sueños y avisos de Telegram; Laya, solo en la tarjeta de habilidad del escritor
(`habilidades_enjambre.py:72`) y como peldaño de `jev.py`. La regla vigente se mantiene: **consejero con umbral, puede
vetar, nunca convierte un «no» en «sí»; si calla, manda la regla** (`decidir.py`, `autopublicar.py:628`).

**No lo decide Jev ni Laya solo, aunque tengan alta confianza:**
- integrar en `main`, publicar, `git push`, desplegar o lanzar una versión;
- borrar cuentas o datos, o cualquier cosa sin copia;
- bajar la privacidad de algo o decidir qué es privado (Laya midió 0,25 como detector de privacidad);
- gastar dinero o crédito por encima de los techos;
- claves, permisos, reglas de acceso y migraciones;
- si algo «funciona» o «se ve bien»: lo verifican pruebas y verificación en localhost, no un clasificador barato;
- que un informe sea verdadero;
- cambiar sus propios umbrales, capas o la regla de esta lista (el juez no se reajusta solo).

Para esas decisiones pueden **vetar y avisar**, nunca aprobar. La lista vive como código (`jev_reservadas.py`) y la consulta
`decidir.consultar`.

## 8. Fases

1. **Libreta (pequeña, sin entrenar).** Unir captura y desenlace; etiquetar con la regla de verdad de §3; contar por
   estrato y ámbito; alimentar el registro de Laya desde `/api/astraura/decidir`; la lista reservada de §7 como código.
   Salida: contadores, nunca textos.
2. **Calibración y vecinos.** Umbrales por punto y ámbito recalculados; la capa de ejemplos como voto junto a Laya, medida
   en sombra contra el desenlace.
3. **Adaptador fuera de línea.** Con Alex, una vez al mes como máximo, en GPU gratuita, con evaluación de §6.
4. **Capas por cuenta y página**, con el control de §5 en Ajustes.

Cada fase termina con un número medido, no con un «ya aprende».