export function crearCanalRele(
  url: string,
  tema: string,
  WebSocketConstructor: typeof WebSocket
) {
  let ws: WebSocket | null = null;
  let abierto = false;
  let shouldReconnect = true;
  let reconnectDelay = 1000; // start at 1 second
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  const alAbrirListeners: (() => void)[] = [];
  const alRecibirListeners: ((data: any) => void)[] = [];

  const createWebSocket = () => {
    ws = new WebSocketConstructor(`${url}?tema=${encodeURIComponent(tema)}`);
    // Wrap the close and caer methods to also call our handleClose
    if (typeof (ws as any).close === 'function') {
      const originalClose = (ws as any).close;
      (ws as any).close = function () {
        originalClose.call(this);
        handleClose();
      };
    }
    if (typeof (ws as any).caer === 'function') {
      const originalCaer = (ws as any).caer;
      (ws as any).caer = function () {
        originalCaer.call(this);
        handleClose();
      };
    }

    ws.addEventListener('open', handleOpen);
    ws.addEventListener('message', handleMessage);
    ws.addEventListener('close', handleClose);
    ws.addEventListener('error', handleClose); // treat error as close for reconnection
  };

  const handleOpen = () => {
    abierto = true;
    // Reset reconnection delay on successful connection
    reconnectDelay = 1000;
    // Clear any pending reconnection timeout (shouldn't be any, but just in case)
    if (reconnectTimeout !== null) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    alAbrirListeners.forEach(listener => listener());
  };

  const handleMessage = (event: MessageEvent) => {
    const data = event.data;
    if (typeof data === 'string' && data.startsWith('{"t":"est"')) {
      alRecibirListeners.forEach(listener => listener(data));
    }
  };

  const handleClose = () => {
    abierto = false;
    if (shouldReconnect && reconnectTimeout === null) {
      // Schedule a reconnection attempt
      reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null;
        createWebSocket();
        // Double the delay for the next attempt
        reconnectDelay *= 2;
      }, reconnectDelay);
    }
  };

  // Initial connection
  createWebSocket();

  return {
    enviar(texto: string) {
      if (abierto && ws) {
        ws.send(texto);
      }
    },
    alRecibir(cb: (t: any) => void) {
      alRecibirListeners.push(cb);
      return () => {
        const index = alRecibirListeners.indexOf(cb);
        if (index >= 0) {
          alRecibirListeners.splice(index, 1);
        }
      };
    },
    abierto() {
      return abierto;
    },
    cerrar() {
      shouldReconnect = false;
      if (reconnectTimeout !== null) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      if (ws) {
        ws.close();
        ws = null;
      }
      abierto = false;
    },
    alAbrir(cb: () => void) {
      alAbrirListeners.push(cb);
      return () => {
        const index = alAbrirListeners.indexOf(cb);
        if (index >= 0) {
          alAbrirListeners.splice(index, 1);
        }
      };
    },
    oyentes: () => 0,
  };
}