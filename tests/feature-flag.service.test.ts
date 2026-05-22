import { FeatureFlagService } from '../src/feature-flags/feature-flag.service';

describe('FeatureFlagService', () => {
  const svc = FeatureFlagService.getInstance();

  it('is a singleton', () => {
    expect(FeatureFlagService.getInstance()).toBe(svc);
  });

  it('returns typed values for known flags', () => {
    expect(typeof svc.get('STREAMING_ENABLED')).toBe('boolean');
    expect(typeof svc.get('PAGINATION_LIMIT')).toBe('number');
  });

  it('updates valid values and emits a change event', (done) => {
    const next = !svc.get('STREAMING_ENABLED');
    svc.once('change', (payload) => {
      expect(payload.key).toBe('STREAMING_ENABLED');
      expect(payload.next).toBe(next);
      done();
    });
    expect(svc.set('STREAMING_ENABLED', next)).toBe(true);
  });

  it('rejects invalid PAGINATION_LIMIT values', () => {
    // out of range (still a number — caught by the runtime validator, not TS)
    expect(svc.set('PAGINATION_LIMIT', 9999)).toBe(false);
    // wrong type
    // @ts-expect-error testing runtime validation
    expect(svc.set('PAGINATION_LIMIT', 'lots')).toBe(false);
  });

  it('reloads from a partial source', () => {
    svc.reload({ PAGINATION_LIMIT: 50 });
    expect(svc.get('PAGINATION_LIMIT')).toBe(50);
  });
});
