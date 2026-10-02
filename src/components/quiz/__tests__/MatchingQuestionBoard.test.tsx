import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import MatchingQuestionBoard from '../MatchingQuestionBoard';
import type { TrainingQuestion } from '../../../types/trainingGrounds';

const question: TrainingQuestion = {
  id: 'm1',
  prompt: 'Match the capitals',
  questionType: 'matching',
  matchPairs: [
    { id: 'fr', prompt: { text: 'France' }, response: { text: 'Paris' } },
    { id: 'jp', prompt: { text: 'Japan' }, response: { text: 'Tokyo' } },
  ],
  options: [],
  correctIndices: [],
  difficulty: 'easy',
  pointsPP: 5,
  pointsXP: 5,
  order: 0,
};

const Harness: React.FC<{ onChange: (s: Record<string, string>) => void }> = ({ onChange }) => {
  const [selections, setSelections] = useState<Record<string, string>>({});
  return (
    <MatchingQuestionBoard
      question={question}
      selections={selections}
      onChange={(next) => {
        setSelections(next);
        onChange(next);
      }}
    />
  );
};

describe('MatchingQuestionBoard', () => {
  it('places a card by tapping it and then tapping a drop zone, and can send it back', () => {
    const onChange = jest.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Answer card: Paris' }));
    fireEvent.click(screen.getByRole('button', { name: 'Drop zone for France' }));
    expect(onChange).toHaveBeenLastCalledWith({ fr: 'fr' });

    fireEvent.click(screen.getByRole('button', { name: 'Answer card: Tokyo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Drop zone for France' }));
    expect(onChange).toHaveBeenLastCalledWith({ fr: 'jp' });

    fireEvent.click(screen.getByRole('button', { name: 'Send card back' }));
    expect(onChange).toHaveBeenLastCalledWith({});
  });

  it('marks right and wrong matches when revealed', () => {
    const { container } = render(
      <MatchingQuestionBoard question={question} selections={{ fr: 'jp', jp: 'fr' }} reveal />
    );
    expect(container.querySelectorAll('.mst-match-slot.is-wrong')).toHaveLength(2);
    expect(screen.getAllByText(/Answer:/)).toHaveLength(2);
    expect(screen.queryByText(/Drag each card/)).toBeNull();
  });
});
