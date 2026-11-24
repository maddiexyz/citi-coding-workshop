import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { categoryLabel } from '../../constants/spendCategories';
import { formatMoney } from '../../utils/format';

function Figure({ label, children }) {
  return (
    <Card variant="outlined" sx={{ flex: 1, minWidth: 150 }}>
      <CardContent>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography variant="h6" component="p">{children}</Typography>
      </CardContent>
    </Card>
  );
}

Figure.propTypes = { label: PropTypes.string.isRequired, children: PropTypes.node.isRequired };

/** Planned vs actual, burn %, an over-budget flag and spend by category. */
export default function BudgetSummary({ summary }) {
  const { currency } = summary;
  const burn = summary.burn_pct === null ? 0 : Number(summary.burn_pct);
  const maxCategory = Math.max(...summary.by_category.map((c) => Number(c.amount)), 0);
  return (
    <Stack spacing={2.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <Figure label="Planned">{summary.budget_set ? formatMoney(summary.budget_planned, currency) : 'No budget set'}</Figure>
        <Figure label="Spent">{formatMoney(summary.actual, currency)}</Figure>
        <Figure label="Remaining">{summary.budget_set ? formatMoney(summary.remaining, currency) : '—'}</Figure>
      </Stack>

      {summary.budget_set ? (
        <Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
            <Typography variant="subtitle2" component="h3">Burn</Typography>
            <Typography variant="body2">{summary.burn_pct}%</Typography>
            {summary.over_budget && <Chip size="small" color="error" label="Over budget" />}
          </Stack>
          <LinearProgress
            variant="determinate"
            value={Math.min(burn, 100)}
            color={summary.over_budget ? 'error' : 'primary'}
            sx={{ height: 10, borderRadius: 5 }}
            aria-label={`${summary.burn_pct}% of the planned budget spent`}
          />
        </Box>
      ) : (
        <Typography color="text.secondary">
          No budget set: burn is shown once a planned budget is entered on the project.
        </Typography>
      )}

      <Box>
        <Typography variant="subtitle2" component="h3" gutterBottom>Spend by category</Typography>
        <Stack spacing={1} component="dl" sx={{ m: 0 }}>
          {summary.by_category.map((c) => (
            <Stack key={c.category} direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <Typography component="dt" variant="body2" sx={{ width: 90 }}>{categoryLabel(c.category)}</Typography>
              <Box sx={{ flexGrow: 1 }}>
                <LinearProgress
                  variant="determinate"
                  value={maxCategory ? (Number(c.amount) / maxCategory) * 100 : 0}
                  sx={{ height: 6, borderRadius: 3 }}
                  aria-hidden
                />
              </Box>
              <Typography component="dd" variant="body2" sx={{ m: 0, minWidth: 100, textAlign: 'right' }}>
                {formatMoney(c.amount, currency)}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Box>
    </Stack>
  );
}

BudgetSummary.propTypes = {
  summary: PropTypes.shape({
    currency: PropTypes.string.isRequired,
    budget_set: PropTypes.bool.isRequired,
    budget_planned: PropTypes.string,
    actual: PropTypes.string.isRequired,
    remaining: PropTypes.string,
    burn_pct: PropTypes.string,
    over_budget: PropTypes.bool.isRequired,
    by_category: PropTypes.arrayOf(PropTypes.shape({
      category: PropTypes.string.isRequired, amount: PropTypes.string.isRequired,
    })).isRequired,
  }).isRequired,
};
