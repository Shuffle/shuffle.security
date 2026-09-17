import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  CircularProgress,
  Button,
} from '@mui/material';
import {
  Download,
  Maximize2,
  X,
  FileText,
  FileArchive,
  FileCode,
  File,
  AlertCircle,
} from 'lucide-react';
import {
  resolveFileUrl,
  downloadFileAttachment,
  formatFileSize,
} from '@/services/files';
import type { FileAttachment } from '@/config/ocsfIncidentSchema';

const IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'svg',
  'bmp',
  'ico',
  'avif',
]);

const CODE_EXTENSIONS = new Set([
  'json',
  'js',
  'ts',
  'tsx',
  'jsx',
  'py',
  'sh',
  'yml',
  'yaml',
  'xml',
  'html',
  'css',
]);

const ARCHIVE_EXTENSIONS = new Set(['zip', 'tar', 'gz', 'tgz', '7z', 'rar', 'pcap', 'pcapng']);

export const isImageAttachment = (filename?: string): boolean => {
  if (!filename) return false;
  const ext = filename.split('.').pop()?.toLowerCase();
  return Boolean(ext && IMAGE_EXTENSIONS.has(ext));
};

export const normalizeAttachment = (raw: unknown): FileAttachment | null => {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const filename = raw.split('/').pop() || raw;
    return {
      id: raw,
      filename,
      filesize: 0,
    };
  }
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const id = String(obj.id || obj.url || obj.src || obj.key || '');
    const filename = String(
      obj.filename ||
        obj.name ||
        (typeof obj.url === 'string' ? obj.url.split('/').pop() : '') ||
        'attachment',
    );
    const filesize = Number(obj.filesize || obj.size || 0);
    const uploadedAt = obj.uploadedAt ? Number(obj.uploadedAt) : undefined;
    return {
      id: id || filename,
      filename,
      filesize,
      uploadedAt,
    };
  }
  return null;
};

const getAttachmentFileIcon = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (CODE_EXTENSIONS.has(ext)) {
    return <FileCode size={14} />;
  }
  if (ARCHIVE_EXTENSIONS.has(ext)) {
    return <FileArchive size={14} />;
  }
  if (['txt', 'log', 'pdf', 'md', 'doc', 'docx'].includes(ext)) {
    return <FileText size={14} />;
  }
  return <File size={14} />;
};

interface ImageAttachmentViewProps {
  attachment: FileAttachment;
}

