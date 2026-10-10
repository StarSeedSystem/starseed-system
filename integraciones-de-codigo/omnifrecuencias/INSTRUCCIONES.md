# Omnifrecuencias · «Transmitir en directo en una estación de StarSeed OS»

Para el repo **StarSeedSystem/generador_frecuencias** (la app oficial, `omnifrecuencias.vercel.app`).
Lo aplica el director: desde el contenedor de StarSeed OS ese repo no es accesible, así que aquí va
el código listo y los pasos exactos. Contrato en el repo del OS:
`architecture/estaciones-en-vivo-parametricas.md` (§7, protocolo `postMessage` v1).

## Qué consigue

- En **Entonaciones › Comunidad**, el botón **«Transmitir en directo en una estación de StarSeed OS»**
  (pública o privada).
- **Dentro de StarSeed OS** (la app abierta en su marco en `/omnifrecuencias` o en la ventana
  del escritorio): el OS crea la estación con la entonación actual, la publica en *Transmisiones* (si es
  pública), y la app enseña su estado en vivo (fase, precisión medida del reloj común, conectados) con
  **Iniciar/Pausar/Reanudar para todos**. Cambiar la entonación en la app la cambia para todos.
- **Fuera del OS** (web suelta o app nativa): abre `https://starseed-os.vercel.app/estaciones?nueva=omnifrecuencias#p=…&t=…&e=…`
  con la entonación ya puesta en «Nueva estación».

Viaja la entonación (parámetros) y una línea de tiempo con instantes en un reloj común, no el audio.
El sonido lo genera cada aparato. Por defecto lo genera el **OS** (`suena: false`); la app no suena
doble.

## Pasos

1. Copia los dos archivos de esta carpeta al repo de la app, en la carpeta donde viven `App.tsx`
   y `types.ts` (en el port del OS es la raíz de `frecuencias/`; en el repo, `src/`):
   - `estacion-starseed.ts` → `src/lib/estacion-starseed.ts`
   - `TransmitirEnStarSeed.tsx` → `src/components/TransmitirEnStarSeed.tsx`
   Si tu carpeta no es `src/lib`, corrige el import de la línea
   `from "../lib/estacion-starseed"` en `TransmitirEnStarSeed.tsx`.

2. En el componente que pinta **Entonaciones › Comunidad** (búscalo con
   `grep -rn "Comunidad" src/` — no se ha podido ver el repo desde aquí, así que el ancla es esa
   sección, no un número de línea), añade:

   ```tsx
   import { TransmitirEnStarSeed } from "./TransmitirEnStarSeed"; // ajusta la ruta relativa
   import { useAudio } from "../hooks/useAudio";                   // la app ya lo tiene

   // dentro del componente:
   const { oscillators, masterVolume } = useAudio();

   // en el JSX de la sección Comunidad, junto a la entonación elegida:
   <TransmitirEnStarSeed
     osciladores={oscillators}
     volumen={masterVolume}
     titulo={entonacion.nombre}        // el nombre de la entonación que se está viendo
     enlace={enlaceDeLaEntonacion}      // su enlace público en omnifrecuencias.vercel.app
   />
   ```

   `oscillators` tiene la misma forma que `OsciladorApp` (es el `OscillatorState` de `types.ts`).

3. Si despliegas el OS en otro dominio, añádelo a `ORIGENES_OS` en `estacion-starseed.ts`. La app
   solo acepta respuestas de esos orígenes y solo manda datos al origen que contestó el saludo.

4. Para probar la app en local DENTRO del OS en local, arranca el OS con
   `NEXT_PUBLIC_ORIGENES_PUENTE_ESTACION=http://localhost:5173` (o el puerto de la app): el OS solo
   atiende a las webs oficiales y a los orígenes de esa variable (https, o http a localhost).

5. Comprueba: abre StarSeed OS → Omnifrecuencias (versión oficial) → Entonaciones › Comunidad →
   «Transmitir en directo». Debe salir el enlace y «Lista para empezar · reloj común ± x ms». En otra
   pestaña o aparato abre ese enlace: al pulsar «Iniciar para todos» empieza a la vez en los dos.

## Si la app quiere sonar ella misma (opcional)

Crea el puente con `new EstacionStarSeed({ suena: true })`: el OS se silencia en esa pestaña
mientras la app dé latidos (cada 5 s). Para que suene a la vez que los demás, programa el audio
con el reloj común:

```ts
const t = estado.ancla;                        // instante común en que la reproducción vale 0
const inicio = puente.aTiempoAudio(ctx, Math.max(t ?? 0, puente.ahoraComun() + 50));
osc.start(inicio);
```

`puente.precisionMs()` es el error del enlace con el OS (microsegundos por `postMessage`) y es
`null` mientras el OS no tenga hora común de una estación. La precisión de la estación es la que
enseña `estado.reloj` (± medido y su cota).

## Protocolo (resumen)

`{ ss: "estacion", v: 1, tipo, … }` en los dos sentidos.

| app → OS | OS → app |
|---|---|
| `hola {app, suena}` | `bienvenida {capacidades, estacion}` |
| `latido {suena}` | — |
| `reloj-ping {id, t0}` | `reloj-pong {id, t0, t1, t2, comun}` (t1/t2 en hora común) |
| `crear {titulo, enlace, osciladores, volumen, privada}` | `creada {id, enlace, enlaceControl, directorio}` o `error {motivo}` |
| `sintonizar {enlace}` | `estado {estacion}` (en cada cambio, ≤ 4/s) |
| `accion {accion, osciladores?, volumen?}` | `resultado {ok, motivo?}` |
| `salir {}` | `estado {estacion: null}` |

`enlaceControl` lleva la llave de la estación: sirve para controlarla desde otro aparato tuyo.
No lo publiques.
