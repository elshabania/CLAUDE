import { describe, expect, it } from 'vitest';
import { CONTENT, validateContent } from '../../src/data/index';

describe('content data', () => {
  it('validates with no cross-reference errors', () => {
    expect(validateContent()).toEqual([]);
  });
  it('has 30 species, 10 types, >= 80 moves', () => {
    expect(Object.keys(CONTENT.species)).toHaveLength(30);
    expect(Object.keys(CONTENT.typeMatrix)).toHaveLength(10);
    expect(Object.keys(CONTENT.moves).length).toBeGreaterThanOrEqual(81);
  });
  it('starter triangle species types', () => {
    expect(CONTENT.species.c01.types[0]).toBe('electric');
    expect(CONTENT.species.c04.types[0]).toBe('fire');
    expect(CONTENT.species.c07.types[0]).toBe('water');
  });
});
