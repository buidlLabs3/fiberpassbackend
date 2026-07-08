import { EventEmitter } from 'node:events';

class LiveEvents extends EventEmitter {
  publish(eventName: string, payload: unknown): void {
    this.emit(eventName, payload);
  }
}

export const liveEvents = new LiveEvents();
liveEvents.setMaxListeners(100);
