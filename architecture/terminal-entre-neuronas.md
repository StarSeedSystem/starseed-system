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

## En todas las versiones nativas (Maggasukha, 25-11, 23:20)

El ayudante con privilegios viene con **todas** las versiones nativas instalables, en todos los
sistemas, y lo usan los controles de las neuronas desde Genesis, PoliGenesis, Astraura, la
Protomolécula, el control remoto y cualquier otra función que administre una neurona:
- Linux: en el `.deb` y el `.rpm` lo instala el propio paquete (postinst) con su regla de sudoers
  limitada al ayudante; en la AppImage, la primera vez que se active, con la autorización del sistema
  (pkexec).
- macOS: ayudante privilegiado registrado con `SMAppService`, que el sistema aprueba con la
  autorización de administrador la primera vez.
- Windows: servicio del sistema que instala el instalador (MSI/NSIS) con su ventana de UAC.
- Android: sin root no hay nivel administrador; las órdenes tipadas que el sistema permite a una app
  (almacenes por el marco de acceso, ajustes con su pantalla) van por la propia app.
- Instalarlo no lo **enciende**: el permiso de terminal y de administración se sigue encendiendo en
  cada aparato por su dueño. Las órdenes tipadas son las mismas en todos los sistemas (un solo
  contrato de órdenes), y cada una dice si en ese sistema existe o no.

## Primera pieza ya hecha (25-11)

`/usr/local/sbin/starseed-almacen` en la Maggabox: ayudante de almacenes (estado, salud, formatear
solo discos autorizados por su serie, montar, desmontar, verificar). Lo instaló Maggasukha una vez;
la dirección lo usa con `sudo -n` sin contraseña. Es el modelo de las órdenes tipadas de arriba.

## Ajustes remotos completos (REM1126A · 26-11-2026, Maggasukha)

Desde cualquier neurona (Ajustes, Astraura, Protomolécula) se leen y cambian los ajustes de otra
neurona vinculada. Código: `src/lib/control-remoto/ajustes-remotos.ts`; pantalla:
`ficha-neurona/ficha-remota.tsx` (sección «Ajustes de esta neurona» de Cuenta › Neuronas).

- **Tres órdenes tipadas** por el mismo canal sellado, firmado y con tope que usa la terminal:
  `leer-ajustes` (sin argumentos), `poner-ajuste` (`clave`, `valor`, `ambito`: permiso, ajuste o
  apariencia) y `deshacer-ajuste` (`id` del registro). Argumentos estrictos; lo demás se rechaza.
- **Permiso «configurar a distancia»**: apagado de fábrica. Lo enciende la persona dueña en ESE
  aparato; ninguna orden remota ni voto de comunidad lo enciende. Apagado, ni se leen ni se cambian.
- **Lo de seguridad no se cambia a distancia**: permisos de control (`agent`, `terminal`,
  `alcance`), claves y firma, aceptar controladores y el propio permiso. Se ven, sin interruptor.
- **Registro en los dos lados** (quien manda y el aparato cambiado): quién, cuándo, clave, valor
  anterior y nuevo. `deshacer-ajuste` devuelve el valor anterior y exige el mismo permiso.
- Pendiente de cableado (otra tarea): registrar las tres órdenes en el vocabulario de `niveles.ts`
  con `validarArgsAjusteRemoto`, nivel «modificar», y persistir el estado en el aparato.

## Puertas de la ola

Pruebas de cada archivo; tsc; sin dependencias npm ni crates nuevos (si no hay PTY en el árbol, la
primera versión ejecuta con tuberías y salida en vivo, sin pantalla completa); comandos nativos
registrados en `COMANDOS_APP`, capability e inventario de permisos.
