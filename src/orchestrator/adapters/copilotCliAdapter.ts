import { ManagedProcessAdapter } from './managedProcessAdapter';

export class CopilotCliAdapter extends ManagedProcessAdapter {
  constructor(copilotExecutable: string = 'gh') {
    super('github-copilot-cli', 'github-copilot-cli', {
      executable: copilotExecutable,
      argsTemplate: [
        'copilot',
        'run',
        '--prompt',
        '{objective}'
      ]
    });
  }
}
