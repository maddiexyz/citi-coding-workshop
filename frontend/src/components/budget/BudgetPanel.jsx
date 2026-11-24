import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useMediaQuery } from 'react-responsive';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import useAuth from '../../auth/useAuth';
import { canDeleteBudgetEntries, canManageBudget } from '../../auth/permissions';
import { SPEND_CATEGORIES, categoryLabel } from '../../constants/spendCategories';
import { deleteBudgetEntry, getBudgetSummary, listBudgetEntries } from '../../services/budgetApi';
import { formatDate, formatMoney } from '../../utils/format';
import useDebouncedValue from '../../utils/useDebouncedValue';
import ConfirmDialog from '../ConfirmDialog';
import projectShape from '../projectPropTypes';
import BudgetEntryDialog from './BudgetEntryDialog';
import BudgetSummary from './BudgetSummary';

const NO_FILTERS = { category: '', from: '', to: '', search: '' };

/**
 * The Budget tab. Everyone sees the summary; admins and the owning PM also
 * see and record spend entries; only admins delete them.
 */
export default function BudgetPanel({ project, onChanged }) {
  const { user } = useAuth();
  const isDesktop = useMediaQuery({ minWidth: 900 });
  const canManage = canManageBudget(user, project);
  const canDelete = canDeleteBudgetEntries(user);

  const [filters, setFilters] = useState(NO_FILTERS);
  const q = useDebouncedValue(filters.search.trim());
  const [reloadKey, setReloadKey] = useState(0);
  const [summary, setSummary] = useState({ key: null, data: null, error: null });
  const [entries, setEntries] = useState({ key: null, items: [], error: null });
  const [dialog, setDialog] = useState(null); // {entry|null}
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [message, setMessage] = useState(null);

  const summaryKey = `${project.id}:${reloadKey}`;
  const entriesKey = JSON.stringify([project.id, reloadKey, filters.category, filters.from, filters.to, q]);

  useEffect(() => {
    let cancelled = false;
    getBudgetSummary(project.id)
      .then((data) => !cancelled && setSummary({ key: summaryKey, data, error: null }))
      .catch((err) => !cancelled && setSummary({ key: summaryKey, data: null, error: err.message }));
    return () => { cancelled = true; };
  }, [project.id, summaryKey]);

  useEffect(() => {
    if (!canManage) return undefined;
    let cancelled = false;
    listBudgetEntries(project.id, { category: filters.category, from: filters.from, to: filters.to, q })
      .then((items) => !cancelled && setEntries({ key: entriesKey, items, error: null }))
      .catch((err) => !cancelled && setEntries({ key: entriesKey, items: [], error: err.message }));
    return () => { cancelled = true; };
  }, [canManage, project.id, entriesKey, filters.category, filters.from, filters.to, q]);

  const changed = (verb, entry) => {
    setMessage(`${verb} ${formatMoney(entry.amount, summary.data?.currency)} of ${categoryLabel(entry.category).toLowerCase()} spend`);
    setReloadKey((key) => key + 1);
    onChanged();
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteBudgetEntry(toDelete.id);
      changed('Deleted', toDelete);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setToDelete(null);
      setDeleting(false);
    }
  };

  if (summary.key !== summaryKey && !summary.data) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress aria-label="Loading budget" /></Box>;
  }
  if (summary.error) return <Alert severity="error">{summary.error}</Alert>;
  const { currency } = summary.data;
  const set = (name) => (event) => setFilters((f) => ({ ...f, [name]: event.target.value }));

  const actions = (e) => (
    <>
      <Tooltip title="Edit"><IconButton aria-label={`Edit spend of ${formatMoney(e.amount, currency)}`} onClick={() => setDialog({ entry: e })}><EditIcon fontSize="small" /></IconButton></Tooltip>
      {canDelete && (
        <Tooltip title="Delete"><IconButton color="error" aria-label={`Delete spend of ${formatMoney(e.amount, currency)}`} onClick={() => setToDelete(e)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
      )}
    </>
  );

  let list = null;
  if (canManage) {
    if (entries.key !== entriesKey) {
      list = <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress aria-label="Loading spend entries" /></Box>;
    } else if (entries.error) {
      list = <Alert severity="error">{entries.error}</Alert>;
    } else if (entries.items.length === 0) {
      list = (
        <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          {filters.category || filters.from || filters.to || q ? 'No spend matches these filters.' : 'No spend recorded yet.'}
        </Typography>
      );
    } else if (isDesktop) {
      list = (
        <TableContainer component={Paper} variant="outlined">
          <Table aria-label="Spend entries" size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell><TableCell>Category</TableCell><TableCell>Description</TableCell>
                <TableCell align="right">Amount</TableCell><TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.items.map((e) => (
                <TableRow key={e.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(e.spent_on)}</TableCell>
                  <TableCell>{categoryLabel(e.category)}</TableCell>
                  <TableCell>{e.description ?? '—'}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{formatMoney(e.amount, currency)}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{actions(e)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      );
    } else {
      list = (
        <Stack spacing={1.5} component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }} aria-label="Spend entries">
          {entries.items.map((e) => (
            <Card key={e.id} variant="outlined" component="li">
              <CardContent>
                <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                  <Typography sx={{ fontWeight: 600 }}>{formatMoney(e.amount, currency)}</Typography>
                  <Typography variant="body2" color="text.secondary">{formatDate(e.spent_on)}</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary">{categoryLabel(e.category)}{e.description ? ` · ${e.description}` : ''}</Typography>
                <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>{actions(e)}</Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      );
    }
  }

  return (
    <Stack spacing={3}>
      <Typography variant="h6" component="h2">Budget</Typography>
      <BudgetSummary summary={summary.data} />
      {canManage && (
        <>
          <Divider />
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6" component="h2">Spend entries</Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ entry: null })}>Record spend</Button>
          </Stack>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField label="Search descriptions" value={filters.search} onChange={set('search')} size="small" sx={{ flexGrow: 1 }} />
            <TextField select label="Category" value={filters.category} onChange={set('category')} size="small" sx={{ minWidth: 150 }}
              slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}>
              <MenuItem value="">All categories</MenuItem>
              {SPEND_CATEGORIES.map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
            </TextField>
            <TextField label="From" type="date" value={filters.from} onChange={set('from')} size="small" slotProps={{ inputLabel: { shrink: true } }} />
            <TextField label="To" type="date" value={filters.to} onChange={set('to')} size="small" slotProps={{ inputLabel: { shrink: true } }} />
          </Stack>
          {actionError && <Alert severity="error" onClose={() => setActionError(null)}>{actionError}</Alert>}
          {list}
        </>
      )}
      {dialog && (
        <BudgetEntryDialog
          projectId={project.id}
          currency={currency}
          entry={dialog.entry}
          onClose={() => setDialog(null)}
          onSaved={(entry, verb) => { setDialog(null); changed(verb, entry); }}
        />
      )}
      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete spend entry?"
        message={toDelete ? `${formatMoney(toDelete.amount, currency)} of ${categoryLabel(toDelete.category).toLowerCase()} spend on ${formatDate(toDelete.spent_on)} will be deleted. The change is kept in the project's history.` : ''}
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
      <Snackbar open={Boolean(message)} autoHideDuration={4000} onClose={() => setMessage(null)} message={message} />
    </Stack>
  );
}

BudgetPanel.propTypes = {
  project: projectShape.isRequired,
  onChanged: PropTypes.func.isRequired,
};
