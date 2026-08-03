import type { WorkflowMetadata } from '../../types/workflow';

/** Default workflow templates for forecast cycles. */
export const DEFAULT_WORKFLOW_TEMPLATES: WorkflowMetadata[] = [
  {
    id: 'severe-day1',
    label: 'Severe Convective Day 1',
    groupings: ['day1'],
  },
  {
    id: 'severe-day2',
    label: 'Severe Convective Day 2',
    groupings: ['day2'],
  },
  {
    id: 'severe-day3',
    label: 'Severe Convective Day 3',
    groupings: ['day3'],
  },
  {
    id: 'severe-day4-8',
    label: 'Severe Convective Days 4-8',
    groupings: ['day4-8'],
  },
  {
    id: 'convective-outlook',
    label: 'Convective Outlook (Full)',
    groupings: ['day1', 'day2', 'day3', 'day4-8'],
  },
];

/** Returns a workflow template by ID, or undefined if not found. */
export const getWorkflowTemplateById = (id: string): WorkflowMetadata | undefined =>
  DEFAULT_WORKFLOW_TEMPLATES.find((template) => template.id === id);
