import { TunelMetaGenesisEstado } from './tunel-metagenesis-estado';
import { render, screen, waitFor, waitForElementToBeRemoved } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.useFakeTimers();

describe('TunelMetaGenesisEstado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock document.hidden to return false (page visible)
    Object.defineProperty(document, 'hidden', {
      writable: true,
      value: false,
    });
  });

  it('shows loading state initially', async () => {
    render(<TunelMetaGenesisEstado />);
    // getByText throws if not found, so if we reach here, it's found
    const loadingElement = screen.getByText(/cargando/i);
    expect(loadingElement).toBeTruthy();
  });

  it('fetches and displays tunnel active state', async () => {
    // Mock fetch to return active tunnel
    const mockEstado = {
      cargado: true,
      pid: 1234,
      ultimasLineas: [
        'Line 1 https://foo.trycloudflare.com',
        'Line 2',
      ],
      medidoEn: new Date().toISOString(),
    };
    const mockFetch = vi.fn().mockImplementation(async () => {
      console.log('mockFetch called');
      return {
        ok: true,
        json: async () => mockEstado,
      };
    });
    global.fetch = mockFetch;

    const { container } = render(<TunelMetaGenesisEstado />);
    // Wait for the fetch to resolve
    await waitFor(() => {
      console.log('mockFetch call count:', mockFetch.mock.calls.length);
      expect(mockFetch).toHaveBeenCalled();
    });
    console.log('container innerHTML after fetch:', container.innerHTML);

    // Wait for active state to appear
    await waitFor(() => {
      expect(screen.getByText(/túnel de metagénesis: activo/i)).toBeTruthy();
    }, { timeout: 5000 });

    // Check that loading state is gone
    expect(screen.queryByText(/cargando/i)).toBeNull();

    // Check pid
    const pidElement = screen.getByText(/pid 1234/i);
    expect(pidElement).toBeTruthy();
    // Check that the URL was replaced
    const line1Element = screen.getByText(/line 1 \[túnel\]/i);
    expect(line1Element).toBeTruthy();
    const line2Element = screen.getByText(/line 2/i);
    expect(line2Element).toBeTruthy();
  });

  it('fetches and displays tunnel inactive state', async () => {
    const mockEstado = {
      cargado: false,
      pid: null,
      ultimasLineas: [],
      medidoEn: new Date().toISOString(),
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockEstado,
    });

    render(<TunelMetaGenesisEstado />);

    await waitFor(() => {
      const paradoElement = screen.getByText(/túnel de metagénesis: parado/i);
      expect(paradoElement).toBeTruthy();
    });
  });

  it('handles fetch error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    render(<TunelMetaGenesisEstado />);

    await waitFor(() => {
      const errorElement = screen.getByText(/error: network error/i);
      expect(errorElement).toBeTruthy();
    });
  });
});