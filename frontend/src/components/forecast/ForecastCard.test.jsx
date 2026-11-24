import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import ForecastCard from './ForecastCard';
import SlipChip from './SlipChip';
import { criticalIds, getForecast } from '../../services/forecastApi';

vi.mock('../../services/forecastApi', async (original) => ({ ...(await original()), getForecast: vi.fn() }));

const PROJECT = { id: 3, code: 'WEB-1', name: 'Website', status: 'active', owner_id: 7, end_date: '2026-11-30' };
const ITEM = (id, title, extra = {}) => ({
  id, title, status: 'not_started', start: '2026-11-25', finish: '2026-11-27', remaining_days: 3, float_days: 0,
  critical: true, assumed: false, ...extra,
});
const LATE = {
  status: 'late', planned_end: '2026-11-30', forecast_end: '2026-12-07', slip_days: 7,
  confidence: { level: 'medium', estimated: 2, remaining: 3 },
  spi: { value: 0.67, earned: 2, planned: 3, explanation: 'SPI 0.67: 2.0 working days of work done against 3.0 planned by today - about 33% behind plan.' },
  critical_path: [1, 3],
  items: [ITEM(1, 'Design'), ITEM(2, 'Docs', { critical: false, float_days: 4 }),
    ITEM(3, 'Build', { start: '2026-11-30', finish: '2026-12-07', remaining_days: 6, assumed: true })],
};

describe('ForecastCard', () => {
  it('shows a late forecast next to the planned end, with confidence, SPI and the critical path', async () => {
    getForecast.mockResolvedValue(LATE);
    render(<ForecastCard project={PROJECT} />);
    expect(screen.getByRole('progressbar', { name: 'Loading forecast' })).toBeInTheDocument();
    const card = await screen.findByRole('region', { name: 'Completion forecast' });
    expect(await within(card).findByText('7 Dec 2026')).toBeInTheDocument();
    expect(getForecast).toHaveBeenCalledWith(3);
    expect(within(card).getByText('30 Nov 2026')).toBeInTheDocument();
    expect(within(card).getByText('7 days late')).toBeInTheDocument();
    expect(within(card).getByText('Medium confidence')).toBeInTheDocument();
    expect(within(card).getByText(/2 of 3 remaining deliverables have an estimate; the other 1 is assumed/)).toBeInTheDocument();
    expect(within(card).getByText('0.67')).toBeInTheDocument();
    expect(within(card).getByText(/about 33% behind plan/)).toBeInTheDocument();
    const path = within(card).getByRole('list', { name: 'Critical path' });
    const steps = within(path).getAllByRole('listitem');
    expect(steps.map((li) => li.textContent)).toEqual([
      'Design — 25 Nov 2026 to 27 Nov 2026 (3 days left)',
      'Build — 30 Nov 2026 to 7 Dec 2026 (6 days left, assumed estimate)',
    ]);
  });

  it('shows an on-track forecast and says when low confidence is not flagged', async () => {
    getForecast.mockResolvedValue({
      ...LATE, status: 'on_track', forecast_end: '2026-11-27', slip_days: -3,
      confidence: { level: 'low', estimated: 1, remaining: 3 }, spi: { ...LATE.spi, value: null, explanation: 'Nothing planned yet.' },
    });
    render(<ForecastCard project={PROJECT} />);
    expect(await screen.findByText('3 days early')).toBeInTheDocument();
    expect(screen.getByText('Low confidence')).toBeInTheDocument();
    expect(screen.getByText(/the other 2 are assumed.*not raised as a risk/)).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('explains what is missing when there is nothing to forecast', async () => {
    getForecast.mockResolvedValue({ ...LATE, status: 'no_estimates', forecast_end: null, critical_path: [], items: [] });
    const { unmount } = render(<ForecastCard project={PROJECT} />);
    expect(await screen.findByText(/add an estimate \(working days\)/)).toBeInTheDocument();
    unmount();
    getForecast.mockResolvedValue({ ...LATE, status: 'no_deliverables', forecast_end: null, critical_path: [], items: [] });
    render(<ForecastCard project={PROJECT} />);
    expect(await screen.findByText('No deliverables to forecast yet.')).toBeInTheDocument();
  });

  it('shows when everything is finished', async () => {
    getForecast.mockResolvedValue({
      ...LATE, status: 'complete', forecast_end: '2026-11-18', slip_days: -12, critical_path: [],
      confidence: { level: null, estimated: 0, remaining: 0 },
    });
    render(<ForecastCard project={PROJECT} />);
    expect(await screen.findByText('Finished')).toBeInTheDocument();
    expect(screen.getByText('Every deliverable is done or cancelled.')).toBeInTheDocument();
    expect(screen.queryByText('Critical path')).not.toBeInTheDocument();
  });

  it('shows an error when the forecast cannot be loaded', async () => {
    getForecast.mockRejectedValue(new Error('Something went wrong'));
    render(<ForecastCard project={PROJECT} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  });
});

describe('SlipChip and criticalIds', () => {
  it('words the slip', () => {
    const { container } = render(<><SlipChip slipDays={1} /><SlipChip slipDays={0} /><SlipChip slipDays={-1} /><SlipChip slipDays={null} /></>);
    expect(container.textContent).toBe('1 day lateOn time1 day early');
  });

  it('collects the ids of critical items', () => {
    expect([...criticalIds(LATE)]).toEqual([1, 3]);
  });
});
