import PropTypes from 'prop-types';
import { Link as RouterLink } from 'react-router-dom';
import CardActionArea from '@mui/material/CardActionArea';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import useYou from '../auth/useYou';
import BurnChip from './budget/BurnChip';
import ForecastEnd from './forecast/ForecastEnd';
import ProjectActions from './ProjectActions';
import ProjectStatusChip from './ProjectStatusChip';
import projectShape from './projectPropTypes';
import { hasForecast } from '../services/forecastApi';
import { formatDate, formatProgress } from '../utils/format';

/** Mobile view: one card per project. */
export default function ProjectCardList({ projects, canChange, canDelete, onDelete }) {
  const you = useYou();
  return (
    <Stack spacing={1.5} component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }} aria-label="Projects">
      {projects.map((project) => (
        <Card key={project.id} variant="outlined" component="li">
          <CardActionArea component={RouterLink} to={`/projects/${project.id}`} aria-label={`Open ${project.code}`}>
          <CardContent sx={{ pb: 1 }}>
            <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="overline" sx={{ fontWeight: 600 }}>{project.code}</Typography>
              <ProjectStatusChip status={project.status} />
            </Stack>
            <Typography variant="h6" component="h2">{project.name}</Typography>
            <Typography variant="body2" color="text.secondary">
              {you.user(project.owner_id, project.owner_name)}
              {' · '}
              {formatDate(project.start_date)}
              {' – '}
              {formatDate(project.end_date)}
              {' · '}
              {formatProgress(project)}
            </Typography>
            <Stack direction="row" sx={{ mt: 1 }}><BurnChip project={project} /></Stack>
            {hasForecast(project) && (
              <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">Forecast end</Typography>
                <Typography variant="body2" component="div"><ForecastEnd project={project} /></Typography>
              </Stack>
            )}
          </CardContent>
          </CardActionArea>
          {canChange(project) && (
            <CardActions sx={{ justifyContent: 'flex-end', pt: 0 }}>
              <ProjectActions project={project} canDelete={canDelete(project)} onDelete={onDelete} />
            </CardActions>
          )}
        </Card>
      ))}
    </Stack>
  );
}

ProjectCardList.propTypes = {
  projects: PropTypes.arrayOf(projectShape).isRequired,
  canChange: PropTypes.func.isRequired,
  canDelete: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};
