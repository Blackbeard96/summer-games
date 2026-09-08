import { resolveCanonicalPP } from '../playerPowerPoints';

describe('resolveCanonicalPP', () => {
  it('uses student PP when no vault exists', () => {
    expect(
      resolveCanonicalPP({ vaultExists: false, vaultPP: 0, studentPP: 400 })
    ).toBe(400);
  });

  it('prefers vault over higher student PP (spend must stick)', () => {
    expect(
      resolveCanonicalPP({ vaultExists: true, vaultPP: 50, studentPP: 400 })
    ).toBe(50);
  });

  it('keeps vault at 0 after spend-to-zero (does not pull student balance)', () => {
    expect(
      resolveCanonicalPP({ vaultExists: true, vaultPP: 0, studentPP: 200 })
    ).toBe(0);
  });

  it('uses vault when student is lower (generator / vault-only credit)', () => {
    expect(
      resolveCanonicalPP({ vaultExists: true, vaultPP: 150, studentPP: 100 })
    ).toBe(150);
  });
});
