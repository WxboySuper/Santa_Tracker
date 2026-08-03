import React from 'react';
import { render, screen } from '@testing-library/react';
import ForecastGradeResultsPane from './ForecastGradeResultsPane';

describe('ForecastGradeResultsPane', () => {
  it('renders a clear empty state before verification has a result', () => {
    const grade = {
      phase: 'idle',
      progress: null,
      tier: 'signed-out',
    } as unknown as React.ComponentProps<typeof ForecastGradeResultsPane>['grade'];

    render(
      <ForecastGradeResultsPane
        grade={grade}
        activeComponent={null}
        onSelectComponent={() => undefined}
        selectedReportId={null}
        onSelectReport={() => undefined}
        onSelectProduct={() => undefined}
        onSelectHistoryCard={() => undefined}
        result={null}
      />,
    );

    expect(screen.getByRole('region', { name: /verification result summary/i })).toBeInTheDocument();
    expect(screen.getByText(/run verification to calculate a grade/i)).toBeInTheDocument();
  });
});
