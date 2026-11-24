import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import useYou from '../../auth/useYou';
import { DELIVERABLE_STATUSES } from '../../constants/deliverableStatus';
import { getChain } from '../../services/deliverablesApi';
import buildTree from '../../utils/chainTree';
import { formatDate } from '../../utils/format';
import StatusChip from '../StatusChip';
import DeliverableFlags from './DeliverableFlags';

function ChainList({ items, nodes, depth, onOpen }) {
  const you = useYou();
  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, pl: depth === 0 ? 0 : { xs: 2, sm: 4 } }}>
      {items.map((item) => {
        const node = nodes.get(item.id);
        let accent = 'divider';
        if (node.is_overdue) accent = 'error.main';
        else if (node.is_blocked) accent = 'warning.main';
        return (
          <Box component="li" key={item.key} sx={{ mt: 1 }}>
            <Box sx={{ borderLeft: 4, borderColor: accent, pl: 1.5, py: 0.5 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' }, flexWrap: 'wrap' }} useFlexGap>
                {depth > 0 && <Typography component="span" variant="body2" color="text.secondary" aria-hidden>↳</Typography>}
                <Button
                  variant="text"
                  onClick={() => onOpen(node)}
                  sx={{ p: 0, minWidth: 0, textTransform: 'none', fontWeight: 600, justifyContent: 'flex-start' }}
                >
                  {node.title}
                </Button>
                <StatusChip status={node.status} statuses={DELIVERABLE_STATUSES} />
                <DeliverableFlags isBlocked={node.is_blocked} isOverdue={node.is_overdue} />
                <Typography variant="body2" color="text.secondary">
                  {[you.resource(node.assignee_resource_id, node.assignee_name), node.due_date && `due ${formatDate(node.due_date)}`].filter(Boolean).join(' · ')}
                </Typography>
              </Stack>
            </Box>
            {item.children.length > 0 && (
              <ChainList items={item.children} nodes={nodes} depth={depth + 1} onOpen={onOpen} />
            )}
          </Box>
        );
      })}
    </Box>
  );
}

const treeShape = PropTypes.shape({ id: PropTypes.number.isRequired, key: PropTypes.string.isRequired });

ChainList.propTypes = {
  items: PropTypes.arrayOf(treeShape).isRequired,
  nodes: PropTypes.instanceOf(Map).isRequired,
  depth: PropTypes.number.isRequired,
  onOpen: PropTypes.func.isRequired,
};

/**
 * Every dependency chain in a project, top-down: what has to finish first is
 * at the top, what waits on it is indented below. Blocked deliverables have
 * an amber edge, overdue ones a red edge. Selecting one opens it.
 */
export default function ChainView({ projectId, reloadKey, onOpen }) {
  const [state, setState] = useState({ key: null, data: null, error: null });
  const key = `${projectId}:${reloadKey}`;

  useEffect(() => {
    let cancelled = false;
    getChain(projectId)
      .then((data) => !cancelled && setState({ key, data, error: null }))
      .catch((err) => !cancelled && setState({ key, data: null, error: err.message }));
    return () => { cancelled = true; };
  }, [projectId, key]);

  if (state.key !== key) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress aria-label="Loading dependency chain" /></Box>;
  }
  if (state.error) return <Alert severity="error">{state.error}</Alert>;
  if (state.data.rows.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
        No dependencies in this project yet. Open a deliverable to add what it depends on.
      </Typography>
    );
  }
  const nodes = new Map(state.data.nodes.map((n) => [n.id, n]));
  return (
    <Box component="nav" aria-label="Dependency chain">
      <Typography variant="body2" color="text.secondary">
        Each deliverable is listed under the one it depends on. Amber edge: blocked; red edge: overdue.
      </Typography>
      <ChainList items={buildTree(state.data.rows)} nodes={nodes} depth={0} onOpen={onOpen} />
    </Box>
  );
}

ChainView.propTypes = {
  projectId: PropTypes.number.isRequired,
  reloadKey: PropTypes.number.isRequired,
  onOpen: PropTypes.func.isRequired,
};
