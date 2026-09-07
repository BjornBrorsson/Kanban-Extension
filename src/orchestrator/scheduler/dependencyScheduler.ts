import { Ticket } from '../../types';

export interface ScheduledTask {
  boardId: string;
  ticket: Ticket;
  dependencies: string[];
  resolved: boolean;
}

export class DependencyScheduler {
  /**
   * Evaluates dependencies across tickets and identifies which tickets are ready for dispatch.
   * A ticket is ready if and only if all of its `dependsOn` tickets are in the completedIds set.
   */
  public static getReadyTasks(
    ticketsByBoard: Map<string, Ticket[]>,
    completedIds: Set<string>
  ): ScheduledTask[] {
    const readyTasks: ScheduledTask[] = [];

    for (const [boardId, tickets] of ticketsByBoard.entries()) {
      for (const ticket of tickets) {
        // Skip already completed tickets
        if (completedIds.has(ticket.id) || ticket.status === 'Completed' || ticket.column === 'Completed') {
          continue;
        }

        // Check if all dependencies are completed
        const deps = ticket.dependsOn || [];
        const allDepsResolved = deps.every(depId => completedIds.has(depId));

        if (allDepsResolved) {
          readyTasks.push({
            boardId,
            ticket,
            dependencies: deps,
            resolved: true
          });
        }
      }
    }

    return readyTasks;
  }

  /**
   * Generates a topologically sorted execution plan for a set of tickets.
   * Returns ordered ticket IDs or throws if a circular dependency exists.
   */
  public static computeTopologicalOrder(tickets: Ticket[]): string[] {
    const ticketMap = new Map<string, Ticket>();
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    for (const t of tickets) {
      ticketMap.set(t.id, t);
      inDegree.set(t.id, 0);
      adjList.set(t.id, []);
    }

    // Build DAG: If A dependsOn B, edge is B -> A (B must run before A)
    for (const t of tickets) {
      const deps = t.dependsOn || [];
      for (const depId of deps) {
        if (ticketMap.has(depId)) {
          adjList.get(depId)!.push(t.id);
          inDegree.set(t.id, (inDegree.get(t.id) || 0) + 1);
        }
      }
    }

    // Kahn's algorithm
    const queue: string[] = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) {
        queue.push(id);
      }
    }

    const order: string[] = [];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      order.push(curr);

      const neighbors = adjList.get(curr) || [];
      for (const neighbor of neighbors) {
        const newDeg = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) {
          queue.push(neighbor);
        }
      }
    }

    if (order.length !== tickets.length) {
      throw new Error('Cyclic dependency detected: Cannot establish topological execution order.');
    }

    return order;
  }
}
