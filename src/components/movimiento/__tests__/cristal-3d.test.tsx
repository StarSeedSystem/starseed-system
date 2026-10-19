import { render } from '@testing-library/react';
import { Cristal3D } from '../Cristal3D';

it('renders without crashing', () => {
  const { unmount } = render(<Cristal3D />);
  expect(unmount).toBeDefined();
  unmount();
});