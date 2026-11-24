import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DependencyEditor from './DependencyEditor';
import { ApiError } from '../../services/api';
import { addDependency } from '../../services/deliverablesApi';

vi.mock('../../services/deliverablesApi', () => ({
  addDependency: vi.fn(),
  removeDependency: vi.fn(),
  getDeliverable: vi.fn(),
}));

const C = {
  id: 3, project_id: 1, title: 'C', status: 'not_started', is_blocked: false, is_overdue: false,
  predecessors: [], successors: [{ id: 2, title: 'B', status: 'not_started' }],
};
const OPTIONS = [
  { id: 1, title: 'A', status: 'not_started' },
  { id: 2, title: 'B', status: 'not_started' },
  { id: 3, title: 'C', status: 'not_started' },
];

describe('DependencyEditor', () => {
  it('shows the chain and offers only valid choices', async () => {
    render(<DependencyEditor deliverable={C} options={OPTIONS} onChange={vi.fn()} />);
    expect(screen.getByText('Needed by')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Add a dependency'));
    const choices = screen.getAllByRole('option').map((option) => option.textContent);
    expect(choices).toEqual(['A', 'B']);   // not itself
  });

  it('shows a cycle error under the picker', async () => {
    addDependency.mockRejectedValue(new ApiError(409, 'dependency_cycle', 'This dependency would create a cycle',
      { depends_on_id: 'C → A → B → C' }));
    const onChange = vi.fn();
    render(<DependencyEditor deliverable={C} options={OPTIONS} onChange={onChange} />);

    await userEvent.click(screen.getByLabelText('Add a dependency'));
    await userEvent.click(screen.getByRole('option', { name: 'A' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText('This dependency would create a cycle: C → A → B → C')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('hides editing controls when read-only', () => {
    render(<DependencyEditor deliverable={C} options={OPTIONS} readOnly onChange={vi.fn()} />);
    expect(screen.queryByLabelText('Add a dependency')).not.toBeInTheDocument();
  });
});
