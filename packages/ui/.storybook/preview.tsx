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
      const { globals = {} } = context as unknown as { globals?: { contrast?: string; motion?: string } };
      const contrast = globals.contrast ?? 'normal';
      const motion = globals.motion ?? 'full';
      const highContrast = contrast === 'high';
      const reducedMotion = motion === 'reduced';
      return (
        <div
          data-contrast={contrast}
          data-motion={motion}
          style={{
            background: highContrast ? '#000' : '#0b1220',
            color: '#f8fafc',
            minHeight: '100vh',
            padding: '2rem',
            transitionDuration: reducedMotion ? '0ms' : undefined,
          }}
        >
          <main aria-label="Story preview">
            <h1 style={{ clip: 'rect(0 0 0 0)', clipPath: 'inset(50%)', height: 1, overflow: 'hidden', position: 'absolute', whiteSpace: 'nowrap', width: 1 }}>
              Santa Tracker UI preview
            </h1>
            <Story />
          </main>
        </div>
      );
    },
  ],
};

export default preview;
