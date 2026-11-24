import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import projectShape from '../projectPropTypes';
import { getForecast } from '../../services/forecastApi';
import { formatDate } from '../../utils/format';

const CONFIDENCE = {
  high: { label: 'High confidence', color: 'success' },
  medium: { label: 'Medium confidence', color: 'warning' },
  low: { label: 'Low confidence', color: 'default' },
};

const days = (count) => `${count} day${count === 1 ? '' : 's'}`;

function Fact({ label, children }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" component="dt">{label}</Typography>
      <Typography component="dd" sx={{ m: 0, fontWeight: 600 }}>{children}</Typography>
    </Box>
  );
}

Fact.propTypes = { label: PropTypes.string.isRequired, children: PropTypes.node };

/** The slip against the planned end as a chip: late (red), on time (green), or nothing without an end date. */
export function SlipChip({ slipDays }) {
  if (slipDays === null || slipDays === undefined) return null;
  if (slipDays > 0) return <Chip size="small" color="error" label={`${days(slipDays)} late`} />;
  return <Chip size="small" color="success" label={slipDays === 0 ? 'On time' : `${days(-slipDays)} early`} />;
}

SlipChip.propTypes = { slipDays: PropTypes.number };

function Body({ forecast }) {
  const { status, confidence, spi } = forecast;
  if (status === 'no_deliverables') {
    return <Typography color="text.secondary">No deliverables to forecast yet.</Typography>;
  }
  if (status === 'no_estimates') {
    return (
      <Typography color="text.secondary">
        No forecast yet: add an estimate (working days) to the remaining deliverables to get a completion date.
      </Typography>
    );
  }
  const byId = new Map(forecast.items.map((item) => [item.id, item]));
  const level = CONFIDENCE[confidence.level];
  const assumed = confidence.remaining - confidence.estimated;
  return (
    <Stack spacing={2}>
      <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2, m: 0 }}>
        <Fact label="Planned end">{formatDate(forecast.planned_end)}</Fact>
        <Fact label={status === 'complete' ? 'Finished' : 'Forecast end'}>
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <span>{formatDate(forecast.forecast_end)}</span>
            <SlipChip slipDays={forecast.slip_days} />
          </Stack>
        </Fact>
        {level && (
          <Fact label="Confidence">
            <Chip size="small" color={level.color} variant="outlined" label={level.label} />
          </Fact>
        )}
        <Fact label="SPI (schedule performance)">{spi.value === null ? '—' : spi.value.toFixed(2)}</Fact>
      </Box>
      {status === 'complete' ? (
        <Typography variant="body2" color="text.secondary">Every deliverable is done or cancelled.</Typography>
      ) : (
        <Typography variant="body2" color="text.secondary">
          {confidence.estimated} of {confidence.remaining} remaining deliverables have an estimate
          {assumed > 0 && `; the other ${assumed} ${assumed === 1 ? 'is' : 'are'} assumed to take the median estimate`}.
          {confidence.level === 'low' && ' With fewer than half estimated, a late forecast is not raised as a risk.'}
        </Typography>
      )}
      <Typography variant="body2" color="text.secondary">
        {spi.explanation} SPI is work done ÷ work planned by today, weighted by estimate; 1.00 means on plan.
      </Typography>
      {forecast.critical_path.length > 0 && (
        <Box>
          <Typography variant="subtitle2" component="h3" id="critical-path-heading">
            Critical path
          </Typography>
          <Typography variant="body2" color="text.secondary">
            The chain of deliverables that sets the forecast end: a day lost on any of them moves the end by a day.
          </Typography>
          <Box component="ol" aria-labelledby="critical-path-heading" sx={{ pl: 3, my: 1 }}>
            {forecast.critical_path.map((id) => {
              const item = byId.get(id);
              return (
                <Typography component="li" variant="body2" key={id}>
                  <strong>{item.title}</strong>
                  {` — ${formatDate(item.start)} to ${formatDate(item.finish)} (${days(item.remaining_days)} left`}
                  {item.assumed ? ', assumed estimate)' : ')'}
                </Typography>
              );
            })}
          </Box>
        </Box>
      )}
    </Stack>
  );
}

Body.propTypes = { forecast: PropTypes.object.isRequired };

/**
 * Completion forecast of a project: forecast end next to the planned end,
 * slip, confidence, SPI and the critical path. Computed by the backend
 * (critical path method over the dependency chains, Mon–Fri calendar).
 */
export default function ForecastCard({ project }) {
  const [state, setState] = useState({ project: null, forecast: null, error: null });

  // Refetch whenever the project is reloaded (its deliverables may have changed)
  useEffect(() => {
    let cancelled = false;
    getForecast(project.id)
      .then((forecast) => !cancelled && setState({ project, forecast, error: null }))
      .catch((err) => !cancelled && setState({ project, forecast: null, error: err.message }));
    return () => { cancelled = true; };
  }, [project]);

  let content;
  if (state.project !== project && !state.forecast) {
    content = <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress aria-label="Loading forecast" /></Box>;
  } else if (state.error) {
    content = <Alert severity="error">{state.error}</Alert>;
  } else {
    content = <Body forecast={state.forecast} />;
  }
  return (
    <Paper variant="outlined" component="section" aria-labelledby="forecast-heading" sx={{ p: { xs: 2, sm: 2.5 } }}>
      <Typography variant="subtitle2" component="h2" id="forecast-heading" gutterBottom>Completion forecast</Typography>
      {content}
    </Paper>
  );
}

ForecastCard.propTypes = { project: projectShape.isRequired };
