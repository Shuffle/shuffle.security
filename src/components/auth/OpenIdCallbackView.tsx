import React, { useEffect, useState } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import { getApiUrl } from '@/Shuffle-MCPs/api';

export interface OpenIdCallbackViewProps {
  mode?: 'openid' | 'sso';
}

export const OpenIdCallbackView: React.FC<OpenIdCallbackViewProps> = ({ mode = 'openid' }) => {
  const [statusMessage, setStatusMessage] = useState('Completing authentication...');
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let timer: number | undefined;
    const search = window.location.search;
    const params = new URLSearchParams(search);

    const error = params.get('error_description') || params.get('error');
    if (error) {
      setIsError(true);
      setStatusMessage(`Authentication error: ${error}`);
      timer = window.setTimeout(() => {
        window.location.replace(`/login?error=${encodeURIComponent(error)}`);
      }, 1500);
      return () => {
        if (timer) window.clearTimeout(timer);
      };
    }

    const state = params.get('state');
    if (state && (state.includes('app_name=') || state.includes('workflow_id='))) {
      // App OAuth authentication flow (matches SetAuthenticationSSO)
      const appAuthData: {
        label: string;
        app: { name: string; id: string; app_version: string };
        fields: Array<{ key: string; value: string }>;
        type: string;
        reference_workflow?: string;
      } = {
        label: '',
        app: { name: '', id: '', app_version: '' },
        fields: [],
        type: 'oauth2',
      };

      appAuthData.fields.push({
        key: 'redirect_uri',
        value: window.location.origin + window.location.pathname,
      });

      const code = params.get('code');
      if (code) {
        appAuthData.fields.push({ key: 'code', value: code });
      }

      const sessionState = params.get('session_state');
      if (sessionState) {
        appAuthData.fields.push({ key: 'session_state', value: sessionState });
      }

      const stateParts = state.split('&');
      for (const part of stateParts) {
        const query = part.split('=');
        if (query.length !== 2) continue;
        const [k, v] = query;
        if (k === 'workflow_id') {
          appAuthData.reference_workflow = v;
        }
        if (k === 'app_name') {
          appAuthData.app.name = v;
          appAuthData.label = `OAuth2 for ${v}`;
        }
        if (k === 'app_id') {
          appAuthData.app.id = v;
        }
        if (k === 'app_version') {
          appAuthData.app.app_version = v;
        }
        if (['authentication_url', 'scope', 'client_id', 'client_secret'].includes(k)) {
          appAuthData.fields.push({ key: k, value: v });
        }
      }

      fetch(getApiUrl('/api/v1/apps/authentication'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(appAuthData),
      })
        .then((res) => {
          if (!res.ok) {
            setIsError(true);
            setStatusMessage('Failed to save application authentication.');
            return;
          }
          setStatusMessage('Authentication successful. Window will close shortly.');
          setTimeout(() => {
            window.close();
          }, 1000);
        })
        .catch((err) => {
          setIsError(true);
          setStatusMessage(err?.message || 'Error saving application authentication.');
        });

      return;
    }

    const endpoint = mode === 'sso' ? '/api/v1/login_sso' : '/api/v1/login_openid';
    const targetUrl = `${getApiUrl(endpoint)}${search}`;

    if (
      search &&
      (params.get('code') ||
        params.get('state') ||
        params.get('session_state') ||
        params.get('SAMLResponse'))
    ) {
      window.location.replace(targetUrl);
    } else {
      window.location.replace('/login');
    }

    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [mode]);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '80vh',
        gap: 2,
        px: 2,
        textAlign: 'center',
      }}
    >
      {!isError && <CircularProgress size={32} thickness={4} />}
      <Typography
        variant="body1"
        sx={{
          color: isError ? 'error.main' : 'text.secondary',
          fontWeight: 500,
          maxWidth: 480,
        }}
      >
        {statusMessage}
      </Typography>
    </Box>
  );
};

export default OpenIdCallbackView;
