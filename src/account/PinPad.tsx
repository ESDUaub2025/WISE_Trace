// A PIN entry built for one thumb: large keys, dots instead of digits, and a real input
// underneath so hardware keyboards, password managers' "off" hint and screen readers still work.
import { Delete } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { sessionConfig } from '../config/session';

const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const { minLength, maxLength } = sessionConfig.pin;

export const pinComplete = (pin: string) => pin.length >= minLength;

export function PinPad({
  value,
  onChange,
  onSubmit,
  disabled = false,
  label,
}: {
  value: string;
  onChange: (pin: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  label: string;
}) {
  const { t } = useTranslation();
  const set = (next: string) => onChange(next.replace(/\D/g, '').slice(0, maxLength));
  return (
    <div className="acct-pin">
      <label className="acct-pin-field">
        <span className="acct-label">{label}</span>
        {/* The visible dots; the input itself is transparent on top so tapping it still focuses. */}
        <span className="acct-pin-dots" aria-hidden="true">
          {Array.from({ length: maxLength }, (_, index) => (
            <i key={index} className={index < value.length ? 'filled' : index < minLength ? '' : 'optional'} />
          ))}
        </span>
        <input
          className="acct-pin-input"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]*"
          name="pin"
          value={value}
          disabled={disabled}
          autoFocus
          onChange={(event) => set(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && pinComplete(value)) {
              event.preventDefault();
              onSubmit();
            }
          }}
        />
      </label>
      {/* Digits read left to right in Arabic too, like a phone keypad. */}
      <div className="acct-keys" dir="ltr">
        {keys.map((key) => (
          <button type="button" key={key} disabled={disabled} onClick={() => set(value + key)}>
            {key}
          </button>
        ))}
        <button
          type="button"
          className="acct-key-quiet"
          disabled={disabled || !value}
          aria-label={t('deleteDigit')}
          onClick={() => set(value.slice(0, -1))}
        >
          <Delete size={24} aria-hidden="true" />
        </button>
        <button type="button" disabled={disabled} onClick={() => set(value + '0')}>
          0
        </button>
        <span />
      </div>
    </div>
  );
}
