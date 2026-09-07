export type PriorityLevel = 'P0' | 'P1' | 'P2' | 'P3' | 'Critical' | 'High' | 'Medium' | 'Low' | 'Normal';

export interface AcceptanceCriterion {
  text: string;
  done: boolean;
}

export interface Ticket {
  id: string;
  filename: string;
  path: string;
  relativePath: string;
  column: string;
  subfolder: string | null;
  title: string;
  summary: string;
  description: string;
  status: string;
  priority: string;
  epic: string | null;
  type: string | null;
  estimate: string | null;
  milestone: string | null;
  assignee: string | null;
  dependsOn: string[];
  blocks: string[];
  labels: string[];
  acceptanceCriteria: AcceptanceCriterion[];
  progress: {
    done: number;
    total: number;
  };
  mtime: number;
  hasWorkLog: boolean;
  unresolvedDependencies?: string[];
  attemptState?: {
    attemptId: string;
    generation: number;
    status: string;
    tier: 'managed' | 'assisted';
    patch?: string;
    evidence?: { command: string; exitCode: number; output: string }[];
    failureReason?: string;
  };
}

export interface SubfolderInfo {
  name: string;
  path: string;
  whatWhyGuide: string | null;
  ticketCount: number;
}

export interface Column {
  id: string;
  name: string;
  path: string;
  subfolders: SubfolderInfo[];
  tickets: Ticket[];
  whatWhyGuide: string | null;
}

export interface AgentRunnerConfig {
  type: 'cli' | 'vscode-command';
  command: string;
  workingDir?: string;
  prompt?: string;
}

export interface Assignee {
  id: string;
  name: string;
  role?: string;
  type: 'human' | 'agent';
  agentConfig?: AgentRunnerConfig;
}

import { OrchestrationConfig } from './orchestrator/types';

export interface BoardConfig {
  name: string;
  columnsOrder: string[];
  autoUpdateStatus: boolean;
  defaultAgent: string | null;
  assignees: Assignee[];
  agentPromptTemplate?: string;
  orchestration?: OrchestrationConfig;
}

export interface BoardPlanDocument {
  path: string;
  title: string;
  content: string;
}

export interface TicketTemplate {
  id: string;
  name: string;
  filename: string;
  content: string;
}

export interface WorkLogEntry {
  date: string;
  timestamp?: number;
  boardId: string;
  boardName: string;
  ticketId: string;
  ticketTitle: string;
  ticketPath: string;
  text: string;
  line?: number;
}

export interface Board {
  id: string;
  name: string;
  rootPath: string;
  columns: Column[];
  config: BoardConfig;
  planDocument: BoardPlanDocument | null;
  templates?: TicketTemplate[];
  lastScanned: number;
}

export interface MultiBoardOverview {
  totalBoards: number;
  totalTickets: number;
  ongoingTicketsCount: number;
  blockedTicketsCount: number;
  assistanceRequiredCount: number;
  blockedByDependencyCount?: number;
  recentWorkLogs: WorkLogEntry[];
  boards: {
    id: string;
    name: string;
    rootPath: string;
    ticketCount: number;
    columnsSummary: { [colName: string]: number };
  }[];
  activeTickets: {
    ticket: Ticket;
    boardId: string;
    boardName: string;
  }[];
}
