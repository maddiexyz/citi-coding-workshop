import { describe, expect, it } from 'vitest';
import validateAllocation from './allocationValidation';
import validateResource from './resourceValidation';
import overAllocationMessage from '../components/allocations/overAllocationMessage';

const PROJECT = { start_date: '2030-01-01', end_date: '2030-12-31' };
const OK = { resource_id: 1, hours_per_week: '20', start_date: '2030-01-07', end_date: '2030-01-13' };

describe('validateAllocation', () => {
  it('accepts a valid allocation', () => {
    expect(validateAllocation(OK, PROJECT)).toEqual({});
  });

  it.each([
    [{ resource_id: null }, 'resource_id'],
    [{ hours_per_week: '0' }, 'hours_per_week'],
    [{ hours_per_week: '81' }, 'hours_per_week'],
    [{ start_date: '2029-12-31' }, 'start_date'],
    [{ end_date: '2031-01-01' }, 'end_date'],
    [{ end_date: '2030-01-06' }, 'end_date'],
  ])('rejects %o', (change, field) => {
    expect(Object.keys(validateAllocation({ ...OK, ...change }, PROJECT))).toEqual([field]);
  });

  it('allows any dates when the project has none', () => {
    expect(validateAllocation({ ...OK, start_date: '2001-01-01' }, {})).toEqual({});
  });
});

describe('validateResource', () => {
  it.each([
    [{ full_name: ' ' }, 'full_name'],
    [{ weekly_hours: '61' }, 'weekly_hours'],
    [{ weekly_hours: '' }, 'weekly_hours'],
    [{ email: 'nope' }, 'email'],
  ])('rejects %o', (change, field) => {
    const values = { full_name: 'Pat', email: '', weekly_hours: '40', ...change };
    expect(Object.keys(validateResource(values))).toEqual([field]);
  });
});

describe('overAllocationMessage', () => {
  it('names the person, the first week and how many more', () => {
    const message = overAllocationMessage('Pat', [
      { week_start: '2030-01-07', total_hours: '50.00', weekly_hours: '40.00', over_by: '10.00' },
      { week_start: '2030-01-14', total_hours: '45.00', weekly_hours: '40.00', over_by: '5.00' },
    ]);
    expect(message).toBe('Saved, but Pat is over-allocated in the week of 7 Jan 2030: 50 h of 40 h (+10 h) and 1 more week(s).');
  });
});
