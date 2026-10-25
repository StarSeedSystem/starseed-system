# Ritmo y continuidad de la toma única

Para los diseñadores de vídeo de StarSeed: cómo se encadena una pieza hecha en una sola toma
continua —intros, vídeos de programas, demos de productos del OS— en vez de una pila de escenas
con fundidos. Lo que ya está dicho en `fundamentos-diseno.md` (§4 y §5: transiciones y elemento
compartido) no se repite aquí; este documento baja al reloj: qué pasa exactamente en cada límite
entre planos y con qué ritmo.

## 1. La toma continua

- **Idea central:** cada plano nace de algo que sobrevive del anterior y se transforma. Una barra
  que se abre en una ventana de Genesis; una línea que se estira hasta volverse rejilla; un punto
  que se cierne hasta ser el símbolo. El plano siguiente ya estaba dentro del anterior.
- **Contraste con la pila de escenas:** si cada escena es una isla con su fundido, la pieza se lee
  como diapositivas encadenadas: en cada corte el ojo repunta de cero y el conjunto no acumula. En
  la toma continua sí: al final de la pieza, cada elemento guarda su historia.
- **Consecuencia práctica:** no se piensa «escena 1, escena 2…» sino «qué viaja» — un elemento o
  un encuadre viajan y el contenido del plano cambia alrededor de su llegada.

## 2. La regla del límite entre planos

Antes de animar nada, para cada límite entre planos se escriben (en el guion de la pieza,
`formatos-y-guiones.md`) las tres cosas:

1. **Qué sobrevive:** el elemento (o el encuadre) que cruza el corte, con su color y papel exacto.
2. **En qué se convierte:** el elemento de llegada en el plano siguiente, ya dentro de la escena nueva.
3. **Cuánto dura:** la transformación, en milisegundos, y en qué parte del límite ocurre.

- Si un límite no tiene nada que sobreviva, o se le da un sobreviviente, o se declara corte duro
  con significado (§5). Un límite «porque toca» no pasa la revisión de §6.
- No se cierra un plano sin haber abierto su sucesor: la transformación ocurre cruzando el límite,
  no a uno de sus lados.

## 3. La cámara

- **Se adelanta al sujeto:** el movimiento empieza antes que la acción y conduce hacia donde caerá
  lo siguiente; el ojo ya llegó cuando el elemento aparece.
- **Latigazo hacia lo que viene:** la sacudida rápida de cámara es el cambio de escena legítimo
  de la toma única; su desenfoque tapa el cruce y da impulso al plano nuevo. Dura lo más corto del
  vocabulario del ADN (propuesta: del orden de 140–240 ms, en el rango rápido).
- **Vibra solo cuando algo golpea:** la sacudida va atada a un golpe visible en pantalla. Sin
  golpe, sin vibración: el «efecto cámara» vacío es ruido.
- **Se queda quieta para que aterrice:** tras el latigazo o el golpe, cámara quieta; el resto de
  la escena (entradas secundarias, asentamientos) puede seguir moviéndose alrededor.

## 4. Los descansos

- **Regla:** tras cada golpe fuerte (un latigazo, un impacto que abre plano, la llegada de un
  elemento protagonista) va un silencio —sin música ni voz— o un plano quieto de **400–900 ms**.
- El descanso es lo que hace que el movimiento aterrice y que el ojo lea la escena nueva; sin él,
  dos golpes seguidos se sienten como un solo empujón confuso.
- No todo movimiento es un golpe: entradas secundarias y movimientos de fondo no llevan descanso
  propio; solo los fuertes.

## 5. Cortes duros solo con significado

- Un corte duro (sin transición, sin sobreviviente) vale solo cuando cambia el **tema**, no el
  decorado: un capítulo nuevo, un cambio de pregunta o de protagonista.
- Si el límite se resuelve con continuidad, gana la continuidad; los fundidos y barridos se
  reservan para lo que ya define `fundamentos-diseno.md` §5 (una jugada rara por pieza).
- El corte duro también se descansa: el plano que sigue arranca con su primer movimiento, no con
  todo relleno de golpe.

