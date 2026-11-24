import { Component } from 'react';
import PropTypes from 'prop-types';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { claimChunkReload, isChunkLoadError } from '../utils/chunkError';

const reloadPage = () => window.location.reload();

/**
 * Catches errors while rendering (or lazy-loading) its children and shows a
 * message with a way out instead of a blank page.
 *
 * - A failed route-chunk load reloads the page once to pick up the new
 *   build (see utils/chunkError.js); if that already happened, the message
 *   says a new version is available.
 * - `resetKey` clears the error when it changes (e.g. the path), so moving
 *   to another page recovers.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, resetKey: props.resetKey };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  static getDerivedStateFromProps(props, state) {
    if (props.resetKey !== state.resetKey) return { error: null, resetKey: props.resetKey };
    return null;
  }

  componentDidCatch(error, info) {
    if (isChunkLoadError(error) && claimChunkReload()) {
      this.props.onReload();
      return;
    }
    console.error('Unexpected error while rendering', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const { fullPage, onReload } = this.props;
    const chunk = isChunkLoadError(error);
    return (
      <Box sx={fullPage ? { minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2, bgcolor: 'background.default' } : { py: 2 }}>
        <Alert severity={chunk ? 'info' : 'error'} role="alert" sx={{ maxWidth: 560 }}>
          <AlertTitle>{chunk ? 'A new version of ACME Projects is available' : 'Something went wrong'}</AlertTitle>
          {chunk
            ? 'This page could not be loaded, usually because the app was updated while it was open. Reload to continue.'
            : 'This page hit an unexpected error. Reloading usually fixes it; if it keeps happening, tell your administrator.'}
          <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
            <Button variant="contained" size="small" onClick={onReload}>Reload page</Button>
            <Button size="small" href="/">Go to home page</Button>
          </Stack>
        </Alert>
      </Box>
    );
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node,
  /** Changing this value clears a caught error. */
  resetKey: PropTypes.string,
  /** Centre the message on the whole screen (for the root boundary). */
  fullPage: PropTypes.bool,
  onReload: PropTypes.func,
};

ErrorBoundary.defaultProps = {
  children: null,
  resetKey: '',
  fullPage: false,
  onReload: reloadPage,
};
