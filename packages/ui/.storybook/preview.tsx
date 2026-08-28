import type { Preview } from '@storybook/react-vite';
import '../src/tokens.css';

const preview: Preview = {
  parameters: {
    a11y: { test: 'error' },
    backgrounds: {
      default: 'north pole night',
      values: [
        { name: 'north pole night', value: '#0b1220' },
        { name: 'snow', value: '#f8fafc' },
      ],
    },
    viewport: {
      options: {
        mobile: { name: 'Mobile', styles: { width: '375px', height: '667px' } },
        desktop: { name: 'Desktop', styles: { width: '1280px', height: '800px' } },
      },
    },
  },
  globalTypes: {
    contrast: { description: 'Contrast mode', defaultValue: 'normal', toolbar: { items: ['normal', 'high'] } },
    motion: { description: 'Motion mode', defaultValue: 'full', toolbar: { items: ['full', 'reduced'] } },
  },
  decorators: [
    (Story, context) => {
      const highContrast = context.globals.contrast === 'high';
      const reducedMotion = context.globals.motion === 'reduced';
      return (
        <div
          data-contrast={context.globals.contrast}
          data-motion={context.globals.motion}
          style={{
            background: highContrast ? '#000' : '#0b1220',
            color: '#f8fafc',
            minHeight: '100vh',
            padding: '2rem',
            transitionDuration: reducedMotion ? '0ms' : undefined,
          }}
        >
          <Story />
        </div>
      );
    },
  ],
};

export default preview;
