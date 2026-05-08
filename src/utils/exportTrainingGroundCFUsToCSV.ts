import type { TrainingQuestion } from '../types/trainingGrounds';

type ExportableCFU = Partial<TrainingQuestion> & {
  quizSetTitle?: string;
  tags?: string[];
};

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const s = String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return `"${s.replace(/"/g, '""')}"`;
}

function formatDateCell(value: unknown): string {
  if (!value) return '';
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  const asNum = Number(value);
  if (Number.isFinite(asNum) && asNum > 0) return new Date(asNum).toISOString();
  return String(value);
}

function buildCorrectAnswerLabel(question: ExportableCFU): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const indices =
    Array.isArray(question.correctIndices) && question.correctIndices.length > 0
      ? question.correctIndices
      : typeof question.correctIndex === 'number'
        ? [question.correctIndex]
        : [];
  if (!indices.length) return '';
  return indices
    .map((idx) => {
      const letter = letters[idx] || `#${idx + 1}`;
      const option = Array.isArray(question.options) ? question.options[idx] : '';
      return option ? `${letter}: ${option}` : letter;
    })
    .join(' | ');
}

function getChoice(options: string[] | undefined, index: number): string {
  if (!Array.isArray(options)) return '';
  return options[index] || '';
}

export function exportTrainingGroundCFUsToCSV(cfus: ExportableCFU[], filename: string): void {
  const headers = [
    'Question',
    'Choice A',
    'Choice B',
    'Choice C',
    'Choice D',
    'Correct Answer',
    'Explanation',
    'Topic',
    'Difficulty',
    'Tags',
    'Quiz Set',
    'Created At',
    'Updated At',
  ];

  const rows = cfus.map((q) => {
    const tags = Array.isArray(q.tags)
      ? q.tags.join(', ')
      : Array.isArray(q.artifactRewards)
        ? q.artifactRewards.join(', ')
        : '';
    const row = [
      q.prompt || '',
      getChoice(q.options, 0),
      getChoice(q.options, 1),
      getChoice(q.options, 2),
      getChoice(q.options, 3),
      buildCorrectAnswerLabel(q),
      q.explanation || '',
      q.category || '',
      q.difficulty || '',
      tags,
      q.quizSetTitle || '',
      formatDateCell(q.createdAt),
      formatDateCell(q.updatedAt),
    ];
    return row.map((cell) => escapeCsvValue(cell)).join(',');
  });

  const csv = [headers.map(escapeCsvValue).join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

