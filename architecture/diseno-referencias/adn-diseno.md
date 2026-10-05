# ADN de diseño: convertir un diseño bueno en una skill permanente

> Referencia aportada por Alex el 2026-10-05 («Design DNA»). Esto es la adaptación al director de
> diseño de StarSeed, en nuestras palabras. Se aplica a todo lo que construye la flota: pantallas,
> carteles, carruseles, vídeos de redes y presentaciones. El formato es una salida; el ADN es el
> sujeto.

## Por qué

Un bucle de diseño encuentra un resultado bueno. Si nadie escribe **por qué** es bueno, la siguiente
petición «con el mismo estilo» deriva hacia la media de todo lo que el modelo ha visto. Esa media es
lo que se llama *slop*. Cada regla que no escribimos, el modelo la adivina, y adivina la media.

## Lo que de verdad lleva la identidad

1. **Proporciones, no valores.** «El titular mide 8× el cuerpo, nunca menos de 6×» es estilo; «96 px»
   no lo es.
2. **Cobertura, no solo colores.** Los mismos tres colores al 60/30/10 y al 90/8/2 son dos diseños.
   Siempre se anota qué porcentaje de la superficie ocupa cada rol.
3. **La jugada rara.** Casi todo diseño memorable rompe su propio sistema exactamente una vez (texto
   que cruza una imagen, una línea que sobrepasa el margen, un número cortado por el borde). Es lo
   primero que se pierde al copiar, así que tiene su propia casilla.
4. **Las negativas.** Listar seis colores autoriza seis. Si el original usa un acento en el 3 % del
   lienzo, su contenido real es una negativa. Se escriben.
5. **La ausencia.** Sin sombras, sin iconos, sin curvas, nada centrado: también son decisiones.
6. **Composiciones con nombre (arquetipos).** Sin nombres, la pantalla 8 no casa con la 1.

## Dos documentos, no uno

| | `dna.json`: el registro | `PROMPT.md`: la carga para el modelo |
|---|---|---|
| Lo lee | Alex, el director y las herramientas | El modelo que escribe |
| Tamaño | El que haga falta | **Tope duro: 2 KB** |
| Contiene | Todo valor medido | Imagen de referencia, jugada rara, 3–9 jugadas, prohibiciones, un ejemplo |
| Regla | Nunca entra en un prompt | Nunca va sin la imagen |

El tope es real: cuantas más reglas, menos se cumplen, y lo que queda en medio de un texto largo se
recupera mucho peor que lo de los extremos. El estilo fino apenas cabe en palabras; por eso **la
imagen de referencia va siempre** (cuesta casi nada y viaja por otro canal).

## Esquema de `dna.json`

`meta` (nombre, slug, fuentes, fecha, medio de origen, `no_copiado`: logos y fotos con licencia),
`alma` (una línea ≤160 caracteres, 3–5 adjetivos, linaje, distancia de lectura, energía 1–10 de
densidad, variación, contraste y calidez), `paleta` (rol, hex, **nombre descriptivo** como «ciruela
polvorienta», nunca «accent-500»; `cobertura` en % que suma ~100; comportamientos prohibidos),
`tipo` (familias con **fallback obligatorio**, pesos, `ratio_display_cuerpo`, pasos, máximo de
tamaños por cuadro, tracking, interlineado, caja, medida), `espacio` (rejilla, márgenes y medianiles
**en %**, alineación, ritmo, dónde está el vacío, zonas seguras), `superficie` (textura, bordes,
elevación, tratamiento de imagen, iconografía), `firmas` (3–9: jugada, cómo **como proporción**,
cuándo, cómo se usa mal), `jugada_rara` (qué, cómo, por qué), `arquetipos` (id, función, anatomía,
presupuesto de contenido), `movimiento` (curvas, duraciones, entradas, qué **nunca** se mueve,
alternativa con movimiento reducido), `voz` (registro, longitud de frase, forma del titular,
palabras prohibidas), `prohibiciones` (≥5, absolutas), `pruebas` (≥8: id, comprobación, cómo se ve el
fallo, `auto` si un script la decide), `reconstruccion` (intentada, huecos encontrados, pasadas).

