import { describe, it, expect } from 'vitest';

// Test that the component can be imported
import { RoutersMallaPanel } from '../routers-malla-panel';

describe('import test', () => {
  it('should import successfully', () => {
    expect(RoutersMallaPanel).toBeDefined();
  });
});