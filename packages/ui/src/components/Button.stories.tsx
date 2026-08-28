import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

const meta = {
  title: 'Controls/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: { variant: { control: 'select', options: ['primary', 'secondary', 'ghost'] } },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = { args: { children: 'Track Santa', variant: 'primary' } };
export const Secondary: Story = { args: { children: 'View route', variant: 'secondary' } };
export const Ghost: Story = { args: { children: 'Learn more', variant: 'ghost' } };
export const Disabled: Story = { args: { children: 'Unavailable', disabled: true } };
