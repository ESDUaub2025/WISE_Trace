import type { Config } from './domain';
export function configurationFile(config: Config) {
  return JSON.stringify(
    { schema: 'wise.configuration.v1', kind: 'sop', source_version_id: config.id, definition: config.definition },
    null,
    2,
  );
}
export function importConfiguration(text: string): Config['definition'] {
  if (text.length > 1024 * 1024) throw new Error('configFileTooLarge');
  const document = JSON.parse(text);
  if (
    !document ||
    typeof document !== 'object' ||
    document.schema !== 'wise.configuration.v1' ||
    document.kind !== 'sop' ||
    !document.definition ||
    !Array.isArray(document.definition.stages) ||
    !Array.isArray(document.definition.checkpoints)
  )
    throw new Error('configFileInvalid');
  // Approval, identity, scope and effective dates are deliberately re-established.
  return document.definition;
}
