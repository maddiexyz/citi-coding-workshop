import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DeliverableFormDialog from './DeliverableFormDialog';
import { ApiError } from '../../services/api';
import { createDeliverable } from '../../services/deliverablesApi';

vi.mock('../../services/deliverablesApi', () => ({
  createDeliverable: vi.fn(),
  updateDeliverable: vi.fn(),
  getDeliverable: vi.fn(),
  addDependency: vi.fn(),
  removeDependency: vi.fn(),
}));

function renderDialog(props = {}) {
  const handlers = { onClose: vi.fn(), onChanged: vi.fn() };
  render(<DeliverableFormDialog open projectId={7} projectDeliverables={[]} {...handlers} {...props} />);
  return handlers;
}

describe('DeliverableFormDialog', () => {
  it('requires a title before calling the backend', async () => {
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Title is required')).toBeInTheDocument();
    expect(createDeliverable).not.toHaveBeenCalled();
  });

  it('creates a deliverable in the project and reports it', async () => {
    createDeliverable.mockResolvedValue({ id: 1, title: 'Spec' });
    const { onChanged, onClose } = renderDialog();
    await userEvent.type(screen.getByLabelText(/title/i), '  Spec ');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(createDeliverable).toHaveBeenCalledWith({
      project_id: 7, title: 'Spec', description: null, status: 'not_started', due_date: null,
    });
    expect(onChanged).toHaveBeenCalledWith({ id: 1, title: 'Spec' }, 'Created');
    expect(onClose).toHaveBeenCalled();
  });

  it('shows backend field errors next to the field', async () => {
    createDeliverable.mockRejectedValue(new ApiError(400, 'validation_error', 'Some fields are invalid',
      { due_date: 'Must be a date in YYYY-MM-DD format' }));
    const { onClose } = renderDialog();
    await userEvent.type(screen.getByLabelText(/title/i), 'Spec');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Must be a date in YYYY-MM-DD format')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Some fields are invalid');
    expect(onClose).not.toHaveBeenCalled();
  });
});
