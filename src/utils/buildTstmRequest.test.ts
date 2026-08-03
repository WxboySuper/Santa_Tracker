import { buildTstmRequest } from './buildTstmRequest';
import { getTstmRequestIdentity } from './tstmGeneration';

describe('buildTstmRequest', () => {
  test('includes cycle date and day metadata in the request identity', () => {
    const request = buildTstmRequest(
      {
        cycleDate: '2026-06-13',
        currentDay: 1,
        days: {
          1: {
            day: 1,
            data: { categorical: new Map() },
            metadata: {
              issueDate: '2026-06-13T06:00:00Z',
              validDate: '2026-06-13T12:00:00Z',
              issuanceTime: '0600',
              createdAt: '2026-06-13T06:00:00Z',
              lastModified: '2026-06-13T06:00:00Z',
            },
          },
        },
      },
      1
    );

    expect(request).toEqual({
      day: 1,
      cycleDate: '2026-06-13',
      issueDate: '2026-06-13T06:00:00Z',
      validDate: '2026-06-13T12:00:00Z',
      issuanceTime: '0600',
    });
    expect(getTstmRequestIdentity(request)).toContain('day-1');
  });
});
