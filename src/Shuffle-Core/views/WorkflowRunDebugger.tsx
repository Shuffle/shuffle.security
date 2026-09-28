import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  TextField,
  Link,
  Button,
  ButtonGroup,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Autocomplete,
  Tooltip,
  Typography,
  IconButton,
  Switch,
  InputAdornment,
  Box,
  useTheme as useMuiTheme,
} from '@mui/material';

import { toast } from 'react-toastify';
import dayjs, { Dayjs } from 'dayjs';
import { DateTimePicker } from '../components/DateTimePicker';

import {
  OpenInNew as OpenInNewIcon,
  PlayArrow as PlayArrowIcon,
  Insights as InsightsIcon,
  Replay as ReplayIcon,
  EditNote as EditNoteIcon,
  AccountTree as AccountTreeIcon,
  FilterAltOff as FilterAltOffIcon,
  Send as SendIcon,
  Visibility as VisibilityIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
} from '@mui/icons-material';

import { DataGrid, GridColDef } from '@mui/x-data-grid';

import { WorkflowRunExplorerDrawer } from '../components/WorkflowRunExplorer';
import { getApiUrl, getAuthHeader } from '../api';
import { getShuffleCoreWorkflowUrl } from '../lib/shuffleUrls';
import singulAgentIcon from '@/assets/singul-agent-icon.png';

// Inline data URIs for standard trigger badges so there is no dependency on the legacy workflow canvas
const TRIGGER_WEBHOOK_IMG =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiByeD0iOCIgZmlsbD0iIzIxQTBCRCIvPgo8cGF0aCBkPSJNMjMuOTYxNyAxOC4wOTk0QzI1LjAwMDQgMTguMDY5NiAyNS42ODE3IDE5LjE3NTIgMjUuMTg4MiAyMC4wODk2TDI1LjE3NDYgMjAuMTE1TDI1LjE5MDIgMjAuMTM5NEwyNy45ODMyIDI0LjY4MDRMMjguMDA0NiAyNC43MTU2TDI4LjA0MzcgMjQuN0MyOC41MzgzIDI0LjUwMDcgMjkuMDY3MSAyNC4zOTgyIDI5LjYwMDMgMjQuMzk4MkMzMS4wODE0IDI0LjM5ODkgMzIuNDQ5OSAyNS4xODkyIDMzLjE5MTIgMjYuNDcxNEMzNC43ODk2IDI5LjIzNzMgMzIuNzk0OCAzMi42OTY1IDI5LjYwMDMgMzIuNjk4QzI5LjM2ODEgMzIuNjk4IDI5LjE1MzkgMzIuNTczOSAyOS4wMzc4IDMyLjM3MjhDMjguNzg3NyAzMS45Mzk1IDI5LjEgMzEuMzk4MiAyOS42MDAzIDMxLjM5ODJDMzEuMjA2NyAzMS4zOTg4IDMyLjQ5NjEgMzAuMDcyMyAzMi40NSAyOC40NjY2QzMyLjM4NjcgMjYuMjczNiAyOS45NzM3IDI0Ljk3MTYgMjguMTA2MiAyNi4xMjI4QzI3LjgwMDggMjYuMzEwOCAyNy40MDAxIDI2LjIxNSAyNy4yMTE3IDI1LjkwOTlIMjcuMjEyNkwyNC4wODE4IDIwLjgyMkwyNC4wNjcxIDIwLjc5ODZIMjQuMDAwN0MyMy41MzIzIDIwLjc5ODYgMjMuMDk3MSAyMC41NTU4IDIyLjg1MTMgMjAuMTU3QzIyLjMwNjIgMTkuMjcyMyAyMi45MjMgMTguMTI5MyAyMy45NjE3IDE4LjA5OTRaTTE1LjA4MDggMjYuMDU3NEMxNS4zODE0IDI1LjY1NzIgMTYuMDAyNiAyNS43MzI4IDE2LjE5OSAyNi4xOTMxQzE2LjI3ODcgMjYuMzgwMSAxNi4yNjU3IDI2LjU5MTkgMTYuMTY3NyAyNi43NjY0TDE2LjEyMDggMjYuODM4NkMxNS43NDkxIDI3LjMzMSAxNS41NDg1IDI3LjkzMTYgMTUuNTUwNSAyOC41NDg2QzE1LjU1MDcgMzAuNzQyMyAxNy45MjYxIDMyLjExMzIgMTkuODI1OSAzMS4wMTY0QzIwLjcwNzUgMzAuNTA3MyAyMS4yNTA2IDI5LjU2NjYgMjEuMjUwNyAyOC41NDg2QzIxLjI1MDcgMjguMTg5NyAyMS41NDE0IDI3Ljg5ODQgMjEuOTAwMSAyNy44OTgySDI4LjQxNzdMMjguNDMyNCAyNy44NzM4QzI4Ljk1MiAyNi45NzM4IDMwLjI1MTYgMjYuOTczOCAzMC43NzEyIDI3Ljg3MzhDMzEuMjkwMyAyOC43NzM3IDMwLjY0MDMgMjkuODk4MiAyOS42MDEzIDI5Ljg5ODJDMjkuMTE5MiAyOS44OTgxIDI4LjY3MzUgMjkuNjQwOSAyOC40MzI0IDI5LjIyMzRMMjguNDE3NyAyOS4xOThIMjIuNDk4OEwyMi40OTE5IDI5LjI0QzIxLjk1OTcgMzIuMzg5NyAxOC4yMTc0IDMzLjc4MjIgMTUuNzU1NiAzMS43NDY4QzE0LjA0ODEgMzAuMzM0NyAxMy43NTA4IDI3LjgyOTYgMTUuMDgwOCAyNi4wNTc0Wk0yMC42NjA5IDE2Ljk5QzIyLjU1NTQgMTQuNDE3OSAyNi41MjQxIDE0Ljg2MTIgMjcuODA0NCAxNy43ODc4QzI3Ljg5NzMgMTguMDAwOCAyNy44NjkxIDE4LjI0NzQgMjcuNzMxMiAxOC40MzQzQzI3LjQzNCAxOC44MzY0IDI2LjgxMzQgMTguNzY2NCAyNi42MTMgMTguMzA4M1YxOC4zMDc0QzI1Ljk0NTQgMTYuNzc5MyAyNC4xMTM0IDE2LjE0ODUgMjIuNjQ2MiAxNi45NDEyQzIwLjcxNjIgMTcuOTg0IDIwLjYzODYgMjAuNzI1NiAyMi41MDY2IDIxLjg3NTdDMjIuODEyIDIyLjA2MzkgMjIuOTA3MyAyMi40NjM3IDIyLjcxOTUgMjIuNzY5M0wxOS41ODk2IDI3Ljg1NjJMMTkuNTc1IDI3Ljg4MDZMMTkuNTg4NiAyNy45MDZDMjAuMDc1IDI4LjgwNTUgMTkuNDIzNiAyOS44OTgzIDE4LjQwMTEgMjkuODk4MkMxNy45MTk2IDI5Ljg5NzggMTcuNDc0MyAyOS42NDEyIDE3LjIzMzIgMjkuMjI0NEMxNi43MTI5IDI4LjMyNDggMTcuMzYxOSAyNy4xOTg4IDE4LjQwMTEgMjcuMTk4SDE4LjQ2NzVMMTguNDgyMiAyNy4xNzQ2TDIxLjI3NjEgMjIuNjM1NUwyMS4yOTg2IDIyLjU5OTRMMjEuMjY2NCAyMi41NzFDMTkuNjQ2MSAyMS4xNTAxIDE5LjM4MjkgMTguNzI1MiAyMC42NjA5IDE2Ljk5WiIgZmlsbD0id2hpdGUiIHN0cm9rZT0iIzIxQTBCRCIgc3Ryb2tlLXdpZHRoPSIwLjEiLz4KPC9zdmc+Cg==';