## 6. Cómo se mide: fotograma a fotograma en cada límite

Con lo que ya tenemos (`hyperframes`, Apache-2.0; el detalle en `herramientas.md`):

1. **Render borrador:** `npx hyperframes render <dir> -o out.mp4 -q draft`.
2. **Capturar el par de cada límite:** para un corte en 23 s a 30 fps, último fotograma antes y
   primero después son `22.9667` y `23` —
   `npx hyperframes snapshot <dir> --at 22.9667,23 --no-end -o stills/` (las parejas de toda una
   tirada van en la misma orden). Es el control que ya pide el checklist de `hyperframes`.
3. **Comparar cada par** lado a lado o superpuesto: ¿el sobreviviente sigue legible como el mismo
   en ambos fotogramas? ¿el encuadre ya apunta a la llegada? El contrato de esta ola llama
   `compare` a la orden de comparación; en la documentación local de la versión instalada **no
   consta** esa suborden (pendiente de comprobar sobre el CLI real), así que la comparación es de
   momento visual: los dos fotogramas superpuestos o en mosaico.
4. **Llenar la tabla** y dar la pieza por buena solo cuando todos sus límites pasan:

| Límite | Qué sobrevive | En qué se convierte | Duración | Pasa o falla |
|---|---|---|---|---|
| (segundo en que ocurre, ej. 23,000 s) | (elemento que cruza) | (elemento en la escena nueva) | (ms de la transformación) | pasa / falla: por qué |

- **Fallas típicas:** el sobreviviente desaparece un fotograma (no es continuo: es un corte
  disfrazado); cambia de color o de token y ya no se reconoce; la transformación dura menos de lo
  escrito en el guion; falta el descanso tras el golpe o se pasa del rango.

## 7. En StarSeed: duraciones, composición y material

- **Duraciones del ADN** (`adn-y-tokens.md` §5): la toma única no estira nada, encadena. En
  interfaz, 140–350 ms (140 rápido, 220 orgánico, 240 normal); en vídeo, 600–900 ms por entrada;
  la transformación en un límite usa el rango de cambio de escena (propuesta: 400–600 ms). El
  descanso de §4 entra en el presupuesto total de la pieza.
- **Composición centrada** (Alex, 2026-10-19, §7b): lo que sobrevive viaja por el eje óptico
  central, no por una esquina vacía; la llegada ocupa el centro de la escena nueva.
- **Una pieza con brillo multicapa por plano:** el resplandor protagonista no se duplica en dos
  escenas ni se enciende a la vez en ambos lados del límite; si el destacado es el sobreviviente,
  su brillo viaja con él y el plano que queda atrás se apaga (opacity, nada más).
- **Curvas y canales:** las curvas del ADN (`--ease-organic`, `--ease-glide`) en toda
  transformación, y solo `transform` y `opacity`: posición, escala, rotación y opacidad; nunca
  dimensiones ni márgenes.
- **Herramientas:** `claude-video-studio` (montaje y base de composición) y `hyperframes`
  (escenario HTML, lint de contraste y movimiento, snapshot por fotograma, render determinista).
  Sus reglas de determinismo y de fuentes mandan sobre lo descrito aquí.

## 8. Lo que no se hace

- Apilar escenas inconexas con un fundido a negro en cada corte: es la plantilla por defecto, no
  un ritmo.
- Acabar la animación de salida de un plano antes de que exista el sucesor: el hueco se nota.
- Corte duro decorativo, o un latigazo que no anticipa nada de lo que viene después.
- Falsa continuidad: un elemento cruza pero cambia de familia de color o de papel sin motivo, y el
  ojo ya no lo sigue.
- Vibrar la cámara sin golpe, o dar un golpe sin su descanso de 400–900 ms.
- Instalar, copiar ni ejecutar nada de onetake (licencia no comercial; ver su fila en
  `licencias-y-guardas.md`): su idea vive aquí, reescrita, y se ejecuta con nuestras herramientas.

---

> Idea de las películas de una sola toma (onetake, PolyForm Noncommercial 1.0.0; solo enlace, sin texto ni código copiado).
