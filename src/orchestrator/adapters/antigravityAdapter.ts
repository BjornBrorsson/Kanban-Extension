import { ManagedProcessAdapter } from './managedProcessAdapter';

export class AntigravityManagedAdapter extends ManagedProcessAdapter {
  constructor(agyExecutable: string = 'agy') {
    super('antigravity-cli', 'Antigravity CLI', {
      executable: agyExecutable,
      argsTemplate: [
        '-p',
        '{objective}',
        '--dangerously-skip-permissions'
      ]
    });
  }
}
