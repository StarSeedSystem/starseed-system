# Open Duck Mini v2 - Servidor de Control Local

Este documento describe un servidor mínimo para traducir las acciones del pato (caminar, girar, emoción, bailar, negar con la cabeza y alto) al runtime de Open Duck Mini v2.

## Requisitos

- Raspberry Pi Zero 2W con Open Duck Mini v2 (sin micrófono ni altavoz)
- Node.js >= 18
- Acceso a la red local únicamente (no exponer a internet)

## Instalación

1. Clonar el repositorio del runtime de Open Duck Mini v2:
   ```bash
   git clone https://github.com/apirrone/Open_Duck_Mini.git
   cd Open_Duck_Mini
   ```

2. Instalar dependencias del runtime (según las instrucciones del proyecto).

3. Copiar este directorio `native/robot-pato` en la Pi o servirlo desde ella.

4. Instalar dependencias del servidor de control:
   ```bash
   npm install
   ```

## Uso

Ejecutar el servidor:
```bash
npm start
```

El servidor escuchará en `http://localhost:3000` (solo en la red local, no exponer públicamente).

## Endpoints

El servidor expone los siguientes endpoints POST (todos requieren un header `Authorization: Bearer <token>` donde `<token>` es un token local configurado en el servidor):

### Caminar
- **Endpoint:** `/caminar`
- **Cuerpo:** `{}` (vacío)
- **Descripción:** Inicia el movimiento hacia adelante hasta recibir un comando de alto.

### Girar
- **Endpoint:** `/girar`
- **Cuerpo:** `{}` (vacío)
- **Descripción:** Gira el robot 90 grados en sentido horario.

### Emoción
- **Endpoint:** `/emocion`
- **Cuerpo:** `{}` (vacío)
- **Descripción:** Muestra una expresión emocional predeterminada (por ejemplo, alegre).

### Bailar
- **Endpoint:** `/bailar`
- **Cuerpo:** `{}` (vacío)
- **Descripción:** Inicia una secuencia de baile hasta recibir un comando de alto.

### Negar con la cabeza
- **Endpoint:** `/negacion`
- **Cuerpo:** `{}` (vacío)
- **Descripción:** Realiza un movimiento de cabeza de un lado a otro una vez.

### Alto
- **Endpoint:** `/alto`
- **Cuerpo:** `{}` (vacío)
- **Descripción:** Detiene cualquier movimiento en curso inmediatamente.

## Seguridad

- El servidor solo debe estar accesible en la red local.
- Utilice un firewall para restringir el acceso a la Pi únicamente a dispositivos de confianza en la red local.
- El token de autorización debe ser un string aleatorio de al menos 32 caracteres, almacenado en una variable de entorno `ROBOT_PATO_TOKEN`.
- Nunca exponga este servidor a internet ni comparta el token.

## Variables de entorno

- `ROBOT_PATO_TOKEN`: Token de autorización para los endpoints (requerido).
- `PORT`: Puerto en el que escuchar (por defecto 3000).

## Ejemplo de archivo .env

```env
ROBOT_PATO_TOKEN=<tu-token-secreto>
PORT=3000
```

## Notas

- Este servidor es una capa de traducción simples. Asume que el runtime de Open Duck Mini v2 expone una API de control local o que se puede modificar para aceptar estos comandos.
- Si el runtime no expone una API de control por red, se debe modificar el runtime para agregar un servidor HTTP local que reciba estos comandos y los traduzca a los motores del robot.
- Todas las acciones son de riesgo medio (físico) excepto el alto, que es de riesgo bajo y funciona instantáneamente.
- El robot no tiene micrófono ni altavoz, por lo que la voz proviene de la neurona más cercana en la red de Astraura.