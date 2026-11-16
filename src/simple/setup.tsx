import { useState } from 'react';
import type { Snapshot } from '../lib/data';
import { memoryModes, mergeSettings, type Memory, type Settings, type SettingsPatch } from './settings';
import { recordersFor } from './access';
import { SimpleContext, useSimple } from './context';
import { Choices, Step } from './ui';
import { useText } from './text';

const groups = [
  ['receive', 'receiveQuestions'],
  ['pack', 'packQuestions'],
  ['sell', 'sellQuestions'],
] as const;

/** Lets a demo try other answers to the open questions on this device only; the settings file stays the source of truth. */
export function Setup(props: {
  data: Snapshot;
  settings: Settings;
  cooperativeCode: string;
  onSave: (patch: SettingsPatch) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  // The setup panel is a form for the person running the demo, so it always uses the card look.
  const context = useSimple();
  return (
    <SimpleContext.Provider value={{ ...context, settings: { ...context.settings, style: 'cards', hints: false } }}>
      <SetupForm {...props} />
    </SimpleContext.Provider>
  );
}

function Pick<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) {
  const { t } = useText();
  return (
    <label className="s-setup-row">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {t(o)}
          </option>
        ))}
      </select>
    </label>
  );
}

function SetupForm({
  data,
  settings,
  cooperativeCode,
  onSave,
  onReset,
  onClose,
}: {
  data: Snapshot;
  settings: Settings;
  cooperativeCode: string;
  onSave: (patch: SettingsPatch) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const { t, words } = useText();
  const [mode, setMode] = useState(settings.recording.mode);
  const [recorders, setRecorders] = useState<string[]>(recordersFor(settings, cooperativeCode));
  const [decideAfter, setDecideAfter] = useState(settings.decideAfterReceive);
  const [style, setStyle] = useState(settings.style),
    [levels, setLevels] = useState(settings.levels.mode),
    [decision, setDecision] = useState(settings.wheyDecision);
  const [voice, setVoice] = useState(settings.voice.mode),
    [hints, setHints] = useState(settings.hints),
    [codes, setCodes] = useState(settings.showCodes);
  const [memory, setMemory] = useState<Record<string, Memory>>(
    Object.fromEntries(
      groups.flatMap(([pipeline]) => settings.questions[pipeline].map((q) => [`${pipeline}.${q.key}`, q.memory])),
    ),
  );
  const [error, setError] = useState('');
  const people = data.members.filter(
    (m) => Array.isArray(m.roles) && (m.roles as string[]).some((r) => settings.recording.roles.includes(r as never)),
  );
  function save() {
    const patch: SettingsPatch = {
      recording: { mode, recorders: { ...settings.recording.recorders, [cooperativeCode]: recorders } },
      decideAfterReceive: decideAfter,
      style,
      levels: { mode: levels },
      wheyDecision: decision,
      voice: { mode: voice },
      hints,
      showCodes: codes,
      questions: Object.fromEntries(
        groups.map(([pipeline]) => [
          pipeline,
          settings.questions[pipeline].map((q) => ({ key: q.key, memory: memory[`${pipeline}.${q.key}`] })),
        ]),
      ),
    };
    try {
      mergeSettings(settings, patch);
      onSave(patch);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error');
    }
  }
  return (
    <Step
      title={t('setupTitle')}
      onClose={onClose}
      error={error}
      action={{ label: t('useSetup'), onClick: save }}
      secondary={{ label: t('resetSetup'), onClick: onReset }}
    >
      <p className="s-meta">{t('setupNote')}</p>
      <div className="s-stack">
        <Pick label={t('styleLabel')} value={style} options={['cards', 'chat'] as const} onChange={setStyle} />
        <Pick label={t('levelsLabel')} value={levels} options={['progressive', 'all'] as const} onChange={setLevels} />
        <Pick
          label={t('decisionLabel')}
          value={decision}
          options={['signal', 'choose'] as const}
          onChange={setDecision}
        />
        <Pick label={t('voiceLabel')} value={voice} options={['tts', 'recorded', 'off'] as const} onChange={setVoice} />
        <label className="s-toggle">
          <input type="checkbox" checked={hints} onChange={(e) => setHints(e.target.checked)} />
          <span>{t('hintsLabel')}</span>
        </label>
        <label className="s-toggle">
          <input type="checkbox" checked={codes} onChange={(e) => setCodes(e.target.checked)} />
          <span>{t('codesLabel')}</span>
        </label>
      </div>
      <h2 className="s-h2">{t('recordingWho')}</h2>
      <Choices
        label={t('recordingWho')}
        value={mode}
        onChange={(v) => setMode(v as Settings['recording']['mode'])}
        options={(['every_producer', 'designated'] as const).map((value) => ({ value, label: t(value) }))}
      />
      {mode === 'designated' && (
        <div className="s-stack">
          {people.map((p) => {
            const username = String(p.username);
            return (
              <label key={username} className="s-toggle">
                <input
                  type="checkbox"
                  checked={recorders.includes(username)}
                  onChange={(e) =>
                    setRecorders((r) => (e.target.checked ? [...r, username] : r.filter((x) => x !== username)))
                  }
                />
                <span>{String(p.display_name)}</span>
              </label>
            );
          })}
        </div>
      )}
      <label className="s-toggle">
        <input type="checkbox" checked={decideAfter} onChange={(e) => setDecideAfter(e.target.checked)} />
        <span>{t('decideAfter')}</span>
      </label>
      {groups.map(([pipeline, heading]) => (
        <section key={pipeline}>
          <h2 className="s-h2">{t(heading)}</h2>
          <table className="s-table">
            <tbody>
              {settings.questions[pipeline].map((q) => {
                const key = `${pipeline}.${q.key}`;
                return (
                  <tr key={key}>
                    <th scope="row">{words(q.label)}</th>
                    <td>
                      <select
                        aria-label={words(q.label)}
                        value={memory[key]}
                        onChange={(e) => setMemory((m) => ({ ...m, [key]: e.target.value as Memory }))}
                      >
                        {memoryModes
                          .filter(
                            (mode) =>
                              (mode !== 'per_supplier' || pipeline === 'receive') &&
                              (mode !== 'fixed' || q.default !== undefined),
                          )
                          .map((mode) => (
                            <option key={mode} value={mode}>
                              {t(mode)}
                            </option>
                          ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </Step>
  );
}
