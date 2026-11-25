import { useState } from 'react';
import PropTypes from 'prop-types';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import projectShape from '../projectPropTypes';
import useAuth from '../../auth/useAuth';
import { canGenerateBriefing } from '../../auth/permissions';
import { briefingText, generateBriefing } from '../../services/briefingApi';
import { formatDateTime } from '../../utils/format';

const STATUS = {
  on_track: { label: 'On track', color: 'success' },
  at_risk: { label: 'At risk', color: 'warning' },
  late: { label: 'Late', color: 'error' },
  complete: { label: 'Complete', color: 'default' },
};

/** What to tell the user for each way a briefing can fail. */
function errorMessage(err) {
  if (err.status === 429) {
    const minutes = Math.max(1, Math.round((err.details?.retry_after ?? 60) / 60));
    return `You've reached the limit for AI briefings. Try again in ${minutes} min.`;
  }
  if (err.status === 503) return `${err.message}.`;
  if (err.status === 400) return 'The project data changed or expired before the briefing was ready. Try again.';
  return err.message || 'Something went wrong while asking for the briefing.';
}

function Sources({ ids, facts }) {
  return (
    <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', mt: 0.5 }} aria-label="Sources">
      {ids.map((id) => {
        const fact = facts.get(id);
        return (
          <Tooltip key={id} title={fact.text} describeChild arrow>
            <Chip size="small" variant="outlined" label={fact.label} tabIndex={0} />
          </Tooltip>
        );
      })}
    </Stack>
  );
}

Sources.propTypes = {
  ids: PropTypes.arrayOf(PropTypes.string).isRequired,
  facts: PropTypes.instanceOf(Map).isRequired,
};

function Briefing({ briefing, projectName }) {
  const [copied, setCopied] = useState(false);
  const facts = new Map(briefing.facts.map((fact) => [fact.id, fact]));
  const status = STATUS[briefing.status];

  const copy = async () => {
    await navigator.clipboard.writeText(briefingText(briefing, projectName));
    setCopied(true);
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        {status && <Chip size="small" color={status.color} label={status.label} />}
        <Typography sx={{ fontWeight: 600 }}>{briefing.headline}</Typography>
      </Stack>
      <Box component="ul" sx={{ pl: 3, m: 0 }} aria-label="Why">
        {briefing.points.map((point) => (
          <Typography component="li" variant="body2" key={point.text} sx={{ mb: 1 }}>
            {point.text}
            <Sources ids={point.sources} facts={facts} />
          </Typography>
        ))}
      </Box>
      {briefing.actions.length > 0 && (
        <Box>
          <Typography variant="subtitle2" component="h3" id="briefing-actions-heading">Next steps</Typography>
          <Box component="ol" sx={{ pl: 3, my: 1 }} aria-labelledby="briefing-actions-heading">
            {briefing.actions.map((action) => (
              <Typography component="li" variant="body2" key={action.text} sx={{ mb: 1 }}>
                {action.text}
                <Sources ids={action.sources} facts={facts} />
              </Typography>
            ))}
          </Box>
        </Box>
      )}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
        <Typography variant="caption" color="text.secondary">
          AI-generated ({briefing.model}) from this project&apos;s data at {formatDateTime(briefing.generated_at)}.
          Hover or focus a source to see the exact data. Check before sharing.
        </Typography>
        <Button size="small" startIcon={<ContentCopyIcon />} onClick={copy} sx={{ flexShrink: 0 }}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </Stack>
    </Stack>
  );
}

Briefing.propTypes = {
  briefing: PropTypes.shape({
    status: PropTypes.string,
    headline: PropTypes.string.isRequired,
    points: PropTypes.arrayOf(PropTypes.shape({ text: PropTypes.string, sources: PropTypes.arrayOf(PropTypes.string) })).isRequired,
    actions: PropTypes.arrayOf(PropTypes.shape({ text: PropTypes.string, sources: PropTypes.arrayOf(PropTypes.string) })).isRequired,
    facts: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.string, label: PropTypes.string, text: PropTypes.string })).isRequired,
    generated_at: PropTypes.string.isRequired,
  }).isRequired,
  projectName: PropTypes.string.isRequired,
};

/**
 * AI briefing of a project: a short status report for a sponsor, written by
 * Gemini from the facts the app computes (forecast, critical path, risks,
 * budget, deliverables). Every point shows the facts it rests on. Only made
 * on request, because each one is a paid model call; hidden for viewers.
 */
export default function BriefingCard({ project }) {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: false, briefing: null, error: null });

  if (!canGenerateBriefing(user)) return null;

  const generate = () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    generateBriefing(project.id)
      .then((briefing) => setState({ loading: false, briefing, error: null }))
      .catch((err) => setState((s) => ({ ...s, loading: false, error: errorMessage(err) })));
  };

  let content;
  if (state.loading) {
    content = (
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', py: 2 }} role="status">
        <CircularProgress size={20} aria-hidden="true" />
        <Typography color="text.secondary">Asking the AI…</Typography>
      </Stack>
    );
  } else if (state.briefing) {
    content = <Briefing briefing={state.briefing} projectName={`${project.code} ${project.name}`} />;
  } else {
    content = (
      <Typography variant="body2" color="text.secondary">
        A plain-English status report for sponsors: where the project stands, why, and what to do next.
        It uses only this project&apos;s data, and every point shows the data it rests on.
      </Typography>
    );
  }

  return (
    <Paper
      variant="outlined"
      component="section"
      aria-labelledby="briefing-heading"
      sx={(theme) => ({
        p: { xs: 2, sm: 3 }, borderTop: 4, borderTopColor: 'secondary.main',
        backgroundImage: `linear-gradient(180deg, ${alpha(theme.palette.secondary.main, 0.06)}, transparent 120px)`,
      })}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.5, flexWrap: 'wrap' }} useFlexGap>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <AutoAwesomeIcon color="secondary" aria-hidden="true" />
          <Typography variant="h6" component="h2" id="briefing-heading">AI briefing</Typography>
        </Stack>
        <Button
          variant={state.briefing ? 'text' : 'contained'}
          size="small"
          startIcon={<AutoAwesomeIcon />}
          onClick={generate}
          disabled={state.loading}
        >
          {state.briefing ? 'Regenerate' : 'Generate AI briefing'}
        </Button>
      </Stack>
      {state.error && <Alert severity={state.error.includes('limit') ? 'warning' : 'error'} sx={{ mb: 2 }}>{state.error}</Alert>}
      {content}
    </Paper>
  );
}

BriefingCard.propTypes = { project: projectShape.isRequired };
