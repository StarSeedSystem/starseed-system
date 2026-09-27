# Widgets de forma libre, pantalla de inicio y pantalla de bloqueo (Olas 380–383 · 2026-09-27)

SOP de la ola. Pedido de Alex, en sus palabras: rediseñar **todos** los widgets, en **cada tamaño** y para
**todo tipo de pantalla** (móvil, tablet, computadora y, pronto, VR/AR con los mismos elementos
virtualizados en 3D); **sin marco ni fondo** — «más como PNG con cualquier forma» —, muy creativos,
dinámicos, interactivos, animados con transiciones fluidas, en 3D y a color, que **cambien con la
información** de cada widget y que sean **ligeros** para el procesador. Entre un widget y otro no
tiene que haber relación de diseño salvo la estética e identidad de StarSeed. Además, dos opciones
nuevas que se preguntan **al terminar cada perfil** y **al configurar cada neurona nueva**:
**pantalla inicial** (cualquier página del OS; por defecto, el dashboard principal que el usuario
edita) y **pantalla de bloqueo** (contraseña o identificador biométrico verificado).

## Punto de partida (medido el 2026-09-27)

- 104 tipos de widget (`dashboard-types.ts`, `widget-registry.tsx`, `widget-manifest.ts`); el
  escritorio (`/escritorios`) reutiliza el mismo registro (`desktop-widget-host.tsx`).
- El marco rectangular lo dibujan `kit/widget-shell.tsx` (cabecera, fondo de cristal, borde,
  sigilo) y `kit/marco-widget.tsx` (estados cargando/vacío/error/listo). El tema entra por
  `useAppearance().config.widgets` (`bgStyle`, `borderStyle`, …).
- Tamaños: `react-grid-layout` (12/10/6/4/2 columnas) + etiqueta S/M/L/XL (`dashboard-size.ts`) +
  tamaño medido por widget (`useElementSize` → `tier`).
- 3D: `@react-three/fiber` + `drei`; WebXR propio (`use-webxr.ts`); **no** hay `@react-three/xr`.
- `src/app/page.tsx` redirige siempre a `/escritorios`: **no existe** pantalla inicial configurable.
- **No existe** pantalla de bloqueo, PIN, WebAuthn/passkey ni biometría nativa (Tauri solo trae
  `updater`).

## Principios de diseño (valen para cada widget)

1. **Sin marco ni fondo.** El widget es una **forma**: orbe, gota, hexágono, pétalo, cristal
   facetado, onda, órbita, cápsula, estrella suave, mancha orgánica… o ninguna (el contenido flota
   solo). La forma se dibuja con un trazo SVG generado (máscara/`clip-path`), no con una caja.
2. **La forma habla del dato.** El clima cambia de forma con el tiempo que hace; las notificaciones
   crecen en burbujas; el reloj orbita. Cada widget tiene su **personalidad de movimiento**
   (pulso, flotar, orbitar, latido, ola).
3. **Cada tamaño es un diseño, no una escala.** Clases: `micro · s · m · l · xl · panorámico ·
   torre`. En micro basta un dato; en xl cabe una escena. Se deciden por el tamaño medido, no solo
   por la etiqueta del grid.
4. **Identidad StarSeed**: paleta Trinity (Zenith `#007FFF`, Horizon `#39FF14`/`#10B981`, Logic
   `#FFBF00`/`#D4AF37`, Anchor `#DC143C`) + violeta→turquesa `#7c5cff→#23d5ab`, brillo líquido,
   halos de color en vez de bordes, tipografía del sistema.
5. **3D ligero**: profundidad con transformaciones CSS (`perspective` + inclinación ≤ 8° al puntero
   o giroscopio) y capas con parallax; nada de WebGL por widget en 2D. En VR/AR el MISMO widget se
   monta como panel flotante (drei `<Html transform>`) en un arco alrededor de la persona.
6. **Presupuesto de render** según el dispositivo (`nivelRender`: ligero · normal · pleno) y
   `prefers-reduced-motion`: en «ligero» no hay parallax ni partículas; las animaciones van por
   `transform`/`opacity` (compositor), nunca por `top/left/width`.
7. **Datos honestos**, como siempre: sin dato se dice «sin dato».
8. **Accesible**: contraste AA sobre cualquier fondo (sombra de texto/halo), foco visible, etiqueta
   de texto real para lectores de pantalla aunque la forma sea decorativa.

## Arquitectura

