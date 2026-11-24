import { describe, expect, it } from 'vitest';
import validateProject from './projectValidation';

const valid = { code: 'acme-01', name: 'Data platform', description: '', start_date: '', end_date: '' };

describe('validateProject', () => {
  it('accepts a valid project (code is case-insensitive)', () => {
    expect(validateProject(valid)).toEqual({});
  });

  it('requires code and name', () => {
    expect(validateProject({ ...valid, code: ' ', name: '' })).toEqual({
      code: 'Code is required', name: 'Name is required',
    });
  });

  it('rejects an end date before the start date', () => {
    const errors = validateProject({ ...valid, start_date: '2026-05-01', end_date: '2026-04-30' });
    expect(errors.end_date).toMatch(/on or after/);
  });
});
