import PropTypes from 'prop-types';
import { Link as RouterLink } from 'react-router-dom';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import BurnChip from './budget/BurnChip';
import ProjectActions from './ProjectActions';
import ProjectStatusChip from './ProjectStatusChip';
import projectShape from './projectPropTypes';
import { formatDate, formatProgress } from '../utils/format';

/** Desktop view: projects in a table. */
export default function ProjectTable({ projects, canChange, canDelete, onDelete }) {
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table aria-label="Projects">
        <TableHead>
          <TableRow>
            <TableCell>Code</TableCell>
            <TableCell>Name</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Owner</TableCell>
            <TableCell>Deliverables</TableCell>
            <TableCell>Budget</TableCell>
            <TableCell>Start</TableCell>
            <TableCell>End</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {projects.map((project) => (
            <TableRow key={project.id} hover>
              <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{project.code}</TableCell>
              <TableCell>
                <Link component={RouterLink} to={`/projects/${project.id}`}>{project.name}</Link>
              </TableCell>
              <TableCell><ProjectStatusChip status={project.status} /></TableCell>
              <TableCell>{project.owner_name}</TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatProgress(project)}</TableCell>
              <TableCell><BurnChip project={project} /></TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(project.start_date)}</TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(project.end_date)}</TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                {canChange(project) && <ProjectActions project={project} canDelete={canDelete(project)} onDelete={onDelete} />}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

ProjectTable.propTypes = {
  projects: PropTypes.arrayOf(projectShape).isRequired,
  canChange: PropTypes.func.isRequired,
  canDelete: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};
