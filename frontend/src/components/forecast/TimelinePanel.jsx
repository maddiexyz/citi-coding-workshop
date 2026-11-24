import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useMediaQuery } from 'react-responsive';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { DELIVERABLE_STATUSES } from '../../constants/deliverableStatus';
import { getForecast } from '../../services/forecastApi';
import { formatDate } from '../../utils/format';
import DeliverableFlags from '../deliverables/DeliverableFlags';
import projectShape from '../projectPropTypes';
import StatusChip from '../StatusChip';
import SlipChip from './SlipChip';

const DAY = 86400000;
const WIDTH = 960;
const GUTTER = 250;      // room for the deliverable names
const RIGHT = 24;
const TOP = 44;          // axis labels and the Today / Planned end captions
const ROW = 30;
const BAR = 12;

const toDay = (iso) => Date.parse(`${iso}T00:00:00Z`) / DAY;
const toIso = (dayNumber) => new Date(dayNumber * DAY).toISOString().slice(0, 10);
const days = (count) => `${count} day${count === 1 ? '' : 's'}`;
const shorten = (text) => (text.length > 30 ? `${text.slice(0, 29)}…` : text);

// Theme colours for SVG paint (sx does not map palette names for fill/stroke)
const paint = (path) => (theme) => path.split('.').reduce((value, key) => value[key], theme.palette);
const INK = paint('text.primary');
const MUTED = paint('text.secondary');
const GRID = paint('divider');
const CRITICAL = paint('primary.main');

/** Remaining deliverables in schedule order: the ones the forecast gave a start and a finish. */
function scheduled(forecast) {
  return forecast.items
    .filter((item) => item.start && item.finish && item.remaining_days > 0)
    .sort((a, b) => a.start.localeCompare(b.start) || a.finish.localeCompare(b.finish) || a.id - b.id);
}

/** About seven Mondays across the range, as axis ticks. */
function ticks(first, last) {
  const weeks = Math.max(1, Math.ceil((last - first) / 7 / 7));
  const out = [];
  // Day 4 of the epoch (5 Jan 1970) was a Monday
  for (let day = first + ((4 - first) % 7 + 7) % 7; day <= last; day += weeks * 7) out.push(day);
  return out;
}

function Legend() {
  const swatch = (sx) => <Box component="span" aria-hidden sx={{ display: 'inline-block', flexShrink: 0, ...sx }} />;
  const entries = [
    [swatch({ width: 24, height: BAR, borderRadius: 1, bgcolor: 'primary.main' }), 'Critical path (also labelled)'],
    [swatch({ width: 24, height: BAR, borderRadius: 1, border: 2, borderColor: 'text.secondary' }), 'Has float'],
    [swatch({ width: 24, borderTop: 2, borderColor: 'text.secondary', borderTopStyle: 'dotted' }), 'Float: how far it can slip'],
    [swatch({ width: 10, height: 10, transform: 'rotate(45deg)', border: 2, borderColor: 'text.primary' }), 'Due date'],
    [swatch({ height: 16, borderLeft: 2, borderColor: 'text.primary', borderLeftStyle: 'dashed' }), 'Today'],
    [swatch({ height: 16, borderLeft: 2, borderColor: 'text.primary' }), 'Planned end'],
  ];
  return (
    <Stack direction="row" useFlexGap spacing={2} component="ul" aria-label="Legend" sx={{ flexWrap: 'wrap', listStyle: 'none', p: 0, m: 0 }}>
      {entries.map(([mark, label]) => (
        <Stack key={label} component="li" direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          {mark}
          <Typography variant="caption" color="text.secondary">{label}</Typography>
        </Stack>
      ))}
    </Stack>
  );
}

