import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ActivityPanel from './ActivityPanel';
import { listAudit } from '../../services/auditApi';

vi.mock('../../services/auditApi', () => ({ listAudit: vi.fn() }));

describe('ActivityPanel', () => {
  it('lists changes with who, what and old → new values', async () => {
    listAudit.mockResolvedValue([{
      id: 1, action: 'update', entity_type: 'project', entity_id: 1, summary: 'Updated project B-1',
      actor_name: 'Pat PM', occurred_at: '2030-01-15T10:00:00Z',
      old_values: { budget_planned: '1000.00' }, new_values: { budget_planned: '1500.00' },
    }]);
    render(<ActivityPanel project={{ id: 1, code: 'B-1', name: 'B', status: 'active', owner_id: 7 }} />);

    expect(await screen.findByText('Updated project B-1')).toBeInTheDocument();
    expect(screen.getByText(/Pat PM/)).toBeInTheDocument();
    expect(screen.getByText('1000.00')).toBeInTheDocument();
    expect(screen.getByText(/→ 1500.00/)).toBeInTheDocument();
    expect(listAudit).toHaveBeenCalledWith({ project_id: 1, entity_type: '', limit: 200 });
  });
});
