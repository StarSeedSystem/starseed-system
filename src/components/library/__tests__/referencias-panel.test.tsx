import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ReferenciasPanel } from '@/components/library/referencias/referencias-panel';
import referencias from '../../../../config/referencias-inspiracion.json';
import { AppearanceProvider } from '@/context/appearance-context';
import '@testing-library/jest-dom/vitest';

const renderWithAppearance = (ui: React.ReactElement) => {
  return render(<AppearanceProvider>{ui}</AppearanceProvider>);
};

describe('ReferenciasPanel', () => {
  it('renders without crashing', () => {
    renderWithAppearance(<ReferenciasPanel />);
    expect(screen.getByText(/referencias e inspiración/i)).toBeInTheDocument();
  });
});