const TRIGGER_SCHEDULE_IMG =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiByeD0iOCIgZmlsbD0iI0UzQTQxQiIvPgo8cmVjdCB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDEyIDEyKSIgZmlsbD0iI0UzQTQxQiIvPgo8Y2lyY2xlIGN4PSIyNCIgY3k9IjI0IiByPSI4Ljc1IiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjEuNSIvPgo8cGF0aCBkPSJNMjguNSAyNEgyNC4yNUMyNC4xMTE5IDI0IDI0IDIzLjg4ODEgMjQgMjMuNzVWMjAuNSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8L3N2Zz4=';

const TRIGGER_SUBFLOW_IMG =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiByeD0iOCIgZmlsbD0idXJsKCNwYWludDBfbGluZWFyXzMxN181OTcpIi8+CjxwYXRoIGQ9Ik0xNS45OTk4IDE2LjAwMTVMMTUuOTk5OCAyNS43NDA2TDE5LjIwMDEgMjUuNzQwNkwxOS4yMDAxIDE5LjI0ODVMMzEuOTk5OCAxOS4yNDg1TDMxLjk5OTggMTYuMDAxNUwxNS45OTk4IDE2LjAwMTVaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMjguNzk5NCAyMi4yNjE3TDI4Ljc5OTQgMjguNzUzOEwxNS45OTk4IDI4Ljc1MzhMMTUuOTk5OCAzMi4wMDA4TDMxLjk5OTggMzIuMDAwOEwzMS45OTk4IDIyLjI2MTdMMjguNzk5NCAyMi4yNjE3WiIgZmlsbD0id2hpdGUiLz4KPHBhdGggZD0iTTI1LjczOSAyMi4yNjE3TDIyLjI2MDcgMjIuMjYxN0wyMi4yNjA3IDI1Ljc0TDI1LjczOSAyNS43NEwyNS43MzkgMjIuMjYxN1oiIGZpbGw9IndoaXRlIi8+CjxkZWZzPgo8bGluZWFyR3JhZGllbnQgaWQ9InBhaW50MF9saW5lYXJfMzE3XzU5NyIgeDE9Ii03LjcwNzc2ZS0wOSIgeTE9IjI3LjA3NjkiIHgyPSI0OC4wMDE0IiB5Mj0iMjYuOTM3NyIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiPgo8c3RvcCBzdG9wLWNvbG9yPSIjRkY4NDQ0Ii8+CjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iI0YyNjQzQiIvPgo8L2xpbmVhckdyYWRpZW50Pgo8L2RlZnM+Cjwvc3ZnPgo=';

