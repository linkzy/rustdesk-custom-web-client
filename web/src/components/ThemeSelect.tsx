import type { TFunction } from '../i18n';
import type { ThemePreference } from '../utils/theme';

interface ThemeSelectProps {
  value: ThemePreference;
  onChange: (value: ThemePreference) => void;
  t: TFunction;
  className?: string;
}

export function ThemeSelect({ value, onChange, t, className }: ThemeSelectProps) {
  return (
    <select
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value as ThemePreference)}
      aria-label={t('theme.label')}
      title={t('theme.label')}
    >
      <option value="system">{t('theme.system')}</option>
      <option value="light">{t('theme.light')}</option>
      <option value="dark">{t('theme.dark')}</option>
    </select>
  );
}