const ImageAttachmentView: React.FC<ImageAttachmentViewProps> = ({ attachment }) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);

    resolveFileUrl(attachment.id)
      .then((url) => {
        if (!active) return;
        if (url) {
          setBlobUrl(url);
          setLoading(false);
        } else {
          setError(true);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!active) return;
        console.error('Failed to resolve image attachment:', err);
        setError(true);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [attachment.id]);

  const handleDownload = async (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadFileAttachment(attachment.id, attachment.filename);
    } finally {
      setDownloading(false);
    }
  };

  if (error) {
    return (
      <Box
        onClick={handleDownload}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 1,
          px: 1,
          py: 0.75,
          borderRadius: 1.5,
          border: '1px solid hsl(var(--border))',
          bgcolor: 'hsl(var(--muted) / 0.3)',
          cursor: 'pointer',
          maxWidth: '100%',
          '&:hover': {
            bgcolor: 'hsl(var(--muted) / 0.6)',
            borderColor: 'hsl(var(--primary) / 0.5)',
          },
        }}
      >
        <AlertCircle size={14} color="var(--destructive, #ef4444)" />
        <Typography
          variant="caption"
          noWrap
          sx={{
            fontSize: '0.75rem',
            color: 'text.secondary',
            maxWidth: 200,
          }}
        >
          {attachment.filename}
        </Typography>
        <Tooltip title={`Download ${attachment.filename}`}>
          <IconButton size="small" onClick={handleDownload} sx={{ p: 0.25 }}>
            <Download size={13} />
          </IconButton>
        </Tooltip>
      </Box>
    );
  }

  return (
    <>
      <Box
        sx={{
          display: 'inline-flex',
          flexDirection: 'column',
          borderRadius: 1.5,
          overflow: 'hidden',
          border: '1px solid hsl(var(--border))',
          bgcolor: 'hsl(var(--muted) / 0.3)',
          maxWidth: { xs: '100%', sm: 360 },
          width: 'fit-content',
          position: 'relative',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          '&:hover': {
            borderColor: 'hsl(var(--primary) / 0.5)',
            boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
          },
          '&:hover .image-hover-actions': {
            opacity: 1,
            pointerEvents: 'auto',
          },
        }}
      >
        {/* Image Preview Container */}
        <Box
          onClick={() => {
            if (!loading && blobUrl) setLightboxOpen(true);
          }}
          sx={{
            position: 'relative',
            cursor: loading ? 'default' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 120,
            maxHeight: 220,
            bgcolor: 'rgba(0, 0, 0, 0.25)',
            overflow: 'hidden',
          }}
        >
          {loading ? (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                p: 2,
                color: 'text.secondary',
              }}
            >
              <CircularProgress size={16} sx={{ color: 'text.secondary' }} />
              <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>
                Loading {attachment.filename}...
              </Typography>
            </Box>
          ) : (
            <Box
              component="img"
              src={blobUrl || undefined}
              alt={attachment.filename}
              sx={{
                maxWidth: '100%',
                maxHeight: 220,
                width: 'auto',
                height: 'auto',
                objectFit: 'contain',
                display: 'block',
              }}
            />
          )}

          {/* Quick action buttons on hover */}
          {!loading && (
            <Box
              className="image-hover-actions"
              sx={{
                position: 'absolute',
                top: 6,
                right: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                opacity: 0,
                pointerEvents: 'none',
                transition: 'opacity 0.15s ease',
                bgcolor: 'rgba(0, 0, 0, 0.65)',
                backdropFilter: 'blur(4px)',
                borderRadius: 1,
                p: 0.25,
              }}
            >
              <Tooltip title="View full size">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightboxOpen(true);
                  }}
                  sx={{
                    p: 0.5,
                    color: 'white',
                    '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.15)' },
                  }}
                >
                  <Maximize2 size={13} />
                </IconButton>
              </Tooltip>
              <Tooltip title={`Download ${attachment.filename}`}>
                <IconButton
                  size="small"
                  onClick={handleDownload}
                  disabled={downloading}
                  sx={{
                    p: 0.5,
                    color: 'white',
                    '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.15)' },
                  }}
                >
                  {downloading ? (
                    <CircularProgress size={13} sx={{ color: 'white' }} />
                  ) : (
                    <Download size={13} />
                  )}
                </IconButton>
              </Tooltip>
            </Box>
          )}
        </Box>

        {/* Footer info bar */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            px: 1,
            py: 0.5,
            borderTop: '1px solid hsl(var(--border) / 0.5)',
            bgcolor: 'hsl(var(--muted) / 0.4)',
          }}
        >
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              variant="caption"
              noWrap
              sx={{
                fontSize: '0.7rem',
                fontWeight: 500,
                color: 'text.primary',
                display: 'block',
              }}
              title={attachment.filename}
            >
              {attachment.filename}
            </Typography>
            {attachment.filesize > 0 && (
              <Typography
                variant="caption"
                sx={{
                  fontSize: '0.625rem',
                  color: 'text.secondary',
                  display: 'block',
                  lineHeight: 1.1,
                }}
              >
                {formatFileSize(attachment.filesize)}
              </Typography>
            )}
          </Box>
          <Tooltip title={`Download ${attachment.filename}`}>
            <IconButton
              size="small"
              onClick={handleDownload}
              disabled={downloading}
              sx={{
                p: 0.5,
                borderRadius: 1,
                border: '1px solid hsl(var(--border))',
                bgcolor: 'hsl(var(--background))',
                '&:hover': { bgcolor: 'hsl(var(--muted))' },
              }}
            >
              {downloading ? (
                <CircularProgress size={12} sx={{ color: 'text.secondary' }} />
              ) : (
                <Download size={12} />
              )}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Lightbox Preview Modal */}
      <Dialog
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: 'hsl(var(--background))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 2,
            backgroundImage: 'none',
          },
        }}
      >
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            py: 1,
            px: 2,
            borderBottom: '1px solid hsl(var(--border))',
          }}
        >
          <Box sx={{ minWidth: 0, mr: 2 }}>
            <Typography
              variant="subtitle2"
              noWrap
              sx={{ fontWeight: 600, fontSize: '0.875rem' }}
            >
              {attachment.filename}
            </Typography>
            {attachment.filesize > 0 && (
              <Typography
                variant="caption"
                sx={{ color: 'text.secondary', fontSize: '0.7rem' }}
              >
                {formatFileSize(attachment.filesize)}
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<Download size={14} />}
              onClick={() => handleDownload()}
              disabled={downloading}
              sx={{
                height: 28,
                fontSize: '0.75rem',
                textTransform: 'none',
                borderColor: 'hsl(var(--border))',
                color: 'text.primary',
              }}
            >
              Download
            </Button>
            <IconButton
              size="small"
              onClick={() => setLightboxOpen(false)}
              sx={{
                p: 0.75,
                borderRadius: 1.5,
                border: '1px solid hsl(var(--border))',
              }}
            >
              <X size={16} />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent
          sx={{
            p: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'rgba(0, 0, 0, 0.4)',
            minHeight: 280,
            overflow: 'auto',
          }}
        >
          {blobUrl && (
            <Box
              component="img"
              src={blobUrl}
              alt={attachment.filename}
              sx={{
                maxWidth: '100%',
                maxHeight: '78vh',
                objectFit: 'contain',
                borderRadius: 1,
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

interface FileAttachmentChipProps {
  attachment: FileAttachment;
}

const FileAttachmentChip: React.FC<FileAttachmentChipProps> = ({ attachment }) => {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadFileAttachment(attachment.id, attachment.filename);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Tooltip
      title={
        attachment.filesize > 0
          ? `Download ${attachment.filename} (${formatFileSize(attachment.filesize)})`
          : `Download ${attachment.filename}`
      }
    >
      <Box
        onClick={handleDownload}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.75,
          px: 1,
          py: 0.4,
          borderRadius: 1.25,
          border: '1px solid hsl(var(--border))',
          bgcolor: 'hsl(var(--muted) / 0.4)',
          color: 'text.primary',
          cursor: 'pointer',
          maxWidth: '100%',
          transition: 'all 0.15s ease',
          '&:hover': {
            bgcolor: 'hsl(var(--muted) / 0.8)',
            borderColor: 'hsl(var(--primary) / 0.5)',
          },
        }}
      >
        <Box sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center' }}>
          {getAttachmentFileIcon(attachment.filename)}
        </Box>
        <Typography
          variant="caption"
          noWrap
          sx={{
            fontSize: '0.72rem',
            fontWeight: 500,
            maxWidth: { xs: 160, sm: 220 },
          }}
        >
          {attachment.filename}
        </Typography>
        {attachment.filesize > 0 && (
          <Typography
            variant="caption"
            sx={{
              fontSize: '0.625rem',
              color: 'text.secondary',
              flexShrink: 0,
            }}
          >
            {formatFileSize(attachment.filesize)}
          </Typography>
        )}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            color: 'text.secondary',
            ml: 0.25,
            flexShrink: 0,
          }}
        >
          {downloading ? (
            <CircularProgress size={12} sx={{ color: 'text.secondary' }} />
          ) : (
            <Download size={12} />
          )}
        </Box>
      </Box>
    </Tooltip>
  );
};

export interface CommentAttachmentsProps {
  attachments: unknown[];
}

export const CommentAttachments: React.FC<CommentAttachmentsProps> = ({
  attachments,
}) => {
  if (!attachments || attachments.length === 0) return null;

  const normalized = attachments
    .map(normalizeAttachment)
    .filter((a): a is FileAttachment => Boolean(a && a.filename));

  if (normalized.length === 0) return null;

  const images = normalized.filter((a) => isImageAttachment(a.filename));
  const files = normalized.filter((a) => !isImageAttachment(a.filename));

  return (
    <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
      {images.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {images.map((att, idx) => (
            <ImageAttachmentView
              key={att.id || `${att.filename}-${idx}`}
              attachment={att}
            />
          ))}
        </Box>
      )}

      {files.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
          {files.map((att, idx) => (
            <FileAttachmentChip
              key={att.id || `${att.filename}-${idx}`}
              attachment={att}
            />
          ))}
        </Box>
      )}
    </Box>
  );
};
