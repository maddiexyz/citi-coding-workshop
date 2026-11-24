import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import AuthContext from './authContext';
import useYou from './useYou';

function youAs(user) {
  const wrapper = ({ children }) => <AuthContext.Provider value={{ user }}>{children}</AuthContext.Provider>;
  return renderHook(() => useYou(), { wrapper }).result.current;
}

describe('useYou', () => {
  const me = { id: 7, resource_id: 3 };

  it('labels the signed-in user and their linked person', () => {
    const you = youAs(me);
    expect(you.user(7, 'Pat')).toBe('Pat (you)');
    expect(you.user(8, 'Sam')).toBe('Sam');
    expect(you.resource(3, 'Pat Lee')).toBe('Pat Lee (you)');
    expect(you.resource(4, 'Sam Roe')).toBe('Sam Roe');
  });

  it('leaves missing names and unlinked accounts alone', () => {
    expect(youAs(me).user(7, null)).toBeNull();
    expect(youAs({ id: 7, resource_id: null }).resource(null, 'Nobody')).toBe('Nobody');
    expect(renderHook(() => useYou()).result.current.user(7, 'Pat')).toBe('Pat');   // no provider
  });
});
