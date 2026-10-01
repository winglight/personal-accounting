import { useId, useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { isTheme } from '../../utils/theme';
import type { ThemeId } from '../../utils/theme';

interface ThemePickerProps {
  variant?: 'compact' | 'cards';
  language?: 'zh' | 'en';
  className?: string;
}

export function ThemePicker({ variant = 'compact', language = 'zh', className = '' }: ThemePickerProps) {
  const { theme, setTheme, themes } = useTheme();
  const id = useId();
  const [announcement, setAnnouncement] = useState('');
  const english = language === 'en';
  const label = english ? 'Color theme' : '外观主题';
  const choose = (value: ThemeId) => {
    setTheme(value);
    const item = themes.find(candidate => candidate.id === value)!;
    setAnnouncement(english ? `${item.nameEn} theme selected` : `已切换为${item.name}主题`);
  };

  return <div className={`pa-theme-picker pa-theme-picker--${variant} ${className}`}>
    {variant === 'compact' ? <label className="pa-theme-quick" htmlFor={id}>
      <span>{english ? 'Theme' : '主题'}</span>
      <select id={id} aria-label={label} value={theme} onChange={event => {
        if (isTheme(event.target.value)) choose(event.target.value);
      }}>
        {themes.map(item => <option key={item.id} value={item.id}>{english ? item.nameEn : item.name}</option>)}
      </select>
    </label> : <fieldset className="pa-theme-fieldset">
      <legend>{label}</legend>
      <p className="pa-theme-description">{english ? 'Choose your colors. This browser remembers your preference.' : '选择喜欢的颜色，当前浏览器会记住你的偏好。'}</p>
      <div className="pa-theme-options">
        {themes.map(item => <button type="button" key={item.id} className="pa-theme-option"
          aria-pressed={theme === item.id}
          aria-label={english ? `${item.nameEn} theme, ${item.descriptionEn}` : `${item.name}主题，${item.description}`}
          onClick={() => choose(item.id)}>
          <span className="pa-theme-preview" style={{ background: item.canvas }} aria-hidden="true">
            <span className="pa-theme-preview-sidebar" style={{ background: item.sidebar }} />
            <span className="pa-theme-preview-accent" style={{ background: item.accent }} />
          </span>
          <span className="pa-theme-selection-mark" aria-hidden="true">{theme === item.id ? '✓' : ''}</span>
          <strong>{english ? item.nameEn : item.name}</strong>
          <small>{english ? item.descriptionEn : item.description}</small>
        </button>)}
      </div>
    </fieldset>}
    <span className="pa-theme-status" role="status" aria-live="polite">{announcement}</span>
  </div>;
}
