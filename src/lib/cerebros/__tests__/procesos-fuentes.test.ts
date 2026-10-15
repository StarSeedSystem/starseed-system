import { vi } from 'vitest';

// Mock the modules using the @/ alias as they appear in the source file's import statements
vi.mock('@/lib/metagenesis/remoto-nodos-cliente');
vi.mock('@/lib/genesis/historial');
vi.mock('@/lib/genesis/entidades');
vi.mock('@/lib/astraura/status');
vi.mock('@/lib/imagine/runs');
vi.mock('@/lib/desktop/snapshot');
vi.mock('@/lib/neuron/neuronas');
vi.mock('@/lib/instalaciones/store');

import { leerProcesos } from '../procesos-fuentes';

describe('leerProcesos', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
  });

  it('should return empty arrays when all sources fail', async () => {
    // Mock fetch to reject
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    // Mock leerEstadoAutonomo to reject
    const mockLeerEstadoAutonomo = await import('@/lib/metagenesis/remoto-nodos-cliente');
    mockLeerEstadoAutonomo.leerEstadoAutonomo.mockRejectedValue(new Error('Failed'));
    // Mock leerHistorial to reject
    const mockLeerHistorial = await import('@/lib/genesis/historial');
    mockLeerHistorial.leerHistorial.mockRejectedValue(new Error('Failed'));
    // Mock propuestasDe to reject
    const mockPropuestasDe = await import('@/lib/genesis/entidades');
    mockPropuestasDe.propuestasDe.mockRejectedValue(new Error('Failed'));
    // Mock fetchAstraura158DreamStatus to reject
    const mockFetchAstraura158DreamStatus = await import('@/lib/astraura/status');
    mockFetchAstraura158DreamStatus.fetchAstraura158DreamStatus.mockRejectedValue(new Error('Failed'));
    // Mock fetchAstraura158ImaginationStatus to reject
    const mockFetchAstraura158ImaginationStatus = await import('@/lib/astraura/status');
    mockFetchAstraura158ImaginationStatus.fetchAstraura158ImaginationStatus.mockRejectedValue(new Error('Failed'));
    // Mock listRuns to reject
    const mockListRuns = await import('@/lib/imagine/runs');
    mockListRuns.listRuns.mockRejectedValue(new Error('Failed'));
    // Mock leerDesktopsSnapshot to reject
    const mockLeerDesktopsSnapshot = await import('@/lib/desktop/snapshot');
    mockLeerDesktopsSnapshot.leerDesktopsSnapshot.mockRejectedValue(new Error('Failed'));
    // Mock listNeurons to reject
    const mockListNeurons = await import('@/lib/neuron/neuronas');
    mockListNeurons.listNeurons.mockRejectedValue(new Error('Failed'));
    // Mock leerInstalaciones to reject
    const mockLeerInstalaciones = await import('@/lib/instalaciones/store');
    mockLeerInstalaciones.leerInstalaciones.mockRejectedValue(new Error('Failed'));

    const result = await leerProcesos();

    // Expect empty arrays for procesos and hardware
    expect(result.procesos).toEqual([]);
    expect(result.hardware).toEqual([]);
    // Expect that all fuentes have ok: false
    expect(result.fuentes.length).toBeGreaterThan(0);
    result.fuentes.forEach(fuente => {
      expect(fuente.ok).toBe(false);
    });
  });

  it('should return data when sources succeed', async () => {
    // Mock fetch to resolve with sample data
    global.fetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        sesiones: [{ id: '1', titulo: 'Agente 1', activa: true, donde: 'Mac', ultimaAccion: 'trabajando' }],
        latidos: [{ id: 'l1', modelo: 'Modelo 1', fase: 'escribiendo', donde: 'Mac', accion: 'iniciado', fecha: new Date().toISOString() }]
      })
    });
    // Mock leerEstadoAutonomo to resolve with sample data
    const mockLeerEstadoAutonomo = await import('@/lib/metagenesis/remoto-nodos-cliente');
    mockLeerEstadoAutonomo.leerEstadoAutonomo.mockResolvedValue({
      ok: true,
      estado: {
        nodos: [
          { nodo: 'n1', etiqueta: 'Nodo 1', medio: 'mac', cpuPct: 50, nucleos: 4, carga: 0.2, ramUsadaMb: 2048, ramTotalMb: 8192, discoGb: 100, discoTotalGb: 500, haceMs: 1000 }
        ]
      }
    });
    // Mock leerHistorial to resolve with sample data
    const mockLeerHistorial = await import('@/lib/genesis/historial');
    mockLeerHistorial.leerHistorial.mockResolvedValue({
      entradas: [],
      donde: 'cuenta'
    });
    // Mock propuestasDe to resolve with sample data
    const mockPropuestasDe = await import('@/lib/genesis/entidades');
    mockPropuestasDe.propuestasDe.mockResolvedValue({
      ok: true,
      lista: []
    });
    // Mock fetchAstraura158DreamStatus to resolve with null
    const mockFetchAstraura158DreamStatus = await import('@/lib/astraura/status');
    mockFetchAstraura158DreamStatus.fetchAstraura158DreamStatus.mockResolvedValue(null);
    // Mock fetchAstraura158ImaginationStatus to resolve with null
    const mockFetchAstraura158ImaginationStatus = await import('@/lib/astraura/status');
    mockFetchAstraura158ImaginationStatus.fetchAstraura158ImaginationStatus.mockResolvedValue(null);
    // Mock listRuns to resolve with empty array
    const mockListRuns = await import('@/lib/imagine/runs');
    mockListRuns.listRuns.mockResolvedValue([]);
    // Mock leerDesktopsSnapshot to resolve with empty array
    const mockLeerDesktopsSnapshot = await import('@/lib/desktop/snapshot');
    mockLeerDesktopsSnapshot.leerDesktopsSnapshot.mockResolvedValue([]);
    // Mock listNeurons to resolve with empty array
    const mockListNeurons = await import('@/lib/neuron/neuronas');
    mockListNeurons.listNeurons.mockResolvedValue([]);
    // Mock leerInstalaciones to resolve with empty array
    const mockLeerInstalaciones = await import('@/lib/instalaciones/store');
    mockLeerInstalaciones.leerInstalaciones.mockResolvedValue([]);

    const result = await leerProcesos({ incluirMac: true });

    // Expect that we have some procesos and hardware
    expect(result.procesos.length).toBeGreaterThan(0);
    expect(result.hardware.length).toBeGreaterThan(0);
    // Expect that all fuentes have ok: true
    result.fuentes.forEach(fuente => {
      expect(fuente.ok).toBe(true);
    });
  });
});