import PropTypes from 'prop-types';
import { Link as RouterLink } from 'react-router-dom';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import projectShape from './projectPropTypes';

/** Edit and (when allowed) delete buttons for one project; render only when the user may change it. */
export default function ProjectActions({ project, canDelete = true, onDelete }) {
  return (
    <>
      <Tooltip title="Edit">
        <IconButton component={RouterLink} to={`/projects/${project.id}/edit`} aria-label={`Edit ${project.code}`}>
          <EditIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      {canDelete && (
        <Tooltip title="Delete">
          <IconButton onClick={() => onDelete(project)} aria-label={`Delete ${project.code}`} color="error">
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </>
  );
}

ProjectActions.propTypes = {
  project: projectShape.isRequired,
  canDelete: PropTypes.bool,
  onDelete: PropTypes.func.isRequired,
};
