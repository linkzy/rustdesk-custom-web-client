import { AVAILABLE_LOCALES, localeLabel, type Locale, type TFunction } from '../i18n';

interface LanguageSelectProps {
  value: Locale;
  onChange: (value: Locale) => void;
  t: TFunction;
  className?: string;
}

/**
 * Same shape as ThemeSelect: a plain <select> so it stays keyboard-reachable and
 * readable on every browser. The labels come from each catalogue's own `label`
 * export, so adding a language never touches this file.
 */
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
          {localeLabel(locale)}
        </option>
      ))}
    </select>
  );
}
