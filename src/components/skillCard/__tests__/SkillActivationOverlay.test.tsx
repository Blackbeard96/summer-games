import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import SkillActivationOverlay from '../SkillActivationOverlay';
import { clearSkillActivations, emitSkillActivation, SKILL_CARD_DURATION_MS } from '../../../utils/skillActivationQueue';

jest.mock('../../../firebase', () => ({ db: {}, storage: {} }));

const show = (id: string, actorUid: string, name = 'Fireball', imageUrl?: string) =>
  act(() => {
    emitSkillActivation({
      id,
      skill: { id: name.toLowerCase(), name, category: 'elemental', elementalAffinity: 'fire', imageUrl },
      actorName: `Player ${actorUid}`,
      actorUid,
      side: 'self',
    });
  });

describe('SkillActivationOverlay', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    act(() => clearSkillActivations());
    jest.useRealTimers();
  });

  it('shows the card with name, actor and category, then hides after 2.5s', () => {
    render(<SkillActivationOverlay />);
    show('ov-1', 'a1');
    expect(screen.getByTestId('skill-activation-card')).toBeInTheDocument();
    expect(screen.getByText('Fireball')).toBeInTheDocument();
    expect(screen.getByText('Player a1')).toBeInTheDocument();
    expect(screen.getByText('Fire · Elemental')).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(SKILL_CARD_DURATION_MS + 10);
    });
    expect(screen.queryByTestId('skill-activation-card')).toBeNull();
  });

  it('plays queued cards in order and clears on battle exit', () => {
    render(<SkillActivationOverlay />);
    show('ov-2', 'b1', 'Fireball');
    show('ov-3', 'b2', 'Tidal Wave');
    expect(screen.getByText('Fireball')).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(SKILL_CARD_DURATION_MS + 10);
    });
    expect(screen.getByText('Tidal Wave')).toBeInTheDocument();
    act(() => clearSkillActivations());
    expect(screen.queryByTestId('skill-activation-card')).toBeNull();
  });

  it('falls back to default artwork when the custom image fails', () => {
    render(<SkillActivationOverlay />);
    show('ov-4', 'c1', 'Fireball', 'https://cdn.example/broken.png');
    const img = screen.getByTestId('skill-activation-card').querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('https://cdn.example/broken.png');
    fireEvent.error(img);
    expect(img.getAttribute('src')?.startsWith('data:image/svg+xml')).toBe(true);
  });

  it('never replays a duplicate event id', () => {
    render(<SkillActivationOverlay />);
    show('ov-5', 'd1');
    act(() => {
      jest.advanceTimersByTime(SKILL_CARD_DURATION_MS + 10);
    });
    show('ov-5', 'd1');
    expect(screen.queryByTestId('skill-activation-card')).toBeNull();
  });
});
