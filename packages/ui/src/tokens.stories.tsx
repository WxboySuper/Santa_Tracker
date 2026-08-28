import type { Meta, StoryObj } from '@storybook/react';
import { colors, radius, seasonalStates, spacing, typography } from './tokens';

const meta = { title: 'Foundation/Design tokens', tags: ['autodocs'] } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const SeasonalStates: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: spacing.md, gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))' }}>
      {Object.entries(seasonalStates).map(([name, state]) => (
        <article key={name} style={{ background: state.background, borderRadius: radius.md, color: colors.snow, padding: spacing.lg }}>
          <h2 style={{ color: state.accent, fontFamily: typography.fontFamily }}>{name}</h2>
          <p style={{ fontSize: typography.smallSize }}>Accent: {state.accent}</p>
        </article>
      ))}
    </div>
  ),
};
