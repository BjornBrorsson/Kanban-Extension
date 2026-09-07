import { ManagedProcessAdapter } from './managedProcessAdapter';

export class DevinCliAdapter extends ManagedProcessAdapter {
  constructor(devinExecutable: string = 'devin') {
    super('devin-cli', 'devin-cli', {
      executable: devinExecutable,
      argsTemplate: [
        'run',
        '--dir',
        '{workspace}',
        '--objective',
        '{objective}'
      ]
    });
  }
}
