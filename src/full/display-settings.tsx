import { useState } from 'react';
import { useTranslation } from 'react-i18next';
export function DisplaySettings({ onChange }: { onChange: () => void }) {
  const { t } = useTranslation();
  const [digits, setDigits] = useState(localStorage.getItem('wise-digits') === 'arab' ? 'arab' : 'latn');
  return (
    <label>
      {t('numberStyle')}
      <select
        aria-label={t('numberStyle')}
        value={digits}
        onChange={(event) => {
          localStorage.setItem('wise-digits', event.target.value);
          setDigits(event.target.value);
          onChange();
        }}
      >
        <option value="latn">{t('westernDigits')}</option>
        <option value="arab">{t('easternDigits')}</option>
      </select>
    </label>
  );
}
