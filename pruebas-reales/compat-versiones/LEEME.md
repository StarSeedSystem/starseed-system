# «Código nuevo contra el último publicado» (LLA1114B)

**Regla permanente: ningún cambio de llamadas (`src/lib/llamadas/**`) ni de malla (`src/lib/malla/**`) entra en main
sin pasar esta prueba.** La corre la puerta de integración y la CI (`.github/workflows/ci.yml`, bloque `# LLA1114B`).

Por qué: la app nativa carga el código de llamadas de la web publicada y cada aparato toma la build nueva una o dos
aperturas después; en una llamada, las dos neuronas corren a menudo builds distintas. Alex, 13-11: «no debería importar
la versión: siempre debería funcionar aunque las neuronas tengan diferentes versiones».

## Correrla (una orden, sin Chromium, sin `npm install`)

```sh
node pruebas-reales/compat-versiones/correr.mjs            # desde la raíz del repo; sale con 0 (BIEN) o 1 (FALLA)
node pruebas-reales/compat-versiones/correr.mjs --solo regresion --segundos 60 --json /tmp/compat.json
```

Necesita node ≥ 20, git y el `esbuild` que ya está en `node_modules` (dependencia de Next). Tarda unos 15–25 s en un
contenedor de 2 CPU (24 llamadas simuladas de 90 s, con un reloj de banco: no espera tiempo real) y menos de 300 MB.

Salida: una línea por pareja, carril y sentido, y la última con el veredicto:

```
publicado 580b0157a6 · mac-tableta41 · trabajo→580b0157a6 (Mac→tableta): vídeo 6,17 fps (mismo código 5,81) · voz a tiempo 89,3 % (mismo código 89,8 %) · BIEN
…
anuncio · trabajo↔9b3bed477a · A: capacidades mias=ciclo-reparto,colgar-reintento,anuncio web=… otro=- web-otro=? comunes=ninguna (otro sin anuncio: base)
compat-versiones BIEN · 90 s de llamada por pareja · 13 s
```

## Qué hace

1. **Las parejas.** (a) El **último publicado**: el `sha` de `https://starseed-os.vercel.app/version.json` si responde y
   ese commit está en el repositorio; si no, `origin/main` (la línea final dice cuál y por qué). (b) La **pareja fija de
   la regresión** `9e489e8d^` (= `9b3bed477a…`, el código que corría la tableta el 13-11). Si no se puede resolver alguna,
   la prueba **FALLA** diciendo por qué; nunca pasa en silencio.
2. **Los árboles viejos** salen de git (`git archive <sha> src/lib/llamadas src/lib/pwa/build-corriendo.ts`) a
   `pruebas-reales/compat-versiones/.cache/` (ignorada), nunca copiados a mano dentro del repo.
3. **Cada lado** es `lado.ts` empaquetado con esbuild contra SU árbol (`@/` → ese árbol): la voz por datos
   (`SesionVozDatos`) y el vídeo ligero (`SesionVideoDatos`) de verdad, que son los módulos que hablan en el enlace; micro,
   Opus, cámara y códec de vídeo son de mentira (los tamaños siguen a la escalera de cada lado). Cada lado se carga como
   módulo aparte (como dos aparatos: nada de estado de módulo compartido).
4. **El carril** es el `bleReal` calibrado de `pruebas-reales/llamadas-medio/entrada.ts` sobre un reloj de banco
   determinista: parada y espera, cubeta de escrituras (7,2/s), control > voz > vídeo, cifrado, señalización y espejo del
   registro por el mismo enlace, sin medida nativa en la web. Dos carriles: **mac-tableta41** (B como la tableta del 13-11:
   acuse 70 + Exp(45) ms, paradas) y **mac-mac** (los dos lados como la Mac: así el vídeo en el sentido B→A también se ve).
5. **El juicio.** Para cada pareja, carril y sentido, lo que da la mezcla se compara con **el mismo sentido y carril con
   los dos lados en el código del que manda** (la versión del que recibe no debe importar):
   - vídeo (fps pintados desde los 20 s) ≥ 60 % del de referencia − 0,3 fps. Por qué: en el aparato el sentido que se hundió
     dio el 4 % (84 → 3 imágenes); la Mac → tableta dio el 76 % (5,5 → 4,2 imágenes/s) con la radio compartida, que el banco
     no tiene. El 60 % deja sitio a eso sin dejar pasar un hundimiento; el margen evita juzgar ruido cuando la referencia ya
     es casi 0;
   - voz (unidades de 20 ms que llegan con ≤ 400 ms) no más de 5 puntos por debajo de la referencia;
   - con el código de trabajo en los dos lados, cada lado tiene que haber anotado su línea `capacidades … comunes=todas`.

Comprobado que salta: con un cambio de formato que un aparato anterior no entiende (el campo `c` del fragmento de vídeo
renombrado, el receptor nuevo leyendo los dos), la prueba da `FALLA: vídeo 0 fps < 3,19` en trabajo→viejo y sale con 1.

## Qué NO prueba

La radio (el aire compartido entre los dos sentidos: lo que uno manda alarga el acuse del otro), WebRTC, la
señalización, el motor (`MotorLlamada`) y los códecs de verdad. Para eso está el banco de Chromium
(`pruebas-reales/llamadas-medio/`), que también sabe mezclar builds:

```sh
cd pruebas-reales/llamadas-medio
node construir.mjs ../.. salida-mezcla/banco.js <otro-árbol>   # lado A: este árbol; lado B (la tableta): <otro-árbol>
cp index.html salida-mezcla/ && node correr.mjs salida-mezcla ble-tableta-41 120
```

`<otro-árbol>` sale igual de git: `mkdir -p /tmp/viejo && git archive 9e489e8d^ src/lib | tar -x -C /tmp/viejo`.

## Capacidades

La lista y la regla para añadir una están en `src/lib/llamadas/capacidades.ts`. Cada lado anuncia sus capacidades y su
build (`web=<compilación>/<sha>`) en el saludo de la voz por datos; un lado que no anuncia es la base (lo de antes de
LLA1113C); lo que necesita la cooperación del otro solo se usa si los dos lo anunciaron. Una línea por sesión en
`enlaces.log`: `llamada · … · medio=enlace-datos voz-datos capacidades mias=… web=… otro=… web-otro=… comunes=…`.
