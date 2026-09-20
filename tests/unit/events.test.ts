import { describe, expect, it } from 'vitest';
import { flushBackground } from '@/platform/background';
import { emit, subscribe, type DomainEvent } from '@/platform/events';

const event: DomainEvent = { type: 'posse.requested', actorId: 'a', targetId: 'b' };

describe('domain events', () => {
  it('reach every listener, after the caller has moved on', async () => {
    const seen: string[] = [];
    const stopA = subscribe(async (e) => void seen.push(`a:${e.type}`));
    const stopB = subscribe(async (e) => void seen.push(`b:${e.type}`));
    emit(event);
    expect(seen).toEqual([]); // nothing ran synchronously inside emit()
    await flushBackground();
    expect(seen).toEqual(['a:posse.requested', 'b:posse.requested']);
    stopA();
    stopB();
  });

  it('a listener that throws never reaches the caller and does not stop the others', async () => {
    const seen: string[] = [];
    const stopBad = subscribe(async () => {
      throw new Error('boom');
    });
    const stopGood = subscribe(async () => void seen.push('ok'));
    expect(() => emit(event)).not.toThrow();
    await flushBackground();
    expect(seen).toEqual(['ok']);
    stopBad();
    stopGood();
  });

  it('with nobody listening it is a harmless no-op, and stopping really stops', async () => {
    const seen: string[] = [];
    const stop = subscribe(async () => void seen.push('x'));
    stop();
    emit(event);
    await flushBackground();
    expect(seen).toEqual([]);
  });

  it('the same handler subscribed twice runs once', async () => {
    let n = 0;
    const handler = async () => void n++;
    const s1 = subscribe(handler);
    const s2 = subscribe(handler);
    emit(event);
    await flushBackground();
    expect(n).toBe(1);
    s1();
    s2();
  });
});