| Pieza | Archivo | Qué hace |
|---|---|---|
| Formas | `src/lib/widgets/forma/formas.ts` | `trazoForma(tipo, w, h, semilla)` → `d` de un path SVG determinista |
| Tamaños | `src/lib/widgets/forma/tamanos.ts` | `claseDesdePx`, `claseDesdeGrid`, `claseDispositivo` |
| Presupuesto | `src/lib/widgets/forma/nivel-dispositivo.ts` | `nivelRender(señales)` → ligero/normal/pleno + presupuesto |
| Asignación | `src/lib/widgets/forma/asignacion.ts` | forma y movimiento por defecto de cada uno de los 104 tipos |
| Envoltura | `src/components/widgets-libres/widget-libre.tsx` | forma + halo + inclinación 3D + entrada animada, sin caja |
| Interruptor | `kit/widget-shell.tsx` | `appearance.widgets.marco: "libre" \| "clasico"` (por defecto «libre») |
| XR | `src/components/widgets-libres/widget-xr.tsx` + `xr-disposicion.ts` | el mismo widget como panel 3D en arco |
| Pantalla inicial | `src/lib/inicio/pantalla-inicial.ts` | preferencia por perfil y por neurona; la neurona manda |
| Inicio sencillo | `src/components/inicio/*` + `src/app/(app)/inicio/page.tsx` | hora, clima, notificaciones, próximo evento, accesos, estado de la neurona, Astraura |
| Bloqueo | `src/lib/bloqueo/*` + `src/components/bloqueo/*` | PIN/contraseña con PBKDF2; passkey de plataforma (huella, rostro) verificada con su firma |

### Pantalla inicial

- `PreferenciaInicio = { tipo: "dashboard" | "inicio" | "ruta"; dashboardId?; ruta? }`, guardada por
  perfil y por neurona (`starseed.inicio.pantalla.v1`). Resolución: neurona › perfil › por defecto
  («dashboard principal» del perfil). Una ruta que ya no existe cae al defecto, sin pantalla rota.
- `/` y el acceso tras iniciar sesión llevan a la pantalla resuelta (hoy van fijos a `/escritorios`).
- Se pregunta en el último paso del rito del perfil y en `neuron-setup.tsx`; se cambia en Ajustes.
- Se registra en OmniDock y catálogo (regla de descubribilidad de CLAUDE.md §11).

### Pantalla de bloqueo

- Opcional por neurona. Métodos: ninguno · PIN · contraseña · **biometría** (passkey de plataforma
  con `userVerification: "required"`: huella o rostro del propio dispositivo).
- El secreto nunca se guarda: PBKDF2-SHA256 (≥ 210 000 iteraciones, sal aleatoria) con WebCrypto.
- La passkey se **verifica de verdad**: se guarda su clave pública al registrarla y cada desbloqueo
  comprueba la firma ES256 sobre `authenticatorData ‖ SHA-256(clientDataJSON)`, el reto aleatorio y
  la bandera UV. No depende de ningún servidor: funciona sin conexión.
- Cuándo bloquea: al abrir, tras N minutos sin actividad, al volver tras N minutos oculta, o a mano.
- En la app nativa (Tauri) la biometría del sistema llega después con `tauri-plugin-biometric`
  (anotado, fuera de esta ola).

## Plan de olas

- **380 · Cimientos** (FL1–FL7): formas, tamaños, presupuesto, asignación, envoltura, interruptor,
  XR. Con FL6 todos los widgets pierden el marco a la vez; los rediseños creativos llegan después.
- **381 · Pantalla de inicio** (INI1–INI6): preferencia, resolución y redirección, pantalla sencilla
  con widgets básicos, selector, preguntas en perfil y neurona, registro en OmniDock.
- **382 · Bloqueo** (BLQ1–BLQ6): secreto local, passkey (registro y verificación), política,
  pantalla, ajustes.
- **383+ · Rediseño por familias** (WL*): reloj, clima, notificaciones, accesos rápidos, estado del
  sistema… y el resto de los 104, cada uno como componente NUEVO (≤ 120 líneas) que el registro
  usa en modo «libre»; el componente viejo queda para el modo «clásico».

## Cómo se gasta el crédito de Claude en esto

El enjambre gratuito escribe las tareas; Claude (crédito de la nube) diseña las olas, escribe lo
que el enjambre no resuelve, compila en la nube (la Mac no puede), verifica en localhost y publica.
Una sesión corta por ola, con relevo, en lugar de una sesión eterna.
