/**
 * DocCurlViewer — Markdown / Documentation wrapper for the standardized ApiCallViewer.
 * Fully supports cURL, Python, HTTP, and JSON inspection, along with live testing and
 * collapsible JSON tree rendering via JsonView.
 */

import React from 'react';
import { Box } from '@mui/material';
import ApiCallViewer, {
  type ApiCallViewerProps,
  type ParsedCurl,
} from '@/Shuffle-Core/components/ApiCallViewer';

export interface DocCurlViewerProps extends Partial<ApiCallViewerProps> {
  rawCurl?: string;
}

export type { ParsedCurl };

export const DocCurlViewer: React.FC<DocCurlViewerProps> = (props) => {
  return (
    <Box className="not-prose" sx={{ my: 2.5, width: '100%', maxWidth: '100%', minWidth: 0, overflowX: 'hidden' }}>
      <ApiCallViewer {...props} />
    </Box>
  );
};

export default DocCurlViewer;
