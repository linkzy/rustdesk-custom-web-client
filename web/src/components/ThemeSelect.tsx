import type { ThemePreference } from '../utils/theme';

interface ThemeSelectProps {
  value: ThemePreference;
  onChange: (value: ThemePreference) => void;
  className?: string;
}

export function ThemeSelect({ value, onChange, className }: ThemeSelectProps) {
  return (
    <select
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value as ThemePreference)}
      aria-label="Colour theme"
      title="Colour theme"
    >
      <option value="system">System</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  );
}
