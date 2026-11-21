import { AVAILABLE_LOCALES, type Locale, type TFunction } from '../i18n';

interface LanguageSelectProps {
  value: Locale;
  onChange: (value: Locale) => void;
  t: TFunction;
  className?: string;
}

/**
 * Same shape as ThemeSelect: a plain <select> so it stays keyboard-reachable and
 * readable on every browser. Labels are endonyms — a visitor looking for their
 * own language recognises "Português (Brasil)" even when the UI is in English.
 */
const LABELS: Record<Locale, string> = {
  en: 'English',
  'pt-BR': 'Português (Brasil)',
};

export function LanguageSelect({ value, onChange, t, className }: LanguageSelectProps) {
  return (
    <select
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value as Locale)}
      aria-label={t('language.label')}
      title={t('language.label')}
    >
      {AVAILABLE_LOCALES.map((locale) => (
        <option key={locale} value={locale}>
          {LABELS[locale]}
        </option>
      ))}
    </select>
  );
}
