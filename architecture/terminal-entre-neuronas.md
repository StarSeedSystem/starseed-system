# Terminal entre neuronas (parte del control remoto)

Contrato de la dirección (25-11-2026, petición de Maggasukha). Lo leen las tareas de la ola
`terminal-neuronas-1125` (TRM1125*). Amplía `architecture/control-remoto-entre-neuronas.md` y
`architecture/permisos-y-control-del-dispositivo.md`: sus reglas siguen todas en pie.

## Qué pidió

«Ya basta, hazlo tú»: que la dirección y MetaGenesis no tengan que pedirle teclear comandos en otra
neurona (la Maggabox), y que el control remoto incluya **control de las terminales con permisos
completos entre neuronas**, por la malla P2P o por cualquier capa de la red, para lo que sea.

## Cómo encaja con las reglas del control (no se debilitan)

- El permiso de terminal está **apagado por defecto** en cada aparato y lo enciende su dueño **en
  ese aparato**. Un voto de comunidad nunca lo enciende en un aparato personal.
- Dos niveles: **usuario** (la terminal de la cuenta, sin privilegios) y **administrador**.
- **Las contraseñas nunca viajan.** El nivel administrador funciona con un **ayudante con
  privilegios** que el dueño instala una vez en su aparato con la autorización propia del sistema
  (Linux: regla de sudoers o de polkit limitada al ayudante; macOS: ayudante privilegiado con la
  autorización de administrador; Windows: servicio con la ventana de UAC). Android sin root: solo
  la terminal de la app.
- El ayudante ofrece **órdenes tipadas** (almacenes, servicios propios de StarSeed, actualizar,
  registros, reiniciar la app) con guardas en cada una. El modo **«administrador completo»** (una
  terminal root sin límites) existe, pero solo lo activa el dueño en ese aparato, con aviso visible,
  caducidad (p. ej. 1 h, 1 día) y registro de cada orden.
- Cada sesión muestra el aviso en el aparato controlado, se corta con «Terminar» y se apaga del
  todo con «Quitar permiso». Órdenes selladas (firma, anti-repetición, topes de ritmo) con lo que
  ya existe en `src/lib/control-remoto/sellado.ts` y `orden.ts`. Con el aparato bloqueado no entra
  nada.
- Registro legible en el aparato controlado (qué se ejecutó, quién, cuándo y su salida resumida).
- El transporte es el de las sesiones de control: malla P2P local, Bluetooth o relé, cifrado de
  extremo a extremo, autoenrutado por la mejor capa disponible.

## Primera pieza ya hecha (25-11)

`/usr/local/sbin/starseed-almacen` en la Maggabox: ayudante de almacenes (estado, salud, formatear
solo discos autorizados por su serie, montar, desmontar, verificar). Lo instaló Maggasukha una vez;
la dirección lo usa con `sudo -n` sin contraseña. Es el modelo de las órdenes tipadas de arriba.

## Puertas de la ola

Pruebas de cada archivo; tsc; sin dependencias npm ni crates nuevos (si no hay PTY en el árbol, la
primera versión ejecuta con tuberías y salida en vivo, sin pantalla completa); comandos nativos
registrados en `COMANDOS_APP`, capability e inventario de permisos.
