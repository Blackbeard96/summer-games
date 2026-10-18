import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ClassFlowSprintTimer from '../ClassFlowSprintTimer';
import ClassFlowSubmitModal from '../ClassFlowSubmitModal';
import type { ClassFlowSprintState } from '../../../types/season1';
import type { CfSprintAssignment } from '../../../types/classFlowWork';

jest.mock('../../../utils/classFlowWorkService', () => ({ uploadEvidenceFile: jest.fn() }));
jest.mock('../../../utils/liveEventSprintService', () => {
  const ms = (t: unknown) => (t instanceof Date ? t.getTime() : null);
  return {
    sprintTimerInput: (s: ClassFlowSprintState) => ({
      status: s.status,
      startedAtMs: ms(s.startedAt) ?? 0,
      endsAtMs: ms(s.endsAt) ?? 0,
      pausedAtMs: ms(s.pausedAt),
    }),
  };
});

const assignment: CfSprintAssignment = {
  assignmentId: 'w1',
  title: 'Build the prototype',
  description: 'Make it work',
  instructions: 'Step 1',
  submissionRequirements: 'Screenshot',
  workType: 'individual',
  points: 150,
  submissionMethods: ['link', 'confirm'],
  evidenceRequired: true,
  isExtraCredit: false,
  bonus: { type: 'none', value: 0, targetAssignmentId: null },
};

const sprint = (over: Partial<ClassFlowSprintState> = {}): ClassFlowSprintState => ({
  id: 'sp1',
  title: 'Sprint 1',
  durationSeconds: 600,
  startedAt: new Date(0),
  endsAt: new Date(600_000),
  status: 'live',
  hostUid: 'host',
  rewardParticipationPoints: 1,
  rewardVaultPP: 0,
  rewardXP: 0,
  incompletePenaltyVaultPP: 0,
  markedCompleteUids: [],
  rewardsGrantedUids: [],
  incompletePenaltiesGrantedUids: [],
  objective: 'Ship the MVP',
  assignments: [assignment],
  ...over,
});

describe('ClassFlowSprintTimer', () => {
  it('shows the shared countdown and opens the expanded view', () => {
    const onSubmit = jest.fn();
    render(
      <ClassFlowSprintTimer sprint={sprint()} nowMs={540_000} expandable acceptLate={false} teamLabel="THE ARCHITECTS | 4 Players" availablePoints={150} onSubmitWork={onSubmit} />
    );
    expect(screen.getAllByText('1:00').length).toBeGreaterThan(0);
    expect(screen.getByText('Submissions open')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Full screen/ }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('Ship the MVP')).toBeInTheDocument();
    expect(dialog.getByText('THE ARCHITECTS | 4 Players')).toBeInTheDocument();
    expect(dialog.getByText('Complete these items')).toBeInTheDocument();
    expect(dialog.getByText(/Build the prototype/)).toBeInTheDocument();
    fireEvent.click(dialog.getByRole('button', { name: 'Submit Work' }));
    expect(onSubmit).toHaveBeenCalled();
    fireEvent.click(dialog.getByRole('button', { name: /Exit full screen/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('freezes while paused and closes submissions when time is up', () => {
    const { rerender } = render(
      <ClassFlowSprintTimer sprint={sprint({ pausedAt: new Date(300_000) })} nowMs={500_000} expandable={false} acceptLate={false} />
    );
    expect(screen.getByText('5:00')).toBeInTheDocument();
    expect(screen.getByText('Paused — submissions open')).toBeInTheDocument();
    rerender(<ClassFlowSprintTimer sprint={sprint()} nowMs={700_000} expandable={false} acceptLate={false} onSubmitWork={() => undefined} />);
    expect(screen.getByText('Time is up')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit Work' })).toBeNull();
  });
});

describe('ClassFlowSubmitModal', () => {
  it('explains the work and validates evidence before submitting', async () => {
    const onSubmit = jest.fn().mockResolvedValue(null);
    render(
      <ClassFlowSubmitModal
        sessionId="s"
        uid="u"
        assignments={[assignment]}
        existing={{}}
        teammates={[]}
        onSubmit={onSubmit}
        onClose={() => undefined}
      />
    );
    expect(screen.getByText('Step 1')).toBeInTheDocument();
    expect(screen.getByText('Screenshot')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }));
    expect(await screen.findByText(/enter a valid link/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText('https://'), { target: { value: 'https://example.com/work' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }));
    await screen.findByRole('button', { name: 'Submit for review' });
    expect(onSubmit).toHaveBeenCalledWith([
      expect.objectContaining({ method: 'link', evidence: { url: 'https://example.com/work' } }),
    ]);
  });

  it('does not offer work that was already submitted unless a revision was requested', () => {
    render(
      <ClassFlowSubmitModal
        sessionId="s"
        uid="u"
        assignments={[assignment]}
        existing={{ w1: { status: 'submitted' } as never }}
        teammates={[]}
        onSubmit={jest.fn()}
        onClose={() => undefined}
      />
    );
    expect(screen.getByText('Everything in this sprint is already submitted.')).toBeInTheDocument();
  });
});
