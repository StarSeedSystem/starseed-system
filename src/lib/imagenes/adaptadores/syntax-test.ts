type TestOptions = {
  obtenerNavigatorGPU?: () => NavigatorGPUMinimo | null | undefined;
};

interface NavigatorGPUMinimo {
  requestAdapter: () => Promise<GPUAdapterMinimo | null>;
}

interface GPUAdapterMinimo {
  features: {
    has: (feature: string) => Promise<boolean>;
  };
}

function testFunction(opciones: TestOptions = {}) {
  const obtenerNavigatorGPU = opciones.obtenerNavigatorGPU ?? (() => {
    return null;
  });

  const inicializarAdapter = opciones.inicializarAdapter ?? async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
  };
}