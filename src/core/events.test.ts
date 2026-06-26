import { describe, it, expect } from 'vitest';
import { EventBus } from './events';

interface M {
  ping: { n: number };
  pong: { s: string };
}

describe('EventBus', () => {
  it('delivers payloads to subscribers in subscription order', () => {
    const bus = new EventBus<M>();
    const seen: number[] = [];
    bus.on('ping', (p) => seen.push(p.n * 1));
    bus.on('ping', (p) => seen.push(p.n * 2));
    bus.emit('ping', { n: 5 });
    expect(seen).toEqual([5, 10]);
  });

  it('hasListeners gates emission (so emitters can skip building a payload)', () => {
    const bus = new EventBus<M>();
    expect(bus.hasListeners('ping')).toBe(false);
    const off = bus.on('ping', () => {});
    expect(bus.hasListeners('ping')).toBe(true);
    off();
    expect(bus.hasListeners('ping')).toBe(false);
  });

  it('unsubscribe stops delivery; other event types are independent', () => {
    const bus = new EventBus<M>();
    let pings = 0;
    let pongs = 0;
    const off = bus.on('ping', () => pings++);
    bus.on('pong', () => pongs++);
    bus.emit('ping', { n: 1 });
    off();
    bus.emit('ping', { n: 1 });
    bus.emit('pong', { s: 'x' });
    expect(pings).toBe(1);
    expect(pongs).toBe(1);
  });

  it('emitting with no listeners is a harmless no-op', () => {
    const bus = new EventBus<M>();
    expect(() => bus.emit('ping', { n: 1 })).not.toThrow();
  });
});
