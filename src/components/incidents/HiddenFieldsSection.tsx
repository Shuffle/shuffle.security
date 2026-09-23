import React, { useState } from "react";
import {
  Box,
  Button,
  Collapse,
  Typography,
} from "@mui/material";
import type { HiddenFieldItem } from "@/utils/hiddenFieldsExtractor";

interface HiddenFieldsSectionProps {
  fields: HiddenFieldItem[];
  highlightSection?: string;
  onAddToCustomFields?: (field: HiddenFieldItem) => void;
}

const isCodeLike = (str: string): boolean => {
  if (!str) return false;
  // Has path separators, sha/hash characters, or command line flags
  return (
    str.includes("/") ||
    str.includes("\\") ||
    str.includes("--") ||
    /^[a-fA-F0-9]{32,64}$/.test(str) ||
    /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(str)
  );
};

export const HiddenFieldsSection: React.FC<HiddenFieldsSectionProps> = ({
  fields,
  highlightSection,
  onAddToCustomFields,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  if (!fields || fields.length === 0) {
    return null;
  }

  const handleCopy = (field: HiddenFieldItem) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(field.displayValue).catch(() => {});
      }
    } catch {}
    setCopiedPath(field.path);
    setTimeout(() => {
      setCopiedPath((current) => (current === field.path ? null : current));
    }, 2000);
  };

  return (
    <Box
      sx={{
        borderRadius: 2,
        border: "1px solid hsl(var(--border))",
        bgcolor: "hsl(var(--card))",
        p: { xs: 2, md: 2.5 },
      }}
    >
      {/* Header Bar */}
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 2,
        }}
      >
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 0.5 }}>
            <Typography
              component="h2"
              sx={{
                fontSize: "1.15rem",
                fontWeight: 700,
                color:
                  highlightSection === "hiddenFields"
                    ? "hsl(var(--primary))"
                    : "inherit",
                transition: "color 0.2s ease",
              }}
            >
              Hidden fields
            </Typography>
            <Box
              sx={{
                px: 1,
                py: 0.25,
                borderRadius: 1,
                fontSize: "0.7rem",
                fontWeight: 600,
                bgcolor: "hsl(var(--muted))",
                color: "hsl(var(--muted-foreground))",
              }}
            >
              {fields.length} unmapped
            </Box>
          </Box>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              fontSize: "0.8rem",
              lineHeight: 1.4,
            }}
          >
            Fields from the original alert payload that are not used in the translation or shown elsewhere.
          </Typography>
        </Box>

        <Button
          size="small"
          variant="outlined"
          onClick={() => setIsExpanded((prev) => !prev)}
          sx={{
            height: 28,
            px: 1.5,
            fontSize: "0.75rem",
            fontWeight: 600,
            textTransform: "none",
            borderColor: "hsl(var(--border))",
            color: "text.primary",
            whiteSpace: "nowrap",
            flexShrink: 0,
            "&:hover": {
              borderColor: "hsl(var(--primary))",
              bgcolor: "hsl(var(--accent) / 0.08)",
            },
          }}
        >
          {isExpanded ? "Hide" : `Show (${fields.length})`}
        </Button>
      </Box>

      {/* Collapsible Content */}
      <Collapse in={isExpanded} timeout="auto" unmountOnExit>
        <Box
          sx={{
            mt: 2.5,
            pt: 2.5,
            borderTop: "1px solid hsl(var(--border) / 0.6)",
            display: "flex",
            flexDirection: "column",
            gap: 1.5,
          }}
        >
          {fields.map((field) => {
            const isCopied = copiedPath === field.path;
            const codeLike =
              field.type === "json" ||
              (field.type === "text" && isCodeLike(field.displayValue));

            return (
              <Box
                key={field.path}
                sx={{
                  borderRadius: 1.5,
                  border: "1px solid hsl(var(--border) / 0.8)",
                  bgcolor: "hsl(var(--background) / 0.5)",
                  p: 1.75,
                  display: "flex",
                  flexDirection: "column",
                  gap: 1,
                }}
              >
                {/* Field Card Header */}
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 1.5,
                    flexWrap: "wrap",
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 1,
                      flexWrap: "wrap",
                    }}
                  >
                    <Typography
                      variant="subtitle2"
                      sx={{
                        fontWeight: 600,
                        fontSize: "0.85rem",
                        color: "hsl(var(--foreground))",
                      }}
                    >
                      {field.label}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        fontFamily: "monospace",
                        color: "text.secondary",
                        fontSize: "0.72rem",
                      }}
                    >
                      {field.path}
                    </Typography>
                    <Box
                      component="span"
                      sx={{
                        px: 0.75,
                        py: 0.15,
                        borderRadius: 0.75,
                        fontSize: "0.65rem",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        bgcolor: "hsl(var(--muted))",
                        color: "hsl(var(--muted-foreground))",
                        letterSpacing: 0.3,
                      }}
                    >
                      {field.type}
                    </Box>
                  </Box>

                  {/* Actions Bar */}
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => handleCopy(field)}
                      sx={{
                        height: 24,
                        px: 1,
                        fontSize: "0.7rem",
                        fontWeight: 500,
                        textTransform: "none",
                        borderColor: "hsl(var(--border))",
                        color: isCopied ? "hsl(var(--primary))" : "text.secondary",
                        "&:hover": {
                          borderColor: "hsl(var(--primary))",
                          color: "text.primary",
                        },
                      }}
                    >
                      {isCopied ? "Copied" : "Copy"}
                    </Button>

                    {onAddToCustomFields && (
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => onAddToCustomFields(field)}
                        sx={{
                          height: 24,
                          px: 1,
                          fontSize: "0.7rem",
                          fontWeight: 500,
                          textTransform: "none",
                          borderColor: "hsl(var(--primary) / 0.5)",
                          color: "primary.main",
                          "&:hover": {
                            borderColor: "hsl(var(--primary))",
                            bgcolor: "hsl(var(--primary) / 0.08)",
                          },
                        }}
                      >
                        Add to Custom Fields
                      </Button>
                    )}
                  </Box>
                </Box>

                {/* Field Value Display */}
                {field.type === "list" && Array.isArray(field.value) ? (
                  <Box
                    sx={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 0.75,
                      mt: 0.25,
                    }}
                  >
                    {field.value.map((item, idx) => (
                      <Box
                        key={idx}
                        sx={{
                          px: 1,
                          py: 0.35,
                          borderRadius: 1,
                          bgcolor: "hsl(var(--muted) / 0.6)",
                          border: "1px solid hsl(var(--border) / 0.5)",
                          fontSize: "0.75rem",
                          fontFamily: "monospace",
                          color: "hsl(var(--foreground))",
                        }}
                      >
                        {String(item)}
                      </Box>
                    ))}
                  </Box>
                ) : field.type === "json" ? (
                  <Box
                    component="pre"
                    sx={{
                      m: 0,
                      p: 1.25,
                      borderRadius: 1,
                      bgcolor: "hsl(var(--muted) / 0.4)",
                      border: "1px solid hsl(var(--border) / 0.5)",
                      fontSize: "0.75rem",
                      fontFamily: "monospace",
                      overflowX: "auto",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                      color: "hsl(var(--foreground))",
                    }}
                  >
                    {field.displayValue}
                  </Box>
                ) : (
                  <Box
                    sx={{
                      px: 1.25,
                      py: 0.6,
                      borderRadius: 1,
                      bgcolor: "hsl(var(--muted) / 0.35)",
                      border: "1px solid hsl(var(--border) / 0.4)",
                      fontSize: "0.8rem",
                      fontFamily: codeLike ? "monospace" : "inherit",
                      color: "hsl(var(--foreground))",
                      wordBreak: "break-all",
                      lineHeight: 1.5,
                      userSelect: "text",
                    }}
                  >
                    {field.displayValue}
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      </Collapse>
    </Box>
  );
};
export default HiddenFieldsSection;
