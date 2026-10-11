# Adaptador para Open Duck Mini v2

Este documento describe cómo crear un adaptador mínimo para traducir las acciones del bot al runtime del Open Duck Mini v2.

## Requisitos

- Raspberry Pi Zero 2W con el runtime Open_Duck_Mini_Running instalado.
- El adaptador debe ejecutarse en la misma red local que el robot.
- Se recomienda usar un token local para autenticar las acciones.

## Interfaz de control

El Open Duck Mini v2 no expone una interfaz de red por defecto. Por lo tanto, se necesita un servidor local que reciba comandos y los traduzca a las llamadas adecuadas al runtime.

## Acciones soportadas

El adaptador debe manejar las siguientes acciones derivadas de las acciones tipadas de los bots:

1. `robot.caminar`: hace que el robot camine en una dirección determinada por una distancia.
2. `robot.girar`: hace que el robot gire un cierto ángulo.
3. `robot.emocion`: hace que el robot exprese una emoción (por ejemplo, mediante movimientos o luces).
4. `robot.bailar`: hace que el robot realice un baile específico durante una duración.
5. `robot.negarCabeza`: hace que el robot niegue con la cabeza un cierto número de veces.
6. `robot.alto`: pone al robot en estado de alta alerta (acción de riesgo bajo).

## Ejemplo de servidor mínimo (Node.js)

A continuación, se muestra un ejemplo sencillo de cómo podría implementarse el adaptador en Node.js. Este ejemplo asume que el runtime del robot ofrece una API local o serial para ejecutar comandos.

```javascript
const http = require('http');
const PORT = 3000;

// Función ficticia para enviar un comando al robot
function enviarComandoAlRobot(comando) {
  // Implementar aquí la comunicación real con el robot (por ejemplo, vía serial, GPIO, etc.)
  console.log(`Enviando al robot: ${comando}`);
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/accion') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const accion = JSON.parse(body);
        let comando = '';

        switch (accion.tipo) {
          case 'robot.caminar':
            comando = `WALK ${accion.args.direction} ${accion.args.distance}`;
            break;
          case 'robot.girar':
            comando = `TURN ${accion.args.angle}`;
            break;
          case 'robot.emocion':
            comando = `EMOTION ${accion.args.emotion}`;
            break;
          case 'robot.bailar':
            comando = `DANCE ${accion.args.danceType} ${accion.args.duration}`;
            break;
          case 'robot.negarCabeza':
            comando = `DENY ${accion.args.times}`;
            break;
          case 'robot.alto':
            comando = 'ALTO';
            break;
          default:
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Acción no soportada' }));
            return;
        }

        enviarComandoAlRobot(comando);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', comando }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Formato de acción inválido' }));
      }
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, () => {
  console.log(`Servidor de adaptador escuchando en el puerto ${PORT}`);
});
```

## Seguridad

- El servidor solo debe estar accesible en la red local.
- Se recomienda autenticar las peticiones con un token local compartido entre el bot y el adaptador.
- Nunca exponer este servidor a internet sin las debidas protecciones.

## Notas

- El Open Duck Mini v2 no tiene micrófono ni altavoz, por lo que la voz del bot proviene de la neurona más cercana en la red local.
- El adaptador debe ser lo suficientemente rápido para no introducir latencias perceptibles en las acciones.