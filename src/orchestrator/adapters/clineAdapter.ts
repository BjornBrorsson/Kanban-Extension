import { ManagedProcessAdapter } from './managedProcessAdapter';

export class ClineManagedAdapter extends ManagedProcessAdapter {
  constructor(clineExecutable: string = 'cline') {
    super('cline', 'cline', {
      executable: clineExecutable,
      argsTemplate: [
        '--headless',
        '--workspace',
        '{workspace}',
        '--prompt',
        '{objective}',
        '--output-patch',
        '{patch}'
      ]
    });
  }
}
