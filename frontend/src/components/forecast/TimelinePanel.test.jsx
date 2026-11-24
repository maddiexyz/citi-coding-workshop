import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Context as ResponsiveContext } from 'react-responsive';
import TimelinePanel from './TimelinePanel';
import { getForecast } from '../../services/forecastApi';

vi.mock('../../services/forecastApi', async (original) => ({ ...(await original()), getForecast: vi.fn() }));

const PROJECT = { id: 3, code: 'WEB-1', name: 'Website', status: 'active', owner_id: 7 };
const ITEM = (id, title, extra = {}) => ({
  id, title, status: 'not_started', start: '2026-11-25', finish: '2026-11-27', due_date: '2026-11-30',
  remaining_days: 3, float_days: 0, critical: true, assumed: false, ...extra,
});
const FORECAST = {
  today: '2026-11-25', status: 'late', planned_end: '2026-11-30', forecast_end: '2026-12-07', slip_days: 7,
  items: [
    ITEM(3, 'Build', { start: '2026-11-30', finish: '2026-12-07', remaining_days: 6, due_date: null }),
    ITEM(1, 'Design'),
    ITEM(2, 'A deliverable with a very long descriptive title', { critical: false, float_days: 4, assumed: true }),
    ITEM(4, 'Kick-off', { status: 'done', start: null, finish: '2026-11-20', remaining_days: 0, critical: false, float_days: null }),
  ],
};

function renderPanel(forecast, width = 1200) {
  getForecast.mockResolvedValue(forecast);
  return render(
    <ResponsiveContext.Provider value={{ width }}>
      <TimelinePanel project={PROJECT} />
    </ResponsiveContext.Provider>,
  );
}

describe('TimelinePanel', () => {
  it('draws the remaining deliverables as a chart with a text summary and tooltips', async () => {
    const { container } = renderPanel(FORECAST);
    expect(screen.getByRole('progressbar', { name: 'Loading timeline' })).toBeInTheDocument();
    const chart = await screen.findByRole('img', { name: /Timeline of 3 remaining deliverables: forecast end 7 Dec 2026, planned end 30 Nov 2026/ });
    expect(screen.getByText('7 days late')).toBeInTheDocument();
    const tips = [...container.querySelectorAll('svg title')].map((t) => t.textContent);
    expect(tips).toEqual([
      'Design: 25 Nov 2026 to 27 Nov 2026, 3 days left, on the critical path, due 30 Nov 2026',
      'A deliverable with a very long descriptive title: 25 Nov 2026 to 27 Nov 2026, 3 days left, 4 days of float, due 30 Nov 2026',
      'Build: 30 Nov 2026 to 7 Dec 2026, 6 days left, on the critical path',
    ]);
    expect(within(chart).getByText('Design ◆')).toBeInTheDocument();
    expect(within(chart).getByText('A deliverable with a very lon…')).toBeInTheDocument();
    expect(within(chart).getByText('Today')).toBeInTheDocument();
    expect(within(chart).getByText('Planned end')).toBeInTheDocument();
    expect(within(chart).getByText('30 Nov')).toBeInTheDocument();          // a Monday tick
    expect(within(screen.getByRole('list', { name: 'Legend' })).getAllByRole('listitem')).toHaveLength(6);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('offers the same data as a table', async () => {
    renderPanel(FORECAST);
    await userEvent.click(await screen.findByRole('button', { name: 'Table' }));
    const table = screen.getByRole('table', { name: 'Timeline' });
    const rows = within(table).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell').map((c) => c.textContent));
    expect(within(table).getAllByRole('rowheader').map((h) => h.textContent)).toEqual([
      'Design', 'A deliverable with a very long descriptive title', 'Build']);
    expect(rows[1]).toEqual(['Not started', '25 Nov 2026', '27 Nov 2026', '30 Nov 2026', '3 (assumed)', '4', 'No']);
    expect(rows[2]).toEqual(['Not started', '30 Nov 2026', '7 Dec 2026', '—', '6', '0', 'Yes']);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('is a list on mobile, without a chart or a table', async () => {
    renderPanel(FORECAST, 400);
    const list = await screen.findByRole('list', { name: 'Timeline' });
    const cards = within(list).getAllByRole('listitem');
    expect(cards).toHaveLength(3);
    expect(cards[1]).toHaveTextContent('25 Nov 2026 – 27 Nov 2026 · 3 days left (assumed) · due 30 Nov 2026 · 4 days of float');
    expect(within(cards[0]).getByText('Critical')).toBeInTheDocument();
    expect(within(cards[1]).queryByText('Critical')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('draws a chart without a planned end', async () => {
    renderPanel({ ...FORECAST, planned_end: null, slip_days: null, status: 'on_track' });
    const chart = await screen.findByRole('img', { name: /forecast end 7 Dec 2026\. The table/ });
    expect(within(chart).queryByText('Planned end')).not.toBeInTheDocument();
  });

  it.each([
    ['no_estimates', /add an estimate/],
    ['no_deliverables', 'No deliverables yet.'],
    ['complete', /nothing left to schedule/],
  ])('explains an empty timeline (%s)', async (status, text) => {
    renderPanel({ ...FORECAST, status, forecast_end: status === 'complete' ? '2026-11-20' : null, items: [FORECAST.items[3]] });
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows an error when the forecast cannot be loaded', async () => {
    getForecast.mockRejectedValue(new Error('Something went wrong'));
    render(<TimelinePanel project={PROJECT} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  });
});
