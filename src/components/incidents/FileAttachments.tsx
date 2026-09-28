import { Paperclip as AttachFileIcon, Trash2 as DeleteIcon, Download as DownloadIcon, File as InsertDriveFileIcon, Image as ImageIcon, FileText as PictureAsPdfIcon, X as CloseIcon } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  IconButton,
  CircularProgress,
  Tooltip,
  Chip,
  Dialog,
} from '@mui/material';
import { 
  ShuffleFile, 
  createAndUploadFile, 
  deleteFile, 
  getFileDownloadUrl, 
  formatFileSize,
  resolveFileUrl,
  downloadFileAttachment,
} from '@/services/files';
import { getAuthHeader } from '@/Shuffle-MCPs/api';
import { toast } from '@/lib/toast';

interface FileAttachment {
  id: string;
  filename: string;
  filesize: number;
  uploadedAt?: number;
}

interface FileAttachmentsProps {
  attachments: FileAttachment[];
  onChange: (attachments: FileAttachment[]) => void;
  namespace?: string;
  labels?: string[];
  compact?: boolean;
  hideAddButton?: boolean;
}

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];

const isImageFile = (filename: string): boolean => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext || '');
};

const getFileIcon = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (IMAGE_EXTENSIONS.includes(ext || '')) {
    return <ImageIcon size={16} />;
  }
  if (ext === 'pdf') {
    return <PictureAsPdfIcon size={16} />;
  }
  return <InsertDriveFileIcon size={16} />;
};

// Hook to load image blob URL with auth
const useImagePreview = (fileId: string, isImage: boolean) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage || !fileId) return;
    let active = true;

    resolveFileUrl(fileId)
      .then((url) => {
        if (active && url) {
          setBlobUrl(url);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [fileId, isImage]);

  return blobUrl;
};

// Image thumbnail component with preview
const ImageThumbnail = ({ 
  attachment, 
  onDelete, 
  onDownload,
  deleting = false,
  size = 64,
}: { 
  attachment: FileAttachment; 
  onDelete: () => void; 
  onDownload: () => void;
  deleting?: boolean;
  size?: number;
}) => {
  const blobUrl = useImagePreview(attachment.id, true);
  const [showPreview, setShowPreview] = useState(false);

  return (
    <>
      <Box
        sx={{
          position: 'relative',
          width: size,
          height: size,
          borderRadius: 1,
          overflow: 'hidden',
          bgcolor: 'action.hover',
          border: '1px solid',
          borderColor: 'divider',
          cursor: 'pointer',
          flexShrink: 0,
          '&:hover .overlay': { opacity: 1 },
        }}
        onClick={() => blobUrl && setShowPreview(true)}
      >
        {blobUrl ? (
          <img 
            src={blobUrl} 
            alt={attachment.filename}
            style={{ 
              width: '100%', 
              height: '100%', 
              objectFit: 'cover',
            }}
          />
        ) : (
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            height: '100%',
          }}>
            <CircularProgress size={16} sx={{ color: 'text.secondary' }} />
          </Box>
        )}
        
        {/* Hover overlay */}
        <Box 
          className="overlay"
          sx={{
            position: 'absolute',
            inset: 0,
            bgcolor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 0.5,
            opacity: 0,
            transition: 'opacity 0.2s ease',
          }}
        >
          <IconButton 
            size="small" 
            onClick={(e) => { e.stopPropagation(); onDownload(); }}
            sx={{ color: 'white', p: 0.5 }}
          >
            <DownloadIcon size={14} />
          </IconButton>
          <IconButton 
            size="small" 
            onClick={(e) => { e.stopPropagation(); if (!deleting) onDelete(); }}
            disabled={deleting}
            sx={{ color: 'error.main', p: 0.5 }}
          >
            {deleting ? <CircularProgress size={12} sx={{ color: 'error.main' }} /> : <DeleteIcon size={14} />}
          </IconButton>
        </Box>
      </Box>

      {/* Full preview dialog */}
      <Dialog 
        open={showPreview} 
        onClose={() => setShowPreview(false)}
        maxWidth="lg"
        PaperProps={{
          sx: {
            bgcolor: 'transparent',
            boxShadow: 'none',
            overflow: 'visible',
          }
        }}
      >
        <Box sx={{ position: 'relative' }}>
          <IconButton
            onClick={() => setShowPreview(false)}
            sx={{
              position: 'absolute',
              top: -40,
              right: 0,
              color: 'white',
              bgcolor: 'rgba(0,0,0,0.5)',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' },
            }}
          >
            <CloseIcon />
          </IconButton>
          {blobUrl && (
            <img 
              src={blobUrl} 
              alt={attachment.filename}
              style={{ 
                maxWidth: '90vw', 
                maxHeight: '80vh', 
                borderRadius: 8,
              }}
            />
          )}
        </Box>
      </Dialog>
    </>
  );
};

