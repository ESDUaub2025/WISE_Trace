import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import { configurationFile, importConfiguration } from '../lib/config-files';
import type { Config } from '../lib/domain';
export function ConfigurationFiles({
  config,
  onImport,
  onError,
  canImport,
}: {
  config: Config;
  onImport: (definition: string) => void;
  onError: (error: string) => void;
  canImport: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="button-group">
      <Button
        variant="outline"
        onClick={() => {
          const url = URL.createObjectURL(new Blob([configurationFile(config)], { type: 'application/json' }));
          const link = document.createElement('a');
          link.href = url;
          link.download = `wise-sop-${config.id}.json`;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}
      >
        {t('exportConfig')}
      </Button>
      {canImport && (
        <label className="file-picker">
          {t('importConfig')}
          <input
            type="file"
            accept="application/json,.json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                if (file.size > 1024 * 1024) throw new Error('configFileTooLarge');
                onImport(JSON.stringify(importConfiguration(await file.text()), null, 2));
              } catch (error) {
                onError(error instanceof Error ? error.message : 'configFileInvalid');
              }
              e.target.value = '';
            }}
          />
        </label>
      )}
    </div>
  );
}
