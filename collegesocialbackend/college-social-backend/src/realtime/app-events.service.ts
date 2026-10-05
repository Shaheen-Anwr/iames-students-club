import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'events';

// In-process events between modules that can't import each other without a cycle -- e.g. a
// chat message mentioning رافد needs AiModule, but AiModule already depends on ChatModule; a new
// lecture/announcement must reach ChatModule's class groups, but PostsModule -> AiModule ->
// ChatModule. Emitters fire-and-forget; listeners subscribe in onModuleInit. Single process only
// (good enough: every listener here is a best-effort side effect, never the source of truth).
export interface AppEvents {
  /** A human-sent chat message was saved (not bot/system messages, not thread replies). */
  'chat.messageSaved': { messageId: string; conversationId: string; senderId: string; text: string; isGroup: boolean };
  /** A department (or college-wide, department null) announcement was published. */
  'announcement.created': { id: string; title: string; body: string; department: string | null; authorId: string };
  /** A lecture (PDF/video) was posted for a شعبة + year. */
  'lecture.posted': {
    id: string;
    title: string;
    courseCode: string | null;
    department: string | null;
    academicYear: string | null;
    authorId: string;
  };
}

@Injectable()
export class AppEventsService {
  private readonly logger = new Logger(AppEventsService.name);
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  emit<K extends keyof AppEvents>(event: K, payload: AppEvents[K]): void {
    // Deferred so a listener can never slow down (or throw into) the request that emitted.
    setImmediate(() => this.emitter.emit(event, payload));
  }

  on<K extends keyof AppEvents>(event: K, listener: (payload: AppEvents[K]) => Promise<void> | void): void {
    this.emitter.on(event, (payload: AppEvents[K]) => {
      Promise.resolve()
        .then(() => listener(payload))
        .catch((err) => this.logger.warn(`Listener for "${event}" failed: ${(err as Error)?.message ?? err}`));
    });
  }
}
