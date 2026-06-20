import { SkillTiming, SkillContext } from './SkillTypes';

type SkillContextHandler = (context: SkillContext) => void | Promise<void>;

export class SkillEventBus {
  private listeners: Map<SkillTiming, SkillContextHandler[]> = new Map();

  on(timing: SkillTiming, handler: SkillContextHandler): void {
    if (!this.listeners.has(timing)) {
      this.listeners.set(timing, []);
    }
    this.listeners.get(timing)!.push(handler);
  }

  emit(timing: SkillTiming, context: SkillContext): void {
    const handlers = this.listeners.get(timing);
    if (!handlers) return;
    for (const handler of handlers) {
      handler(context);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
