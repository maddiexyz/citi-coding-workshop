import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Context as ResponsiveContext } from 'react-responsive';
import AuthContext from '../../auth/authContext';
import BudgetPanel from './BudgetPanel';
import BudgetSummary from './BudgetSummary';
import { getBudgetSummary, listBudgetEntries } from '../../services/budgetApi';
import validateBudgetEntry from '../../utils/budgetEntryValidation';

vi.mock('../../services/budgetApi', () => ({
  getBudgetSummary: vi.fn(), listBudgetEntries: vi.fn(),
  createBudgetEntry: vi.fn(), updateBudgetEntry: vi.fn(), deleteBudgetEntry: vi.fn(),
}));

const CATEGORIES = ['labor', 'software', 'hardware', 'travel', 'other'].map((category) => ({ category, amount: '0.00' }));
const OVER = {
  project_id: 1, currency: 'INR', budget_set: true, budget_planned: '100000.00', actual: '110000.00',
  remaining: '-10000.00', burn_pct: '110.0', over_budget: true, entry_count: 2,
  by_category: [{ category: 'labor', amount: '60000.00' }, { category: 'software', amount: '50000.00' }, ...CATEGORIES.slice(2)],
};
const PROJECT = { id: 1, code: 'B-1', name: 'B', status: 'active', owner_id: 7 };
const ENTRY = { id: 4, project_id: 1, category: 'labor', amount: '120000.00', spent_on: '2030-01-15', description: 'Contractor' };

function renderAs(user) {
  getBudgetSummary.mockResolvedValue(OVER);
  listBudgetEntries.mockResolvedValue([ENTRY]);
  render(
    <ResponsiveContext.Provider value={{ width: 1200 }}>
      <AuthContext.Provider value={{ user, loading: false, notice: null, login: vi.fn(), logout: vi.fn() }}>
        <BudgetPanel project={PROJECT} onChanged={vi.fn()} />
      </AuthContext.Provider>
    </ResponsiveContext.Provider>,
  );
}

describe('BudgetSummary', () => {
  it('shows burn and the over-budget flag', () => {
    render(<BudgetSummary summary={OVER} />);
    expect(screen.getByText('110.0%')).toBeInTheDocument();
    expect(screen.getByText('Over budget')).toBeInTheDocument();
    expect(screen.getByText('-₹10,000.00')).toBeInTheDocument();
    expect(screen.getByText('₹1,00,000.00')).toBeInTheDocument();   // Indian digit grouping
  });

  it('says "No budget set" instead of dividing by zero', () => {
    render(<BudgetSummary summary={{ ...OVER, budget_set: false, budget_planned: null, remaining: null, burn_pct: null, over_budget: false }} />);
    expect(screen.getByText('No budget set')).toBeInTheDocument();
    expect(screen.queryByText(/% of the planned budget/)).not.toBeInTheDocument();
  });
});

describe('BudgetPanel', () => {
  it('shows a viewer the summary only', async () => {
    renderAs({ id: 9, role: 'viewer' });
    expect(await screen.findByText('Spent')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Spend entries' })).not.toBeInTheDocument();
    expect(listBudgetEntries).not.toHaveBeenCalled();
  });

  it('lets the owning PM record and edit spend but not delete it', async () => {
    renderAs({ id: 7, role: 'project_manager' });
    expect(await screen.findByRole('table', { name: 'Spend entries' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record spend' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit spend of ₹1,20,000.00' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete spend of ₹1,20,000.00' })).not.toBeInTheDocument();
  });

  it('lets an admin delete spend', async () => {
    renderAs({ id: 1, role: 'admin' });
    expect(await screen.findByRole('button', { name: 'Delete spend of ₹1,20,000.00' })).toBeInTheDocument();
  });
});

describe('validateBudgetEntry', () => {
  it.each([['-1'], ['1.234'], ['abc'], ['']])('rejects amount %s', (amount) => {
    expect(validateBudgetEntry({ amount, spent_on: '2030-01-01', description: '' })).toHaveProperty('amount');
  });

  it('accepts exact amounts', () => {
    expect(validateBudgetEntry({ amount: '1234.50', spent_on: '2030-01-01', description: '' })).toEqual({});
  });
});
