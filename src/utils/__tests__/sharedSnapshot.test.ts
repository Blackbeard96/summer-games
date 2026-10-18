import { onSnapshot } from 'firebase/firestore';
import { sharedSnapshot } from '../sharedSnapshot';

jest.mock('firebase/firestore', () => ({ onSnapshot: jest.fn() }));

const mockOnSnapshot = onSnapshot as unknown as jest.Mock;
const target = { type: 'collection' } as never;

describe('sharedSnapshot', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockOnSnapshot.mockReset();
  });
  afterEach(() => jest.useRealTimers());

  it('reuses one listener across subscribers and quick remounts', () => {
    const unsub = jest.fn();
    let emit: (s: unknown) => void = () => undefined;
    mockOnSnapshot.mockImplementation((_t, next) => {
      emit = next;
      return unsub;
    });

    const a = jest.fn();
    const stopA = sharedSnapshot('k1', target, a);
    stopA();
    const stopA2 = sharedSnapshot('k1', target, a);
    const b = jest.fn();
    const stopB = sharedSnapshot('k1', target, b);
    emit({ docs: [] });

    expect(mockOnSnapshot).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    stopA2();
    stopB();
    expect(unsub).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2000);
    expect(unsub).toHaveBeenCalledTimes(1);
  });

  it('does not relisten a denied target during the cool-down', async () => {
    mockOnSnapshot.mockImplementation((_t, _next, fail) => {
      fail({ code: 'permission-denied' });
      return jest.fn();
    });
    const failA = jest.fn();
    sharedSnapshot('k2', target, jest.fn(), failA)();
    const failB = jest.fn();
    sharedSnapshot('k2', target, jest.fn(), failB);
    await Promise.resolve();

    expect(mockOnSnapshot).toHaveBeenCalledTimes(1);
    expect(failA).toHaveBeenCalledTimes(1);
    expect(failB).toHaveBeenCalledTimes(1);
  });
});
