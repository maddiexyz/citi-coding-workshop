import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import projectShape from '../projectPropTypes';
import { hasForecast } from '../../services/forecastApi';
import { formatDate } from '../../utils/format';
import SlipChip from './SlipChip';

/** A project's forecast end date with its slip chip, for lists; "—" when there is no forecast. */
export default function ForecastEnd({ project }) {
  if (!hasForecast(project)) return '—';
  return (
    <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <span>{formatDate(project.forecast_end)}</span>
      <SlipChip slipDays={project.forecast_slip_days} />
      {project.forecast_confidence === 'low' && (
        <Typography variant="caption" color="text.secondary">low confidence</Typography>
      )}
    </Stack>
  );
}

ForecastEnd.propTypes = { project: projectShape.isRequired };
