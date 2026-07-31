import { dedupeGradeCardsByDay } from './GradeTrendChart';
import type { GradeCard } from '../../types/forecastGrade';

const card = (id: string, reportDate: string | null, createdAt: string): GradeCard => ({
  id,
  reportDate,
  createdAt,
  formulaVersion: 'gfc-ver-1',
  grade: 37.7,
  letter: 'Good',
  dataQuality: 'Good',
  productGrades: {},
  sourceLabel: 'SPC',
  hasSnapshot: false,
});

describe('dedupeGradeCardsByDay', () => {
  it('keeps the newest grade for each forecast day', () => {
    const result = dedupeGradeCardsByDay([
      card('latest', '2026-03-10', '2026-03-11T12:00:00Z'),
      card('older', '2026-03-10', '2026-03-10T12:00:00Z'),
      card('other-day', '2026-03-11', '2026-03-12T12:00:00Z'),
    ]);

    expect(result.map(({ id }) => id)).toEqual(['other-day', 'latest']);
  });
});
