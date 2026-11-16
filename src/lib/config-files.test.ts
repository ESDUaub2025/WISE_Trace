import { expect, it } from 'vitest';
import { demoConfig } from './demo';
import { configurationFile, importConfiguration } from './config-files';
it('moves a definition without importing approval or identity into a new draft', () => {
  const file = JSON.parse(configurationFile(demoConfig));
  file.status = 'approved';
  file.approved_by = 'forged';
  file.id = 'old';
  expect(importConfiguration(JSON.stringify(file))).toEqual(demoConfig.definition);
  expect(importConfiguration(JSON.stringify(file))).not.toHaveProperty('approved_by');
});
it('rejects unrelated or oversized configuration documents', () => {
  expect(() => importConfiguration('{"schema":"other"}')).toThrow('configFileInvalid');
  expect(() => importConfiguration(' '.repeat(1024 * 1024 + 1))).toThrow('configFileTooLarge');
});
