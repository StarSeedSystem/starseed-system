# Movimiento dibujado en código: el método RISE

> Referencia aportada por Alex el 2026-10-05 (guía «RISE», de Jack Roberts). Esta es la adaptación
> al director de diseño de StarSeed, en nuestras palabras. Se aplica a toda pieza con movimiento:
> héroes animados de la web, fondos de Audiomorphic, transiciones del OS, vídeos y carruseles de
> redes, logos animados, carteles en movimiento e invitaciones a eventos.

## Las cuatro letras, en este orden

- **R · Referencias.** Siempre una referencia real: el ADN de la identidad (`memory/diseno/adn/<slug>/`)
  con su imagen, una captura, un clip o una imagen de estilo. Para una marca externa, su logo, colores
  y tipos se extraen de su web (Firecrawl, formato `branding`, si hay clave; si no, a mano desde sus
  archivos reales). **Nunca** se dibuja un logo de memoria: se usa el archivo real.
- **I · Idea.** Una sola imagen con principio, medio y final, y **un único cambio** en el medio. Duración
  explícita (5–10 s). En bucle, el último cuadro es idéntico al primero.
- **S · Estilo.** Cómo se ve (fondo, tinta, un acento, tipografía, textura) y cómo se mueve (lento y
  suavizado, o seco y rápido; qué se mueve primero). Formatos de salida explícitos.
- **E · Examinar.** La línea que va en **todos** los prompts de movimiento:

  > Dibuja cada cuadro en código desde una sola función `render(t)`. Añade textura real para que se
  > sienta hecho a mano. Antes de parar, revisa los cuadros al 0 %, 25 %, 50 %, 75 % y 100 % y arregla
  > lo que se vea mal.

## Contrato técnico de una pieza con movimiento

- Un archivo HTML con un `<canvas>` (o un componente React que lo envuelva) y una función **pura**
  `render(ctx, t, tema, w, h)`: el mismo `t` da siempre el mismo cuadro, en cualquier orden.
- Aleatoriedad solo con un hash con semilla; **nunca** `Math.random` dentro de `render`.
- `tema = {fondo, tinta, acento, acento2, fuente}` sale de los tokens de la identidad, no de hex sueltos.
- Funciona en 16:9, 9:16 y 1:1 **recomponiendo la escena**, nunca recortándola.
- Respeta `prefers-reduced-motion`: ofrece un cuadro fijo representativo.
- Expone `window.__render(t)` (o `?t=` en la URL) para que el verificador pida cuadros concretos.
- En la web, el texto importante (titular, botones) sigue siendo HTML real encima del lienzo.

## Estilos de partida (inspiración, no plantillas)

Notas de campo (papel marfil, tinta, un acento arcilla, haz que recorre), pizarra de carbón con
calibre (dos tamaños de letra, acentos solo como trazos), cartel suizo cinético (rejilla de 12
columnas, una palabra enorme, un disco como único color, onda de peso tipográfico), tinta sumi
(un trazo en un aliento, floración con línea de marea, un sello), capas de papel recortado
(paralaje, sombras reales, bordes de tijera) y risografía a dos tintas (12 cuadros por segundo,
desregistro sutil). Cada uno se adapta a la identidad de StarSeed que toque; la geometría sagrada
de `memory/diseno/armonia.md` puede ser la estructura del movimiento (espiral áurea como trayectoria,
vesica piscis como transición, Flor de la Vida como crecimiento).

## Las diez señales que se revisan antes de publicar

1. **Letras cortadas:** interlineado ≥ 1,1; revisar g, j, p, q, y.
2. **Palabra sola en una línea:** reescribir o unir las dos últimas palabras.
3. **Escenario vacío:** lo visual ocupa del 80 al 95 % del escenario.
4. **Color plano:** la luz cae a lo largo del cuadro; ningún relleno uniforme.
5. **Movimiento lineal:** todo entra y sale suavizado; nada a velocidad constante.
6. **Costura del bucle:** el último cuadro coincide con el primero, píxel a píxel.
7. **Texto demasiado breve:** cada palabra en pantalla al menos 1,2 s.
8. **Logos falsos:** el archivo real, nunca dibujado de memoria.
9. **Fondo recargado:** una idea sobre un fondo tranquilo.
10. **Sin textura:** grano y ruido sutil reales.

Las señales 1–6 y 10 las mide un script sobre los cinco cuadros (`diseno_movimiento.mjs`); 7 se
calcula si la pieza declara su línea de tiempo de texto; 8 se comprueba contra los archivos de marca
del repo; 9 la juzga el juez visual.
