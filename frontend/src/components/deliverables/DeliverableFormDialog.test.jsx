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
      project_id: 7, title: 'Spec', description: null, status: 'not_started', due_date: null, assignee_resource_id: null,
      estimate_days: null, earliest_start: null, progress_pct: 0,
    });
    expect(onChanged).toHaveBeenCalledWith({ id: 1, title: 'Spec' }, 'Created');
    expect(onClose).toHaveBeenCalled();
  });

  it('sends the estimate, earliest start and progress', async () => {
    createDeliverable.mockResolvedValue({ id: 3, title: 'Build' });
    renderDialog();
    await userEvent.type(screen.getByLabelText(/title/i), 'Build');
    await userEvent.type(screen.getByLabelText('Estimate (working days)'), '8');
    await userEvent.type(screen.getByLabelText('Earliest start'), '2031-03-03');
    await userEvent.clear(screen.getByLabelText('Progress %'));
    await userEvent.type(screen.getByLabelText('Progress %'), '25');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(createDeliverable).toHaveBeenLastCalledWith(expect.objectContaining({
      estimate_days: 8, earliest_start: '2031-03-03', progress_pct: 25,
    }));
  });

  it('checks the estimate and progress ranges before calling the backend', async () => {
    createDeliverable.mockClear();
    renderDialog();
    await userEvent.type(screen.getByLabelText(/title/i), 'Build');
    await userEvent.type(screen.getByLabelText('Estimate (working days)'), '400');
    await userEvent.clear(screen.getByLabelText('Progress %'));
    await userEvent.type(screen.getByLabelText('Progress %'), '150');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Must be a whole number from 1 to 365')).toBeInTheDocument();
    expect(screen.getByText('Must be a whole number from 0 to 100')).toBeInTheDocument();
    expect(createDeliverable).not.toHaveBeenCalled();
  });

  it('offers active people as assignees', async () => {
    createDeliverable.mockResolvedValue({ id: 2, title: 'Spec' });
    renderDialog({ people: [{ id: 4, full_name: 'Pat Lee' }] });
    await userEvent.type(screen.getByLabelText(/title/i), 'Spec');
    await userEvent.click(screen.getByRole('combobox', { name: 'Assignee' }));
    await userEvent.click(screen.getByRole('option', { name: 'Pat Lee' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(createDeliverable).toHaveBeenLastCalledWith(expect.objectContaining({ assignee_resource_id: 4 }));
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
