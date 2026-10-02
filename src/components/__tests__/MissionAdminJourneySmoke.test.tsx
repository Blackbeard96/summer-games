import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

jest.mock('../../firebase', () => ({ db: {}, auth: {}, storage: {} }));
jest.mock('firebase/firestore', () => {
  const actual = jest.requireActual('firebase/firestore');
  return {
    ...actual,
    collection: jest.fn(() => ({})),
    doc: jest.fn(() => ({ id: 'draft123' })),
    query: jest.fn(() => ({})),
    orderBy: jest.fn(() => ({})),
    where: jest.fn(() => ({})),
    getDocs: jest.fn(async () => ({ docs: [], forEach: () => {} })),
    getDoc: jest.fn(async () => ({ exists: () => false })),
    setDoc: jest.fn(async () => {}),
    updateDoc: jest.fn(async () => {}),
    deleteDoc: jest.fn(async () => {}),
    serverTimestamp: jest.fn(() => 'ts'),
  };
});

import MissionAdmin from '../MissionAdmin';

describe('MissionAdmin Journey editing (smoke)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem('missionAdmin.ui.v1', JSON.stringify({ listFilter: 'journey', showCreateModal: false }));
  });

  it('opens the Journey step editor for a core challenge', async () => {
    render(<MissionAdmin />);
    await waitFor(() => expect(screen.getAllByText(/Core Journey/).length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    expect(await screen.findByText('Edit Journey Step')).toBeInTheDocument();
    expect(screen.getByText('XP Reward')).toBeInTheDocument();
  });

  it('pre-fills a new mission as the step after a core challenge', async () => {
    render(<MissionAdmin />);
    await waitFor(() => expect(screen.getAllByText(/Core Journey/).length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByRole('button', { name: '+ Step After' })[2]);
    expect(await screen.findByRole('heading', { name: 'Create Mission' })).toBeInTheDocument();
    const checkbox = screen.getByLabelText(/Add as a numbered step/) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    const placeAfter = selects.find((s) => within(s).queryByText('End of chapter'))!;
    expect(placeAfter.selectedOptions[0].textContent).toMatch(/^1-3 /);
  });
});
