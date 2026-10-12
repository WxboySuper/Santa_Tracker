import { describe, expect, it } from 'vitest';
import { completionEvent, failureEvent } from './telemetry';
describe('telemetry privacy', () => { it('keeps outcome payloads free of identity fields', () => { for (const event of [completionEvent('ornament-smash', { score: 10 }), failureEvent('ornament-smash', { reason: 'timeout' })]) { expect(event).not.toHaveProperty('name'); expect(event).not.toHaveProperty('email'); expect(event).not.toHaveProperty('userId'); expect(event).not.toHaveProperty('identity'); } }); });