En StarSeed los porcentajes y proporciones se cruzan con `memory/diseno/armonia.md`: cuando el
original ya sigue φ o Fibonacci, la firma se escribe como esa relación.

## Prohibir gana a pedir

Cuando la salida sale genérica, **no se añade una regla positiva: se añade una prohibición**. Una
positiva es un voto débil contra la media del entrenamiento; «nunca centres el héroe» borra esa
opción de golpe. Además, una prohibición se comprueba con sí o no. En un ADN sano las prohibiciones
superan en número a las reglas positivas de estilo.

## Pruebas que pueden fallar (8–12)

Binarias y medibles. Ejemplos: el acento cubre menos del 8 % del lienzo; no más de 3 tamaños de
letra por cuadro; la proporción mayor/menor del texto supera 6:1; el texto más pequeño mide al menos
28 px a 1080 px de ancho; la jugada rara aparece exactamente una vez; el cuerpo no pasa de 65
caracteres por línea; entornando los ojos a tres metros, la masa cae donde en la referencia.
«Se siente premium» no es una prueba: si dos personas pueden discrepar, no vale.

## El paso que nadie hace: reconstruir y comparar

Se reconstruye el original **solo con el ADN**, sin mirar la referencia. Se ponen lado a lado y se
listan todas las diferencias. Cada diferencia es un campo que faltaba: se añade y se repite (suelen
hacer falta 2–3 pasadas). Un ADN que nunca reconstruyó su propia fuente no está probado.

## Lo que se emite (una carpeta por estilo)

```
memory/diseno/adn/<slug>/
  SKILL.md        cómo usar este estilo
  PROMPT.md       la carga de 2 KB; ES lo que entra en el contexto
  dna.json        el registro completo; NUNCA va en un prompt
  referencia/     el original, para siempre
  ejemplo/        una salida resuelta: la prueba canónica
  check.py        las pruebas automáticas; sale con código ≠ 0 si alguna falla
```

Orden de `PROMPT.md` (la atención es más fuerte en los extremos): 1) la imagen de referencia, primero
y con nombre; 2) `alma.una_linea`; 3) la jugada rara, sola; 4) las 3–9 firmas como proporciones;
5) las prohibiciones; 6) paleta y tipo, solo roles y cobertura; 7) arquetipos y cuándo usar cada uno;
8) la autocomprobación, al final. Para añadir una décima firma hay que quitar otra. Termina siempre
con: «Antes de devolver nada, ejecuta cada prueba de la autocomprobación y nombra su resultado. Si
alguna falla, repara y vuelve a probar. Nunca devuelvas una salida con una prueba fallida y una nota
que la justifique».

## Reglas del analista

Nunca inventar un valor que se puede medir (si no se puede medir, se marca `inferido`). Nunca copiar
logos, marcas, fotos con licencia ni tipografías propietarias de terceros: se copia el **sistema**,
no las **marcas** (las marcas propias de StarSeed sí se usan, desde sus archivos reales). Nombres de
color descriptivos. Toda familia tipográfica con fallback. Un ADN por estilo: la media de dos buenos
diseños es un mal diseño. Al terminar, listar lo inferido y toda regla con menos del 70 % de
confianza: es por donde empezará la deriva.

## Diagnóstico rápido

| Se ve | Causa | Arreglo |
|---|---|---|
| Cumple todos los valores y aun así es genérico | Faltan firmas o sobran | 3–9 firmas, como proporciones |
| Vuelve al aspecto IA de serie | Pocas prohibiciones | Más prohibiciones que reglas positivas |
| La pantalla 1 y la 8 no casan | Sin arquetipos | Nombrar las composiciones |
| El acento parece un tema | Sin cobertura | Porcentajes por rol |
| Va en escritorio y se rompe en móvil | Espacios en px | Pasar a % |
| Cumple unas reglas sí y otras no, al azar | Prompt por encima del tope | Recortar a 2 KB |
| La mejor regla se ignora | Está en medio | Llevarla arriba o abajo |
| Correcto pero olvidable | Sin jugada rara | Encontrar la ruptura |
| El ADN parece completo y la salida falla | No se reconstruyó | Reconstruir y comparar |
