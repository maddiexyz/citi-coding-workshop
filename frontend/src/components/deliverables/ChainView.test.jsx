import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChainView from './ChainView';
import buildTree from '../../utils/chainTree';
import { getChain } from '../../services/deliverablesApi';

vi.mock('../../services/deliverablesApi', () => ({ getChain: vi.fn() }));

const NODE = (id, title, extra = {}) => ({ id, title, status: 'not_started', due_date: null, is_blocked: false,
  is_overdue: false, assignee_resource_id: null, assignee_name: null, ...extra });
const CHAIN = {
  nodes: [NODE(1, 'Ingest'), NODE(2, 'Model', { is_blocked: true }), NODE(3, 'Dashboards', { is_blocked: true, is_overdue: true })],
  rows: [{ id: 1, depth: 0, path: [1] }, { id: 2, depth: 1, path: [1, 2] }, { id: 3, depth: 2, path: [1, 2, 3] }],
};

describe('buildTree', () => {
  it('nests rows by depth and keeps a node under every parent', () => {
    const tree = buildTree([
      { id: 1, depth: 0, path: [1] }, { id: 2, depth: 1, path: [1, 2] }, { id: 4, depth: 2, path: [1, 2, 4] },
      { id: 3, depth: 1, path: [1, 3] }, { id: 4, depth: 2, path: [1, 3, 4] },
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].children.map((c) => [c.id, c.children.map((g) => g.key)])).toEqual([[2, ['1-2-4']], [3, ['1-3-4']]]);
  });
});

describe('ChainView', () => {
  it('shows the chain as nested lists and opens a deliverable', async () => {
    getChain.mockResolvedValue(CHAIN);
    const onOpen = vi.fn();
    render(<ChainView projectId={4} reloadKey={0} onOpen={onOpen} />);
    const chain = await screen.findByRole('navigation', { name: 'Dependency chain' });
    const top = within(chain).getAllByRole('list')[0];
    expect(within(top).getAllByRole('listitem')).toHaveLength(3);          // nested inside the first item
    expect(within(chain).getByRole('button', { name: 'Dashboards' })).toBeInTheDocument();
    expect(within(chain).getAllByText('Blocked')).toHaveLength(2);
    expect(within(chain).getByText('Overdue')).toBeInTheDocument();
    await userEvent.click(within(chain).getByRole('button', { name: 'Model' }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 2, title: 'Model' }));
    expect(getChain).toHaveBeenCalledWith(4);
  });

  it('explains when there are no dependencies', async () => {
    getChain.mockResolvedValue({ nodes: [], rows: [] });
    render(<ChainView projectId={4} reloadKey={0} onOpen={vi.fn()} />);
    expect(await screen.findByText(/No dependencies in this project yet/)).toBeInTheDocument();
  });

  it('shows a load error', async () => {
    getChain.mockRejectedValue(new Error('Chain unavailable'));
    render(<ChainView projectId={4} reloadKey={0} onOpen={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Chain unavailable');
  });
});
