import PropTypes from 'prop-types';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import DeleteIcon from '@mui/icons-material/Delete';
import StatusChip from '../StatusChip';
import DeliverableFlags from './DeliverableFlags';
import deliverableShape from './deliverablePropTypes';
import { DELIVERABLE_STATUSES } from '../../constants/deliverableStatus';
import { formatDate } from '../../utils/format';

function DeleteButton({ deliverable, onDelete }) {
  return (
    <Tooltip title="Delete">
      <IconButton
        color="error"
        aria-label={`Delete ${deliverable.title}`}
        onClick={(event) => { event.stopPropagation(); onDelete(deliverable); }}
      >
        <DeleteIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}

DeleteButton.propTypes = { deliverable: deliverableShape.isRequired, onDelete: PropTypes.func.isRequired };

/**
 * Deliverables as a table (desktop) or cards (mobile). Selecting one opens it;
 * the delete button only shows when canDelete is true.
 */
export default function DeliverableList({ deliverables, isDesktop, canDelete, onOpen, onDelete }) {
  if (!isDesktop) {
    return (
      <Stack spacing={1.5} component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }} aria-label="Deliverables">
        {deliverables.map((item) => (
          <Card key={item.id} variant="outlined" component="li">
            <CardActionArea onClick={() => onOpen(item)} aria-label={`Open ${item.title}`}>
              <CardContent>
                <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600 }}>{item.title}</Typography>
                  <StatusChip status={item.status} statuses={DELIVERABLE_STATUSES} />
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Due {formatDate(item.due_date)}
                  {item.predecessor_count > 0 && ` · depends on ${item.predecessor_count}`}
                </Typography>
                <DeliverableFlags isBlocked={item.is_blocked} isOverdue={item.is_overdue} />
              </CardContent>
            </CardActionArea>
            {canDelete && (
              <Stack direction="row" sx={{ justifyContent: 'flex-end', px: 1, pb: 1 }}>
                <DeleteButton deliverable={item} onDelete={onDelete} />
              </Stack>
            )}
          </Card>
        ))}
      </Stack>
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table aria-label="Deliverables">
        <TableHead>
          <TableRow>
            <TableCell>Title</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Due</TableCell>
            <TableCell>Depends on</TableCell>
            <TableCell>Flags</TableCell>
            {canDelete && <TableCell align="right">Actions</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {deliverables.map((item) => (
            <TableRow
              key={item.id}
              hover
              onClick={() => onOpen(item)}
              onKeyDown={(event) => event.key === 'Enter' && onOpen(item)}
              tabIndex={0}
              aria-label={`Open ${item.title}`}
              sx={{ cursor: 'pointer' }}
            >
              <TableCell sx={{ fontWeight: 600 }}>{item.title}</TableCell>
              <TableCell><StatusChip status={item.status} statuses={DELIVERABLE_STATUSES} /></TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(item.due_date)}</TableCell>
              <TableCell>{item.predecessor_count || '—'}</TableCell>
              <TableCell><DeliverableFlags isBlocked={item.is_blocked} isOverdue={item.is_overdue} /></TableCell>
              {canDelete && (
                <TableCell align="right"><DeleteButton deliverable={item} onDelete={onDelete} /></TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

DeliverableList.propTypes = {
  deliverables: PropTypes.arrayOf(deliverableShape).isRequired,
  isDesktop: PropTypes.bool.isRequired,
  canDelete: PropTypes.bool.isRequired,
  onOpen: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};
