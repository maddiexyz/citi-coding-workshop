import Chip from '@mui/material/Chip';
import projectShape from '../projectPropTypes';

/** A project's budget burn at a glance: "No budget", "45%" or "110% · over budget". */
export default function BurnChip({ project }) {
  if (project.burn_pct === null || project.burn_pct === undefined) {
    return <Chip size="small" variant="outlined" label="No budget" />;
  }
  if (project.over_budget) {
    return <Chip size="small" color="error" label={`${project.burn_pct}% · over budget`} />;
  }
  return <Chip size="small" variant="outlined" color="primary" label={`${project.burn_pct}% spent`} />;
}

BurnChip.propTypes = { project: projectShape.isRequired };
