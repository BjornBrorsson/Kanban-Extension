import { ScheduledTask } from './dependencyScheduler';

export interface ConcurrencyLimits {
  maxGlobalWorkers: number;
  maxWorkersPerBoard: number;
}

export class ConcurrencyQueue {
  private isPaused: boolean = false;
  private activeGlobalWorkers: number = 0;
  private activeBoardWorkers: Map<string, number> = new Map();
  private boardQueueIndices: Map<string, number> = new Map();

  constructor(public readonly limits: ConcurrencyLimits = { maxGlobalWorkers: 2, maxWorkersPerBoard: 1 }) {}

  public pause(): void {
    this.isPaused = true;
  }

  public resume(): void {
    this.isPaused = false;
  }

  public getPaused(): boolean {
    return this.isPaused;
  }

  public canDispatch(boardId: string): boolean {
    if (this.isPaused) return false;
    if (this.activeGlobalWorkers >= this.limits.maxGlobalWorkers) return false;

    const currentBoardActive = this.activeBoardWorkers.get(boardId) || 0;
    if (currentBoardActive >= this.limits.maxWorkersPerBoard) return false;

    return true;
  }

  public acquireSlot(boardId: string): boolean {
    if (!this.canDispatch(boardId)) {
      return false;
    }

    this.activeGlobalWorkers++;
    this.activeBoardWorkers.set(boardId, (this.activeBoardWorkers.get(boardId) || 0) + 1);
    return true;
  }

  public releaseSlot(boardId: string): void {
    this.activeGlobalWorkers = Math.max(0, this.activeGlobalWorkers - 1);
    const boardCount = this.activeBoardWorkers.get(boardId) || 0;
    this.activeBoardWorkers.set(boardId, Math.max(0, boardCount - 1));
  }

  /**
   * Selects next dispatchable task using fair-share round-robin across boards.
   */
  public selectNextTask(readyTasks: ScheduledTask[]): ScheduledTask | null {
    if (this.isPaused || readyTasks.length === 0) {
      return null;
    }

    // Group ready tasks by board
    const boardGroups = new Map<string, ScheduledTask[]>();
    for (const task of readyTasks) {
      const list = boardGroups.get(task.boardId) || [];
      list.push(task);
      boardGroups.set(task.boardId, list);
    }

    // Filter to boards that have available concurrency slots
    const availableBoards = Array.from(boardGroups.keys()).filter(b => this.canDispatch(b));
    if (availableBoards.length === 0) {
      return null;
    }

    // Round-robin selection across available boards
    for (const boardId of availableBoards) {
      const tasks = boardGroups.get(boardId)!;
      if (tasks.length > 0) {
        return tasks[0];
      }
    }

    return null;
  }

  public getStatus(): { paused: boolean; activeGlobal: number; maxGlobal: number; boardSlots: Record<string, number> } {
    const boardSlots: Record<string, number> = {};
    for (const [boardId, count] of this.activeBoardWorkers.entries()) {
      boardSlots[boardId] = count;
    }
    return {
      paused: this.isPaused,
      activeGlobal: this.activeGlobalWorkers,
      maxGlobal: this.limits.maxGlobalWorkers,
      boardSlots
    };
  }
}