export interface WorkflowRunDebuggerProps {
  userdata?: any;
  globalUrl?: string;
  theme?: 'light' | 'dark' | string;
  supportEmail?: string;
  defaultWorkflowId?: string;
  defaultExecutionId?: string;
}

interface WorkflowItem {
  id: string;
  name: string;
  image?: string;
  [key: string]: any;
}

export const WorkflowRunDebugger: React.FC<WorkflowRunDebuggerProps> = ({
  userdata,
  globalUrl = '',
  theme: themeProp,
  supportEmail = 'support@shuffler.io',
  defaultWorkflowId,
  defaultExecutionId,
}) => {
  const muiTheme = useMuiTheme();
  const isDark =
    themeProp === 'dark' ||
    (!themeProp && muiTheme.palette.mode === 'dark') ||
    (typeof document !== 'undefined' &&
      document.documentElement.classList.contains('dark'));
  const themeMode = isDark ? 'dark' : 'light';

  // Read URL search parameters on mount
  const urlParams = useMemo(() => {
    if (typeof window === 'undefined') return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  }, []);

  const [workflowId, setWorkflowId] = useState<string>(
    urlParams.get('workflow_id') || defaultWorkflowId || ''
  );
  const [status, setStatus] = useState<string>(urlParams.get('status') || '');
  const [startTime, setStartTime] = useState<Dayjs | null>(
    urlParams.get('start_time') ? dayjs(urlParams.get('start_time')) : null
  );
  const [endTime, setEndTime] = useState<Dayjs | null>(
    urlParams.get('end_time') ? dayjs(urlParams.get('end_time')) : null
  );
  const [totalCount, setTotalCount] = useState<number>(0);

  const [workflow, setWorkflow] = useState<WorkflowItem>({
    id: '',
    name: 'All Workflows',
  });
  const [ignoreOrg, setIgnoreOrg] = useState<boolean>(false);
  const [searchLoading, setSearchLoading] = useState<boolean>(false);
  const [rowCursor] = useState<string>('');
  const [rowsPerPage, setRowsPerPage] = useState<number>(20);
  const [maxExecutionCount, setMaxExecutionCount] = useState<number>(
    urlParams.get('max_results') ? Number(urlParams.get('max_results')) : 50
  );
  const [resultRows, setResultRows] = useState<any[]>([]);
  const [selectedWorkflowExecutions, setSelectedWorkflowExecutions] = useState<any[]>([]);
  const [suborgWorkflowRuns, setSuborgWorkflowRuns] = useState<boolean>(
    urlParams.get('suborg_runs') === 'true'
  );
  const [paginationModel, setPaginationModel] = useState({
    page: 0,
    pageSize: 10,
  });
  const [openWorkflowMenu, setOpenWorkflowMenu] = useState<boolean>(false);
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([
    { id: '', name: 'All Workflows' },
  ]);

  // WorkflowRunExplorer drawer state
  const initialExecutionId =
    urlParams.get('execution_id') || defaultExecutionId || '';
  const [selectedExecutionId, setSelectedExecutionId] = useState<string>(
    initialExecutionId
  );
  const [selectedExecutionAuth, setSelectedExecutionAuth] = useState<string>(
    urlParams.get('authorization') || ''
  );
  const [explorerDrawerOpen, setExplorerDrawerOpen] = useState<boolean>(
    Boolean(initialExecutionId)
  );

  const imageSize = 24;

  const buildApiUrl = useCallback(
    (endpoint: string) => {
      if (globalUrl) {
        const base = globalUrl.replace(/\/+$/, '');
        const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        return `${base}${path}`;
      }
      return getApiUrl(endpoint);
    },
    [globalUrl]
  );

  const getRequestHeaders = useCallback(() => {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...getAuthHeader(),
    };
  }, []);

  const handleWorkflowUsageCount = useCallback(
    (wfList: WorkflowItem[]) => {
      if (!wfList || wfList.length === 0) return;

      setTotalCount(0);
      let startStr = '';
      let endStr = '';
      let count = 0;

      try {
        startStr = startTime ? startTime.toDate().toISOString() : '';
        endStr = endTime ? endTime.toDate().toISOString() : '';
      } catch {
        toast('Invalid date format', { type: 'error' });
      }

      const maxWorkflows = 5;
      for (let i = 0; i < wfList.length; i++) {
        if (i > maxWorkflows) break;
        const curId = wfList[i].id;
        if (!curId) continue;

        let url = buildApiUrl(`/api/v1/workflows/${curId}/executions/count`);
        if (startStr !== '') {
          url += `?start_time=${encodeURIComponent(startStr)}`;
        }
        if (endStr !== '') {
          url += startStr !== '' ? `&end_time=${encodeURIComponent(endStr)}` : `?end_time=${encodeURIComponent(endStr)}`;
        }

        fetch(url, {
          method: 'GET',
          headers: getRequestHeaders(),
          credentials: 'include',
        })
          .then((res) => {
            if (res.status !== 200) return null;
            return res.json();
          })
          .then((data) => {
            if (data?.success && data.count !== undefined && data.count !== null) {
              count += data.count;
            }
          })
          .catch(() => {});
      }

      setTimeout(() => {
        setTotalCount(count);
      }, maxWorkflows * 300);
    },
    [startTime, endTime, buildApiUrl, getRequestHeaders]
  );

  const submitSearch = useCallback(
    (
      wfId: string,
      stat: string,
      start: Dayjs | null,
      end: Dayjs | null,
      cursor: string,
      limit: number,
      suborg: boolean
    ) => {
      handleWorkflowUsageCount(workflows);
      setSearchLoading(true);

      const fetchData = {
        workflow_id: wfId,
        cursor: cursor,
        limit: limit,
        status: stat.toUpperCase(),
        start_time: start ? start.toDate().toISOString() : '',
        end_time: end ? end.toDate().toISOString() : '',
        ignore_org: ignoreOrg,
        suborg_runs: suborg,
      };

      fetch(buildApiUrl('/api/v1/workflows/search'), {
        method: 'POST',
        headers: getRequestHeaders(),
        credentials: 'include',
        body: JSON.stringify(fetchData),
      })
        .then((res) => res.json())
        .then((data) => {
          setSearchLoading(false);
          if (data?.success) {
            if (data.runs && Array.isArray(data.runs) && data.runs.length > 0) {
              for (const run of data.runs) {
                run.id = run.execution_id;

                const startTs = new Date(run.started_at * 1000);
                run.startTimestamp = !isNaN(startTs.getTime())
                  ? startTs.toISOString().slice(0, 19).replace('T', ' ')
                  : '';

                if (run.completed_at && run.completed_at !== 0) {
                  const endTs = new Date(run.completed_at * 1000);
                  run.endTimestamp = !isNaN(endTs.getTime())
                    ? endTs.toISOString().slice(0, 19).replace('T', ' ')
                    : '';
                } else {
                  run.endTimestamp = '';
                }

                if (
                  run.workflow_id === run.execution_id &&
                  run.type === 'AGENT'
                ) {
                  if (!run.workflow) run.workflow = {};
                  run.workflow.name = 'Agent Execution';
                }
              }
              setResultRows(data.runs);
            } else {
              toast('No results found. Keeping old runs');
            }
          } else {
            toast('Failed to search for runs. Please try again.');
          }
        })
        .catch(() => {
          setSearchLoading(false);
          toast('Failed to search for runs. Please try again.');
        });
    },
    [handleWorkflowUsageCount, workflows, ignoreOrg, buildApiUrl, getRequestHeaders]
  );

  const getAvailableWorkflows = useCallback(() => {
    fetch(buildApiUrl('/api/v1/workflows'), {
      method: 'GET',
      headers: getRequestHeaders(),
      credentials: 'include',
    })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const formatted = data.map((item: any) => ({
            id: item.id || '',
            name: item.name || 'Unnamed Workflow',
            image: item.image || '',
            ...item,
          }));
          const list = [{ id: '', name: 'All Workflows' }, ...formatted];
          setWorkflows(list);

          if (workflowId) {
            const found = list.find((w) => w.id === workflowId);
            if (found) setWorkflow(found);
          }
        }
      })
      .catch(() => {});
  }, [buildApiUrl, getRequestHeaders, workflowId]);

  useEffect(() => {
    getAvailableWorkflows();
  }, [getAvailableWorkflows]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams();
    if (workflowId) params.set('workflow_id', workflowId);
    if (status) params.set('status', status);
    if (startTime) params.set('start_time', startTime.toISOString());
    if (endTime) params.set('end_time', endTime.toISOString());
    if (maxExecutionCount) params.set('max_results', String(maxExecutionCount));
    if (suborgWorkflowRuns) params.set('suborg_runs', 'true');

    const qs = params.toString();
    window.history.replaceState(
      null,
      '',
      qs ? `?${qs}` : window.location.pathname
    );
  }, [workflowId, status, startTime, endTime, maxExecutionCount, suborgWorkflowRuns]);

  const forceContinue = useCallback(
    (execution: any) => {
      const wfId = execution?.workflow?.id;
      const execId = execution?.execution_id;
      if (!wfId || !execId) return;

      fetch(buildApiUrl(`/api/v1/workflows/${wfId}/executions/${execId}/rerun`), {
        method: 'POST',
        headers: getRequestHeaders(),
        credentials: 'include',
      })
        .then((res) => res.json())
        .then((data) => {
          if (data?.success) {
            toast(data.reason ? `Successful response: ${data.reason}` : 'Successfully forced continue');
          } else {
            toast(data?.reason ? `Failed to force continue: ${data.reason}` : 'Failed to force continue');
          }
        })
        .catch(() => {
          toast('Failed to force continue');
        });
    },
    [buildApiUrl, getRequestHeaders]
  );

  const abortExecution = useCallback(
    (wfId: string, execId: string) => {
      fetch(buildApiUrl(`/api/v1/workflows/${wfId}/executions/${execId}/abort`), {
        method: 'GET',
        headers: getRequestHeaders(),
        credentials: 'include',
      })
        .then((res) => res.json())
        .catch((err) => {
          toast.error(`Error aborting execution: ${err.toString()}`);
        });
    },
    [buildApiUrl, getRequestHeaders]
  );

  const executeWorkflow = useCallback(
    (execution: any) => {
      const wfId = execution?.workflow?.id;
      if (!wfId) return;

      const bodyData = {
        execution_argument: execution.execution_argument,
        start: execution.start,
        execution_source: 'rerun',
      };

      fetch(
        buildApiUrl(
          `/api/v1/workflows/${wfId}/execute?start=${encodeURIComponent(execution.start || '')}`
        ),
        {
          method: 'POST',
          headers: getRequestHeaders(),
          credentials: 'include',
          body: JSON.stringify(bodyData),
        }
      )
        .then((res) => res.json())
        .catch((err) => {
          toast(`Failed to execute workflow: ${err.toString()}`);
        });
    },
    [buildApiUrl, getRequestHeaders]
  );

  const handleWorkflowSelectionUpdate = useCallback(
    (newVal: any) => {
      if (!newVal || newVal.id === undefined) return;
      setWorkflow(newVal);
      setWorkflowId(newVal.id);
      setSuborgWorkflowRuns(false);
      submitSearch(newVal.id, status, startTime, endTime, rowCursor, maxExecutionCount, false);
    },
    [status, startTime, endTime, rowCursor, maxExecutionCount, submitSearch]
  );

  useEffect(() => {
    setPaginationModel((prev) => ({
      ...prev,
      pageSize: rowsPerPage,
    }));
  }, [rowsPerPage]);

  useEffect(() => {
    if (
      typeof document !== 'undefined' &&
      document.activeElement?.tagName === 'INPUT'
    ) {
      return;
    }
    submitSearch(
      workflowId,
      status,
      startTime,
      endTime,
      rowCursor,
      maxExecutionCount,
      suborgWorkflowRuns
    );
  }, [workflowId, status, startTime, endTime]); // eslint-disable-line react-hooks/exhaustive-deps

  // Client-side text filter across row fields
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filteredRows, setFilteredRows] = useState<any[]>([]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredRows(resultRows);
      return;
    }

    const q = searchQuery.toLowerCase();
    const matches = resultRows.filter((data) => {
      if (data.status?.toLowerCase().includes(q)) return true;
      if (data.workflow?.name?.toLowerCase().includes(q)) return true;
      if (data.execution_argument && typeof data.execution_argument === 'string') {
        if (data.execution_argument.toLowerCase().includes(q)) return true;
      }
      if (data.results && Array.isArray(data.results)) {
        for (const res of data.results) {
          if (res?.result && typeof res.result === 'string') {
            if (res.result.toLowerCase().includes(q)) return true;
          }
        }
      }
      return false;
    });

    setFilteredRows(matches);
  }, [searchQuery, resultRows]);

  // DataGrid Columns definition
  const columns: GridColDef[] = useMemo(
    () => [
      {
        field: 'execution_source',
        headerName: 'Source',
        width: 75,
        renderCell: (params) => {
          let foundSource: React.ReactNode = (
            <PlayArrowIcon
              sx={{ color: 'primary.main', height: imageSize, width: imageSize }}
            />
          );
          let source = params.row.execution_source || 'manual';

          if (source === 'schedule') {
            foundSource = (
              <img
                src={TRIGGER_SCHEDULE_IMG}
                alt="schedule"
                style={{ borderRadius: 4, height: imageSize, width: imageSize }}
              />
            );
          } else if (source === 'webhook') {
            foundSource = (
              <img
                src={TRIGGER_WEBHOOK_IMG}
                alt="webhook"
                style={{ borderRadius: 4, height: imageSize, width: imageSize }}
              />
            );
          } else if (source === 'subflow' || source.length === 36) {
            foundSource = (
              <img
                src={TRIGGER_SUBFLOW_IMG}
                alt="subflow"
                style={{ borderRadius: 4, height: imageSize, width: imageSize }}
              />
            );
            source = 'subflow';
          } else if (source === 'rerun') {
            foundSource = (
              <ReplayIcon
                sx={{ color: 'secondary.main', height: imageSize, width: imageSize }}
              />
            );
            source = 'rerun of a previous run';
          } else if (source === 'form') {
            foundSource = (
              <EditNoteIcon
                sx={{ color: 'secondary.main', height: imageSize, width: imageSize }}
              />
            );
          } else if (
            source === 'single_action' ||
            source === 'single_api' ||
            source === 'direct_api'
          ) {
            foundSource = (
              <SendIcon color="secondary" sx={{ height: imageSize - 5 }} />
            );
            source = 'Single API call';
          } else if (params.row.type === 'AGENT') {
            foundSource = (
              <img
                src={singulAgentIcon}
                alt="agent"
                style={{ borderRadius: 4, height: imageSize, width: imageSize }}
              />
            );
          }

          const orgImage =
            params.row.org?.image || userdata?.active_org?.image || '';

          return (
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
              {userdata?.active_org?.creator_org?.length === 0 &&
              suborgWorkflowRuns &&
              orgImage ? (
                <img
                  src={orgImage}
                  alt={source}
                  style={{
                    borderRadius: 4,
                    height: imageSize,
                    width: imageSize,
                    marginRight: 4,
                  }}
                />
              ) : null}
              <Tooltip title={source} placement="top">
                <span>{foundSource}</span>
              </Tooltip>
            </span>
          );
        },
      },
      {
        field: 'status',
        headerName: 'Status',
        width: 110,
        renderCell: (params) => (
          <span
            style={{ cursor: 'pointer', fontWeight: 500 }}
            onClick={() => setStatus(params.row.status)}
          >
            {params.row.status}
          </span>
        ),
      },
      {
        field: 'workflow.name',
        headerName: 'Workflow Name',
        width: 250,
        renderCell: (params) => (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            onClick={() => {
              const wfId = params.row.workflow?.id;
              if (wfId) {
                setWorkflowId(wfId);
                const found = workflows.find((w) => w.id === wfId);
                if (found) setWorkflow(found);
              }
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {params.row.workflow?.name || 'Unnamed Workflow'}
            </span>
            {params.row.org?.id?.length > 0 && (
              <Tooltip
                title={
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {params.row.org.image && (
                      <img
                        src={params.row.org.image}
                        alt={params.row.org.name}
                        style={{ height: 24, width: 24, borderRadius: 12 }}
                      />
                    )}
                    <Typography variant="body2" sx={{ ml: 1 }}>
                      {params.row.org.name}
                    </Typography>
                  </div>
                }
                placement="top"
                arrow
              >
                <AccountTreeIcon
                  sx={{ color: '#B0B0B0', height: 20, width: 20, ml: 1 }}
                />
              </Tooltip>
            )}
          </div>
        ),
      },
      {
        field: 'workflow results',
        headerName: 'Results',
        width: 80,
        renderCell: (params) => {
          let count = 0;
          if (params.row.results && Array.isArray(params.row.results)) {
            count = params.row.results.length;
          }
          return <span>{count}</span>;
        },
      },
      {
        field: 'startTimestamp',
        headerName: 'Start time (UTC)',
        width: 160,
        renderCell: (params) => (
          <Tooltip title={params.row.startTimestamp || ''} placement="top">
            <span>{params.row.startTimestamp}</span>
          </Tooltip>
        ),
      },
      {
        field: 'endTimestamp',
        headerName: 'End time (UTC)',
        width: 160,
      },
      {
        field: 'id',
        headerName: 'Explore',
        width: 170,
        renderCell: (params) => {
          const parsedResult = params.row.result || '';
          let errorReason = '';
          let hasError =
            typeof parsedResult === 'string' &&
            parsedResult.includes('{%') &&
            parsedResult.includes('%}');

          if (hasError) errorReason = 'Liquid parsing error';

          if (
            typeof parsedResult === 'string' &&
            parsedResult.includes('"success": false')
          ) {
            errorReason = 'success: false in last result';
            hasError = true;
          }

          if (!hasError && params.row.notifications_created) {
            hasError = true;
            errorReason = `Generated notifications: ${params.row.notifications_created}`;
          }

          const wfUrl = params.row.workflow?.id
            ? getShuffleCoreWorkflowUrl(params.row.workflow.id, {
                execution_id: params.row.id,
              })
            : '';

          return (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <Tooltip
                arrow
                placement="left"
                title={
                  params.row.type === 'AGENT' ? (
                    'See agent result'
                  ) : (
                    <Typography
                      variant="body2"
                      sx={{ whiteSpace: 'pre-line', p: 1 }}
                    >
                      Workflow result: {errorReason}
                      {parsedResult ? `\n\n${parsedResult}` : ''}
                    </Typography>
                  )
                }
              >
                <span
                  style={{
                    backgroundColor: hasError
                      ? 'rgba(244,0,0,0.45)'
                      : 'inherit',
                    display: 'flex',
                    borderRadius: 4,
                  }}
                >
                  {params.row.type === 'AGENT' ? (
                    <Link
                      href={`/agents?execution_id=${params.row.execution_id}&authorization=${params.row.authorization || ''}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{ display: 'inline-flex', alignItems: 'center', p: 0.5 }}
                    >
                      <OpenInNewIcon fontSize="small" />
                    </Link>
                  ) : (
                    <Link
                      href={wfUrl || `/workflows/${params.row.workflow?.id}?execution_id=${params.row.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{ display: 'inline-flex', alignItems: 'center', p: 0.5 }}
                    >
                      <OpenInNewIcon fontSize="small" />
                    </Link>
                  )}
                </span>
              </Tooltip>

              <Tooltip arrow title="Explore execution in drawer">
                <IconButton
                  size="small"
                  sx={{ ml: 0.5 }}
                  onClick={() => {
                    setSelectedExecutionId(params.row.execution_id || params.row.id);
                    setSelectedExecutionAuth(params.row.authorization || '');
                    setExplorerDrawerOpen(true);
                  }}
                >
                  <VisibilityIcon fontSize="small" />
                </IconButton>
              </Tooltip>

              <Tooltip
                arrow
                title={`Force continue workflow. Only for workflows in EXECUTING state. Contact ${supportEmail} if issues persist.`}
              >
                <span>
                  <IconButton
                    size="small"
                    sx={{ ml: 0.5 }}
                    disabled={params.row.status !== 'EXECUTING'}
                    onClick={() => forceContinue(params.row)}
                  >
                    <PlayArrowIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>

              <Tooltip arrow title="Explore workflow run logs">
                <span>
                  <IconButton
                    size="small"
                    sx={{ ml: 0.5 }}
                    onClick={() => {
                      window.open(
                        buildApiUrl(`/api/v1/workflows/search/${params.row.id}`),
                        '_blank'
                      );
                    }}
                  >
                    <InsightsIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </div>
          );
        },
      },
    ],
    [
      imageSize,
      userdata,
      suborgWorkflowRuns,
      workflows,
      supportEmail,
      forceContinue,
      buildApiUrl,
    ]
  );

  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: 1200,
        margin: '0 auto',
        p: { xs: 2, md: 3 },
      }}
    >
      <Box sx={{ pt: 2, pb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
            Workflow Run Debugger {totalCount !== 0 ? ` (~${totalCount})` : ''}
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {selectedWorkflowExecutions.length > 0 && (
              <ButtonGroup size="small">
                <Tooltip title="Reruns all selected workflows as new executions">
                  <Button
                    variant="outlined"
                    color="secondary"
                    onClick={() => {
                      for (const selected of selectedWorkflowExecutions) {
                        executeWorkflow(selected);
                      }
                      toast(`Reran ${selectedWorkflowExecutions.length} workflow run(s)`);
                      setSelectedWorkflowExecutions([]);
                    }}
                  >
                    Rerun Selected ({selectedWorkflowExecutions.length})
                  </Button>
                </Tooltip>
                <Tooltip title="Aborts all selected workflows in EXECUTING state">
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={() => {
                      let aborted = 0;
                      for (const selected of selectedWorkflowExecutions) {
                        if (selected.status === 'EXECUTING') {
                          abortExecution(selected.workflow?.id, selected.execution_id);
                          aborted += 1;
                        }
                      }
                      if (aborted === 0) {
                        toast('No workflows were aborted as they are not executing.');
                      } else {
                        toast(`Aborted ${aborted} workflow(s).`);
                        submitSearch(
                          workflowId,
                          status,
                          startTime,
                          endTime,
                          rowCursor,
                          maxExecutionCount,
                          suborgWorkflowRuns
                        );
                        setSelectedWorkflowExecutions([]);
                      }
                    }}
                  >
                    Abort Selected ({selectedWorkflowExecutions.length})
                  </Button>
                </Tooltip>
              </ButtonGroup>
            )}

            {userdata?.support === true && (
              <Button
                size="small"
                variant={ignoreOrg ? 'contained' : 'outlined'}
                color="secondary"
                onClick={() => setIgnoreOrg(!ignoreOrg)}
              >
                {ignoreOrg ? 'Ignoring Org' : 'Ignore Org (Support Only)'}
              </Button>
            )}
          </Box>
        </Box>

        {/* Search & Filter Toolbar */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 2,
            mt: 2,
            mb: 1,
          }}
        >
          <TextField
            size="small"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by Workflow Name, Status, Execution Argument, Results"
            sx={{ flex: 1, minWidth: 280 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: searchQuery ? (
                <InputAdornment position="end">
                  <ClearIcon
                    fontSize="small"
                    sx={{ cursor: 'pointer' }}
                    onClick={() => setSearchQuery('')}
                  />
                </InputAdornment>
              ) : null,
            }}
          />

          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel id="max-execution-count-label">Max Results</InputLabel>
            <Select
              labelId="max-execution-count-label"
              value={maxExecutionCount}
              label="Max Results"
              onChange={(e) => {
                const val = Number(e.target.value);
                setMaxExecutionCount(val);
                submitSearch(
                  workflowId,
                  status,
                  startTime,
                  endTime,
                  rowCursor,
                  val,
                  suborgWorkflowRuns
                );
              }}
            >
              <MenuItem value={10}>10</MenuItem>
              <MenuItem value={25}>25</MenuItem>
              <MenuItem value={50}>50</MenuItem>
              <MenuItem value={100}>100</MenuItem>
              <MenuItem value={200}>200</MenuItem>
              <MenuItem value={500}>500</MenuItem>
            </Select>
          </FormControl>

          {userdata?.active_org?.creator_org?.length === 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Switch
                size="small"
                checked={suborgWorkflowRuns}
                onChange={() => {
                  const nextSuborg = !suborgWorkflowRuns;
                  setSuborgWorkflowRuns(nextSuborg);
                  setWorkflowId('');
                  setWorkflow({ id: '', name: 'All Workflows' });
                  submitSearch(
                    '',
                    status,
                    startTime,
                    endTime,
                    rowCursor,
                    maxExecutionCount,
                    nextSuborg
                  );
                }}
                color="secondary"
              />
              <Typography variant="body2">Suborg runs</Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* Main Parameters Form */}
      <Box
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          submitSearch(
            workflowId,
            status,
            startTime,
            endTime,
            rowCursor,
            maxExecutionCount,
            suborgWorkflowRuns
          );
        }}
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 1.5,
          mb: 2,
        }}
      >
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel id="status-filter-label">Status</InputLabel>
          <Select
            labelId="status-filter-label"
            value={status}
            label="Status"
            onChange={(e) => setStatus(e.target.value)}
          >
            <MenuItem value="">All Statuses</MenuItem>
            <MenuItem value="FINISHED">FINISHED</MenuItem>
            <MenuItem value="EXECUTING">EXECUTING</MenuItem>
            <MenuItem value="WAITING">WAITING</MenuItem>
            <MenuItem value="ABORTED">ABORTED</MenuItem>
          </Select>
        </FormControl>

        <Autocomplete
          size="small"
          id="workflow-search-autocomplete"
          value={workflow}
          open={openWorkflowMenu}
          onOpen={() => setOpenWorkflowMenu(true)}
          onClose={() => setOpenWorkflowMenu(false)}
          getOptionLabel={(option) => {
            if (!option?.name) return 'No Workflow Selected';
            return (
              option.name.charAt(0).toUpperCase() + option.name.substring(1)
            ).replace(/_/g, ' ');
          }}
          options={[
            { name: 'Agent Runs', id: 'AGENT' },
            { name: 'Sensor Actions', id: 'SENSOR_ACTION' },
            ...workflows,
          ]}
          sx={{ width: { xs: '100%', sm: 220, md: 240 }, minWidth: 180 }}
          onChange={(_, newValue: any) => {
            if (typeof newValue === 'string' && newValue.startsWith('$')) {
              handleWorkflowSelectionUpdate({
                id: newValue,
                name: newValue,
              });
            } else {
              handleWorkflowSelectionUpdate(newValue);
            }
          }}
          renderInput={(params) => (
            <TextField {...params} label="Workflow" variant="outlined" />
          )}
        />

        <DateTimePicker
          slotProps={{
            textField: {
              size: 'small',
              sx: { width: { xs: '100%', sm: 215, md: 225 }, minWidth: 200 },
            },
          }}
          ampm={false}
          label="Search from"
          format="YYYY-MM-DD HH:mm:ss"
          value={startTime}
          onChange={(date) => setStartTime(date)}
        />
        <DateTimePicker
          slotProps={{
            textField: {
              size: 'small',
              sx: { width: { xs: '100%', sm: 215, md: 225 }, minWidth: 200 },
            },
          }}
          ampm={false}
          label="Search until"
          format="YYYY-MM-DD HH:mm:ss"
          value={endTime}
          onChange={(date) => setEndTime(date)}
        />

        <Tooltip title="Clear all filters and search parameters">
          <IconButton
            size="small"
            onClick={() => {
              setWorkflowId('');
              setWorkflow({ id: '', name: 'All Workflows' });
              setStatus('');
              setStartTime(null);
              setEndTime(null);
              setSearchQuery('');
              setSuborgWorkflowRuns(false);
              setMaxExecutionCount(50);
              submitSearch('', '', null, null, rowCursor, 50, false);
            }}
            sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 0.8 }}
          >
            <FilterAltOffIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Button
          variant="contained"
          color="primary"
          onClick={() => {
            submitSearch(
              workflowId,
              status,
              startTime,
              endTime,
              rowCursor,
              maxExecutionCount,
              suborgWorkflowRuns
            );
          }}
          disabled={searchLoading}
          sx={{ minWidth: 90, height: 40 }}
        >
          {searchLoading ? <CircularProgress size={20} color="inherit" /> : 'Search'}
        </Button>
      </Box>

      {/* Runs DataGrid */}
      <Box sx={{ height: 680, width: '100%' }}>
        <DataGrid
          rows={filteredRows}
          columns={columns}
          paginationModel={paginationModel}
          pageSizeOptions={[10, 20, 50, 75, 100]}
          checkboxSelection
          disableRowSelectionOnClick
          onPaginationModelChange={(newModel) => {
            setPaginationModel(newModel);
            setRowsPerPage(newModel.pageSize);
          }}
          onRowSelectionModelChange={(newSelection: any) => {
            const selectedIds = new Set(
              Array.isArray(newSelection)
                ? newSelection
                : Array.from(newSelection || [])
            );
            const selectedRows = resultRows.filter((row) =>
              selectedIds.has(row.id)
            );
            setSelectedWorkflowExecutions(selectedRows);
          }}
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            '& .MuiDataGrid-columnHeaders': {
              backgroundColor: 'background.paper',
            },
          }}
        />
      </Box>

      {/* Embedded Execution Explorer Drawer */}
      <WorkflowRunExplorerDrawer
        open={explorerDrawerOpen}
        executionId={selectedExecutionId}
        authorization={selectedExecutionAuth}
        onClose={() => {
          setExplorerDrawerOpen(false);
          setSelectedExecutionId('');
          setSelectedExecutionAuth('');
        }}
        theme={themeMode}
        globalUrl={globalUrl}
        userdata={userdata}
      />
    </Box>
  );
};

export default WorkflowRunDebugger;
