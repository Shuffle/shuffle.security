import { Box, Button, CircularProgress, IconButton, Typography } from '@mui/material';
import { ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon } from 'lucide-react';

/**
 * Shared list pagination + server multi-loading, used by /incidents and
 * /vulnerabilities. Fix pagination behaviour here so every list gets it.
 */

interface ListPaginationBarProps {
  currentPage: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  /** More records exist on the server beyond what is loaded. */
  hasMore?: boolean;
  isLoading?: boolean;
  /** Loads the next server batch. The bar advances one page after it resolves. */
  onLoadMore?: () => Promise<unknown> | void;
  loadMoreTitle?: string;
}

export const ListPaginationBar = ({
  currentPage,
  totalItems,
  itemsPerPage,
  onPageChange,
  hasMore = false,
  isLoading = false,
  onLoadMore,
  loadMoreTitle = 'Load more',
}: ListPaginationBarProps) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  if (totalItems <= itemsPerPage && !hasMore) return null;

  const atEnd = currentPage >= totalPages;
  const canLoadMoreFromServer = atEnd && hasMore && !!onLoadMore;
  const nextDisabled = atEnd && !canLoadMoreFromServer;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter(page => {
      if (totalPages <= 7) return true;
      if (page === 1 || page === totalPages) return true;
      return Math.abs(page - currentPage) <= 1;
    })
    .reduce<(number | 'ellipsis')[]>((acc, page, idx, arr) => {
      if (idx > 0 && page - (arr[idx - 1] as number) > 1) acc.push('ellipsis');
      acc.push(page);
      return acc;
    }, []);

  return (
    <Box sx={{
      position: 'fixed',
      bottom: 16,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 1,
      py: 1,
      px: 2.5,
      bgcolor: 'hsl(var(--card))',
      border: '1px solid hsl(var(--border))',
      borderRadius: 2,
      boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      zIndex: 20,
    }}>
      <IconButton
        size="small"
        disabled={currentPage === 1}
        onClick={() => onPageChange(currentPage - 1)}
        sx={{
          width: 36, height: 36,
          border: '1px solid hsl(var(--border))',
          borderRadius: 1,
          color: 'hsl(var(--muted-foreground))',
          '&:hover': { borderColor: 'hsl(var(--primary))', color: 'hsl(var(--primary))' },
          '&.Mui-disabled': { opacity: 0.3 },
        }}
      >
        <ChevronLeftIcon size={20} />
      </IconButton>

      {pages.map((item, idx) =>
        item === 'ellipsis' ? (
          <Typography key={`e-${idx}`} sx={{ px: 0.5, color: 'hsl(var(--muted-foreground))' }}>…</Typography>
        ) : (
          <Button
            key={item}
            size="small"
            onClick={() => onPageChange(item)}
            sx={{
              minWidth: 36, height: 36, px: 0,
              borderRadius: 1,
              fontWeight: currentPage === item ? 700 : 400,
              color: currentPage === item ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
              bgcolor: currentPage === item ? 'hsl(var(--primary))' : 'transparent',
              border: currentPage === item ? 'none' : '1px solid hsl(var(--border))',
              '&:hover': {
                bgcolor: currentPage === item ? 'hsl(var(--primary))' : 'hsl(var(--muted) / 0.5)',
              },
            }}
          >
            {item}
          </Button>
        )
      )}

      <IconButton
        size="small"
        disabled={nextDisabled || isLoading}
        onClick={async () => {
          if (canLoadMoreFromServer) {
            await onLoadMore?.();
          }
          onPageChange(currentPage + 1);
        }}
        title={canLoadMoreFromServer ? loadMoreTitle : 'Next page'}
        sx={{
          width: 36, height: 36,
          border: '1px solid hsl(var(--border))',
          borderRadius: 1,
          color: canLoadMoreFromServer ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
          borderColor: canLoadMoreFromServer ? 'hsl(var(--primary))' : 'hsl(var(--border))',
          '&:hover': { borderColor: 'hsl(var(--primary))', color: 'hsl(var(--primary))' },
          '&.Mui-disabled': { opacity: 0.3 },
        }}
      >
        {isLoading && atEnd ? <CircularProgress size={14} /> : <ChevronRightIcon size={20} />}
      </IconButton>
    </Box>
  );
};

interface ListLoadMoreButtonProps {
  onLoadMore: () => Promise<unknown> | void;
  isLoading?: boolean;
  label?: string;
}

export const ListLoadMoreButton = ({ onLoadMore, isLoading = false, label = 'Load More' }: ListLoadMoreButtonProps) => (
  <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
    <Button
      variant="outlined"
      onClick={() => { void onLoadMore(); }}
      disabled={isLoading}
      sx={{
        height: 36, minWidth: 140,
        borderColor: 'hsl(var(--border))',
        '&:hover': { borderColor: 'hsl(var(--primary))' },
      }}
    >
      {isLoading ? <CircularProgress size={20} /> : label}
    </Button>
  </Box>
);
