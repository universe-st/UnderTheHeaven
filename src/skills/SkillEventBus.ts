import type { SkillTiming, SkillContext } from './SkillTypes';

type SkillContextHandler = (context: SkillContext) => void | Promise<void>;

export class SkillEventBus {
  private listeners: Map<SkillTiming, SkillContextHandler[]> = new Map();

  on(timing: SkillTiming, handler: SkillContextHandler): void {
    if (!this.listeners.has(timing)) {
      this.listeners.set(timing, []);
    }
    this.listeners.get(timing)!.push(handler);
  }

  async emit(timing: SkillTiming, context: SkillContext): Promise<void> {
    const handlers = this.listeners.get(timing);
    if (!handlers || handlers.length === 0) return;
    for (const handler of handlers) {
      try {
        await handler(context);
      } catch (err) {
        console.warn(`[SkillEventBus] handler for ${timing} error:`, err);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
