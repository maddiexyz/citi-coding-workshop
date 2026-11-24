import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { useColorScheme } from '@mui/material/styles';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import SettingsBrightnessIcon from '@mui/icons-material/SettingsBrightness';

const MODES = {
  light: { label: 'Light', next: 'dark', Icon: LightModeIcon },
  dark: { label: 'Dark', next: 'system', Icon: DarkModeIcon },
  system: { label: 'System', next: 'light', Icon: SettingsBrightnessIcon },
};

/**
 * Cycles the colour theme light → dark → system. MUI keeps the choice in
 * localStorage, so it survives reloads; "system" follows the device setting.
 */
export default function ColorModeToggle() {
  const { mode, setMode } = useColorScheme();
  const current = MODES[mode ?? 'system'] ?? MODES.system;
  const next = MODES[current.next];
  const label = `Colour theme: ${current.label}. Switch to ${next.label.toLowerCase()}`;
  return (
    <Tooltip title={label}>
      <IconButton color="inherit" aria-label={label} onClick={() => setMode(current.next)}>
        <current.Icon />
      </IconButton>
    </Tooltip>
  );
}