/** The Gantt chart: one row per remaining deliverable on a shared date axis. */
function Chart({ forecast, items }) {
  const today = toDay(forecast.today);
  const plannedEnd = forecast.planned_end ? toDay(forecast.planned_end) : null;
  const marks = [today, toDay(forecast.forecast_end), ...items.map((i) => toDay(i.start))];
  if (plannedEnd !== null) marks.push(plannedEnd);
  items.forEach((i) => i.due_date && marks.push(toDay(i.due_date)));
  const first = Math.min(...marks) - 2;
  const last = Math.max(...marks) + 3;
  const x = (day) => GUTTER + ((day - first) / (last - first)) * (WIDTH - GUTTER - RIGHT);
  const height = TOP + items.length * ROW + 12;
  const summary = `Timeline of ${items.length} remaining deliverable${items.length === 1 ? '' : 's'}: forecast end `
    + `${formatDate(forecast.forecast_end)}${plannedEnd === null ? '' : `, planned end ${formatDate(forecast.planned_end)}`}. `
    + 'The table view lists every date.';
  // Keep the two captions apart when the lines are close together
  const captionsCollide = plannedEnd !== null && Math.abs(x(plannedEnd) - x(today)) < 90;
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Box
        component="svg"
        role="img"
        aria-label={summary}
        viewBox={`0 0 ${WIDTH} ${height}`}
        sx={{ display: 'block', width: '100%', minWidth: 720, fontFamily: 'inherit', fontSize: 12 }}
      >
        {ticks(first, last).map((day) => (
          <g key={day}>
            <Box component="line" x1={x(day)} x2={x(day)} y1={TOP - 6} y2={height} sx={{ stroke: GRID }} strokeWidth="1" />
            <Box component="text" x={x(day)} y={TOP - 12} textAnchor="middle" sx={{ fill: MUTED }}>
              {formatDate(toIso(day)).replace(/ \d{4}$/, '')}
            </Box>
          </g>
        ))}
        {items.map((item, index) => {
          const y = TOP + index * ROW;
          const start = x(toDay(item.start));
          const end = x(toDay(item.finish) + 1);            // a bar covers its last day
          const floatEnd = x(toDay(item.finish) + 1 + (item.float_days * 7) / 5);
          const middle = y + ROW / 2;
          const tip = `${item.title}: ${formatDate(item.start)} to ${formatDate(item.finish)}, ${days(item.remaining_days)} left`
            + `${item.critical ? ', on the critical path' : `, ${days(item.float_days)} of float`}`
            + `${item.due_date ? `, due ${formatDate(item.due_date)}` : ''}`;
          return (
            <g key={item.id}>
              <title>{tip}</title>
              {/* A full-row hit area, so the tooltip does not need a precise aim */}
              <rect x="0" y={y} width={WIDTH} height={ROW} fill="transparent" />
              <Box component="text" x={GUTTER - 12} y={middle + 4} textAnchor="end" sx={{ fill: INK, fontWeight: item.critical ? 700 : 400 }}>
                {shorten(item.title)}{item.critical ? ' ◆' : ''}
              </Box>
              {!item.critical && item.float_days > 0 && (
                <Box component="line" x1={end} x2={floatEnd} y1={middle} y2={middle} sx={{ stroke: MUTED }} strokeWidth="2" strokeDasharray="2 4" />
              )}
              {item.critical ? (
                <Box component="rect" x={start} y={middle - BAR / 2} width={Math.max(end - start, 4)} height={BAR} rx="4" sx={{ fill: CRITICAL }} />
              ) : (
                <Box
                  component="rect"
                  x={start + 1}
                  y={middle - BAR / 2 + 1}
                  width={Math.max(end - start - 2, 3)}
                  height={BAR - 2}
                  rx="3"
                  fill="none"
                  sx={{ stroke: MUTED }}
                  strokeWidth="2"
                />
              )}
              {item.due_date && (
                <Box
                  component="rect"
                  x={x(toDay(item.due_date) + 0.5) - 4}
                  y={middle - 4}
                  width="8"
                  height="8"
                  transform={`rotate(45 ${x(toDay(item.due_date) + 0.5)} ${middle})`}
                  sx={{ stroke: INK, fill: paint('background.paper') }}
                  strokeWidth="2"
                />
              )}
            </g>
          );
        })}
        <Box component="line" x1={x(today)} x2={x(today)} y1={TOP - 6} y2={height} sx={{ stroke: INK }} strokeWidth="2" strokeDasharray="5 4" />
        <Box component="text" x={x(today)} y={12} textAnchor={captionsCollide ? 'end' : 'middle'} dx={captionsCollide ? -4 : 0} sx={{ fill: INK, fontWeight: 700 }}>
          Today
        </Box>
        {plannedEnd !== null && (
          <>
            <Box component="line" x1={x(plannedEnd + 1)} x2={x(plannedEnd + 1)} y1={TOP - 6} y2={height} sx={{ stroke: INK }} strokeWidth="2" />
            <Box component="text" x={x(plannedEnd + 1)} y={12} textAnchor={captionsCollide ? 'start' : 'middle'} dx={captionsCollide ? 4 : 0} sx={{ fill: INK, fontWeight: 700 }}>
              Planned end
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}

const forecastShape = PropTypes.shape({
  today: PropTypes.string.isRequired,
  forecast_end: PropTypes.string,
  planned_end: PropTypes.string,
  slip_days: PropTypes.number,
  status: PropTypes.string.isRequired,
  items: PropTypes.arrayOf(PropTypes.object).isRequired,
});

Chart.propTypes = { forecast: forecastShape.isRequired, items: PropTypes.arrayOf(PropTypes.object).isRequired };

function TimelineTable({ items }) {
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" aria-label="Timeline">
        <TableHead>
          <TableRow>
            <TableCell>Deliverable</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Forecast start</TableCell>
            <TableCell>Forecast finish</TableCell>
            <TableCell>Due</TableCell>
            <TableCell align="right">Days left</TableCell>
            <TableCell align="right">Float (days)</TableCell>
            <TableCell>Critical path</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell component="th" scope="row" sx={{ fontWeight: 600 }}>{item.title}</TableCell>
              <TableCell><StatusChip status={item.status} statuses={DELIVERABLE_STATUSES} /></TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(item.start)}</TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(item.finish)}</TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(item.due_date)}</TableCell>
              <TableCell align="right">{item.remaining_days}{item.assumed ? ' (assumed)' : ''}</TableCell>
              <TableCell align="right">{item.float_days}</TableCell>
              <TableCell>{item.critical ? 'Yes' : 'No'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

TimelineTable.propTypes = { items: PropTypes.arrayOf(PropTypes.object).isRequired };

function TimelineList({ items }) {
  return (
    <Stack spacing={1.5} component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }} aria-label="Timeline">
      {items.map((item) => (
        <Card key={item.id} variant="outlined" component="li">
          <CardContent sx={{ '&:last-child': { pb: 2 } }}>
            <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600 }}>{item.title}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {formatDate(item.start)} – {formatDate(item.finish)} · {days(item.remaining_days)} left
              {item.assumed && ' (assumed)'}
              {item.due_date && ` · due ${formatDate(item.due_date)}`}
              {!item.critical && ` · ${days(item.float_days)} of float`}
            </Typography>
            <DeliverableFlags isBlocked={false} isOverdue={false} isCritical={item.critical} />
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}

TimelineList.propTypes = { items: PropTypes.arrayOf(PropTypes.object).isRequired };

/**
 * The Timeline tab: the forecast as a Gantt chart (plain SVG) with forecast
 * bars, due dates, a today line, the planned end and the critical path. The
 * same data is available as a table; on mobile it is a list.
 */
export default function TimelinePanel({ project }) {
  const isDesktop = useMediaQuery({ minWidth: 900 });
  const [state, setState] = useState({ project: null, forecast: null, error: null });
  const [view, setView] = useState('chart');

  useEffect(() => {
    let cancelled = false;
    getForecast(project.id)
      .then((forecast) => !cancelled && setState({ project, forecast, error: null }))
      .catch((err) => !cancelled && setState({ project, forecast: null, error: err.message }));
    return () => { cancelled = true; };
  }, [project]);

  if (state.project !== project && !state.forecast) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress aria-label="Loading timeline" /></Box>;
  }
  if (state.error) return <Alert severity="error">{state.error}</Alert>;

  const { forecast } = state;
  const items = forecast.forecast_end ? scheduled(forecast) : [];
  let content;
  if (items.length === 0) {
    const reason = {
      no_deliverables: 'No deliverables yet.',
      no_estimates: 'No timeline yet: add an estimate (working days) to the remaining deliverables.',
      complete: 'Every deliverable is done or cancelled, so there is nothing left to schedule.',
    }[forecast.status] ?? 'Nothing left to schedule.';
    content = <Typography color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>{reason}</Typography>;
  } else if (!isDesktop) {
    content = <TimelineList items={items} />;
  } else {
    content = (
      <>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={view}
          onChange={(_, value) => value && setView(value)}
          aria-label="Timeline view"
          sx={{ alignSelf: 'flex-start' }}
        >
          <ToggleButton value="chart">Chart</ToggleButton>
          <ToggleButton value="table">Table</ToggleButton>
        </ToggleButtonGroup>
        {view === 'chart' ? (
          <>
            <Legend />
            <Chart forecast={forecast} items={items} />
          </>
        ) : <TimelineTable items={items} />}
      </>
    );
  }

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" spacing={1.5} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="h6" component="h2">Timeline</Typography>
        {items.length > 0 && (
          <>
            <Typography variant="body2" color="text.secondary">
              Forecast end {formatDate(forecast.forecast_end)}
              {forecast.planned_end && ` · planned end ${formatDate(forecast.planned_end)}`}
            </Typography>
            <SlipChip slipDays={forecast.slip_days} />
          </>
        )}
      </Stack>
      {items.length > 0 && (
        <Typography variant="body2" color="text.secondary">
          Remaining deliverables on a Monday–Friday calendar, each starting when what it depends on is forecast to finish.
          Done and cancelled deliverables are not shown.
        </Typography>
      )}
      {content}
    </Stack>
  );
}

TimelinePanel.propTypes = { project: projectShape.isRequired };
