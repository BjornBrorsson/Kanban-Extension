import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { DaemonInfo } from './orchestratorDaemon';

export class DaemonClient {
  constructor(public readonly workspaceRoot: string) {}

  public getDaemonInfoPath(): string {
    return path.join(this.workspaceRoot, '.agentic-kanban', 'runtime', 'daemon.json');
  }

  public getDaemonInfo(): DaemonInfo | null {
    const infoPath = this.getDaemonInfoPath();
    if (!fs.existsSync(infoPath)) {
      return null;
    }
    try {
      return JSON.parse(fs.readFileSync(infoPath, 'utf8')) as DaemonInfo;
    } catch {
      return null;
    }
  }

  public async isDaemonRunning(): Promise<boolean> {
    const info = this.getDaemonInfo();
    if (!info || !info.port || !info.authToken) {
      return false;
    }

    try {
      const status = await this.getStatus();
      return status && status.running === true;
    } catch {
      return false;
    }
  }

  public async getStatus(): Promise<any> {
    return this.sendRequest('GET', '/status');
  }

  public async pause(): Promise<any> {
    return this.sendRequest('POST', '/pause');
  }

  public async resume(): Promise<any> {
    return this.sendRequest('POST', '/resume');
  }

  public async run(params?: { boardId?: string; tickets?: any[]; completedIds?: string[] }): Promise<any> {
    return this.sendRequest('POST', '/run', params);
  }

  public async cancel(ticketId: string, attemptId: string, extra?: { executionId?: string; leaseToken?: string }): Promise<any> {
    return this.sendRequest('POST', '/cancel', { ticketId, attemptId, ...extra });
  }

  public async getReview(ticketId: string): Promise<any> {
    return this.sendRequest('GET', `/review/${encodeURIComponent(ticketId)}`);
  }

  public async stop(): Promise<any> {
    return this.sendRequest('POST', '/stop');
  }

  private sendRequest(method: string, endpoint: string, body?: any): Promise<any> {
    const info = this.getDaemonInfo();
    if (!info) {
      return Promise.reject(new Error(`Daemon is not running in ${this.workspaceRoot} (no daemon.json found)`));
    }

    return new Promise((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : undefined;
      const options: http.RequestOptions = {
        hostname: '127.0.0.1',
        port: info.port,
        path: endpoint,
        method: method,
        headers: {
          'Authorization': `Bearer ${info.authToken}`,
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
        },
        timeout: 5000
      };

      const req = http.request(options, res => {
        let responseData = '';
        res.on('data', chunk => {
          responseData += chunk;
        });
        res.on('end', () => {
          if (!responseData.trim()) {
            resolve({});
            return;
          }
          try {
            const parsed = JSON.parse(responseData);
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(parsed.error || `Request failed with status ${res.statusCode}`));
            } else {
              resolve(parsed);
            }
          } catch {
            reject(new Error(`Failed to parse daemon response: ${responseData}`));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Daemon request to ${endpoint} timed out`));
      });

      req.on('error', err => {
        reject(new Error(`Connection to daemon failed: ${err.message}`));
      });

      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  }
}