export const FileAttachments = ({
  attachments,
  onChange,
  namespace = 'incidents',
  labels = [],
  compact = false,
  hideAddButton = false,
}: FileAttachmentsProps) => {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const newAttachments: FileAttachment[] = [];

    for (const file of Array.from(files)) {
      const result = await createAndUploadFile(file, namespace, labels);
      if (result.success && result.file) {
        newAttachments.push({
          id: result.file.id,
          filename: result.file.filename,
          filesize: result.file.filesize,
          uploadedAt: Date.now(),
        });
        toast.success(`Uploaded ${file.name}`);
      } else {
        toast.error(`Failed to upload ${file.name}: ${result.reason}`);
      }
    }

    if (newAttachments.length > 0) {
      onChange([...attachments, ...newAttachments]);
    }

    setUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const handleDelete = async (attachment: FileAttachment) => {
    if (deletingIds.has(attachment.id)) return;
    const ok = typeof window !== 'undefined'
      ? window.confirm(`Delete "${attachment.filename}"? This cannot be undone.`)
      : true;
    if (!ok) return;

    setDeletingIds(prev => {
      const next = new Set(prev);
      next.add(attachment.id);
      return next;
    });
    const toastId = toast.loading(`Deleting ${attachment.filename}…`);
    try {
      const result = await deleteFile(attachment.id);
      toast.dismiss(toastId as string | number);
      if (result.success) {
        onChange(attachments.filter(a => a.id !== attachment.id));
        toast.success(`Deleted ${attachment.filename}`);
      } else {
        toast.error(`Failed to delete ${attachment.filename}`, {
          description: result.reason || 'The server did not confirm the deletion.',
        });
      }
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev);
        next.delete(attachment.id);
        return next;
      });
    }
  };

  const handleDownload = async (attachment: FileAttachment) => {
    await downloadFileAttachment(attachment.id, attachment.filename);
  };

  const handleOpen = async (attachment: FileAttachment) => {
    try {
      const blobUrl = await resolveFileUrl(attachment.id);
      if (!blobUrl) throw new Error('Open failed');
      window.open(blobUrl, '_blank');
    } catch {
      toast.error('Failed to open file');
    }
  };

  if (compact) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          multiple
        />
        
        {attachments.map((attachment) => {
          const isDeleting = deletingIds.has(attachment.id);
          const isImage = isImageFile(attachment.filename);

          if (isImage) {
            return (
              <ImageThumbnail
                key={attachment.id}
                attachment={attachment}
                onDelete={() => handleDelete(attachment)}
                onDownload={() => handleDownload(attachment)}
                deleting={isDeleting}
                size={48}
              />
            );
          }

          return (
            <Tooltip key={attachment.id} title={`Download ${attachment.filename}`}>
              <Chip
                icon={isDeleting ? <CircularProgress size={12} sx={{ color: 'text.secondary' }} /> : getFileIcon(attachment.filename)}
                label={attachment.filename}
                size="small"
                onDelete={isDeleting ? undefined : () => handleDelete(attachment)}
                onClick={() => handleDownload(attachment)}
                disabled={isDeleting}
                sx={{
                  bgcolor: 'hsl(var(--muted) / 0.5)',
                  '&:hover': { bgcolor: 'hsl(var(--muted) / 0.8)' },
                  '& .MuiChip-icon': { color: 'text.secondary' },
                  opacity: isDeleting ? 0.6 : 1,
                  cursor: 'pointer',
                }}
              />
            </Tooltip>
          );
        })}
        
        {!hideAddButton && (
          <Tooltip title="Attach file">
            <IconButton
              size="small"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              sx={{
                color: 'text.secondary',
                border: '1px dashed hsl(var(--border))',
                borderRadius: 1,
                '&:hover': { borderColor: 'hsl(var(--primary))', color: 'hsl(var(--primary))' },
              }}
            >
              {uploading ? (
                <CircularProgress size={16} sx={{ color: 'text.secondary' }} />
              ) : (
                <AttachFileIcon size={16} />
              )}
            </IconButton>
          </Tooltip>
        )}
      </Box>
    );
  }

  return (
    <Box>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        style={{ display: 'none' }}
        multiple
      />
      
      {/* File list - split into images and other files */}
      {attachments.length > 0 && (
        <Box sx={{ mb: 2 }}>
          {/* Image grid */}
          {attachments.filter(a => isImageFile(a.filename)).length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
              {attachments
                .filter(a => isImageFile(a.filename))
                .map((attachment) => (
                  <ImageThumbnail
                    key={attachment.id}
                    attachment={attachment}
                    deleting={deletingIds.has(attachment.id)}
                    onDelete={() => handleDelete(attachment)}
                    onDownload={() => handleDownload(attachment)}
                  />
                ))}
            </Box>
          )}

          {/* Non-image files */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {attachments
              .filter(a => !isImageFile(a.filename))
              .map((attachment) => {
                const isDeleting = deletingIds.has(attachment.id);
                return (
                <Box
                  key={attachment.id}
                  onClick={() => !isDeleting && handleOpen(attachment)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    p: 1.5,
                    borderRadius: 1,
                    bgcolor: 'hsl(var(--muted) / 0.35)',
                    border: '1px solid hsl(var(--border))',
                    cursor: isDeleting ? 'default' : 'pointer',
                    opacity: isDeleting ? 0.6 : 1,
                    transition: 'opacity 0.2s ease',
                    '&:hover': { bgcolor: isDeleting ? 'hsl(var(--muted) / 0.35)' : 'hsl(var(--muted) / 0.55)' },
                  }}
                >
                  <Box sx={{ color: 'text.secondary' }}>
                    {getFileIcon(attachment.filename)}
                  </Box>
                  
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography 
                      variant="body2" 
                      sx={{ 
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {attachment.filename}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {isDeleting ? 'Deleting…' : formatFileSize(attachment.filesize)}
                    </Typography>
                  </Box>
                  
                  <Tooltip title="Download">
                    <IconButton 
                      size="small" 
                      onClick={(e) => { e.stopPropagation(); handleDownload(attachment); }}
                      disabled={isDeleting}
                      sx={{ color: 'text.secondary' }}
                    >
                      <DownloadIcon size={16} />
                    </IconButton>
                  </Tooltip>
                  
                  <Tooltip title={isDeleting ? 'Deleting…' : 'Delete'}>
                    <span>
                      <IconButton 
                        size="small" 
                        onClick={(e) => { e.stopPropagation(); handleDelete(attachment); }}
                        disabled={isDeleting}
                        sx={{ 
                          color: 'text.disabled',
                          '&:hover': { color: 'hsl(var(--destructive))' },
                        }}
                      >
                        {isDeleting ? <CircularProgress size={14} sx={{ color: 'text.secondary' }} /> : <DeleteIcon size={16} />}
                      </IconButton>
                    </span>
                  </Tooltip>
                </Box>
                );
              })}
          </Box>
        </Box>
      )}
      
      {/* Upload button */}
      <Box
        onClick={() => !uploading && fileInputRef.current?.click()}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1,
          p: 2,
          borderRadius: 1,
          border: '1px dashed hsl(var(--border))',
          cursor: uploading ? 'default' : 'pointer',
          transition: 'all 0.2s ease',
          '&:hover': {
            borderColor: uploading ? 'hsl(var(--border))' : 'hsl(var(--primary))',
            bgcolor: uploading ? 'transparent' : 'hsl(var(--primary) / 0.05)',
          },
        }}
      >
        {uploading ? (
          <CircularProgress size={20} sx={{ color: 'text.secondary' }} />
        ) : (
          <>
            <AttachFileIcon size={20} style={{ color: 'hsl(var(--muted-foreground))' }} />
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Click to attach files
            </Typography>
          </>
        )}
      </Box>
    </Box>
  );
};

export default FileAttachments;
