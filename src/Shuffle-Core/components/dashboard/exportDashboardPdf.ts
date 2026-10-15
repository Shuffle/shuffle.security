/**
 * exportDashboardPdf — captures both dashboard tabs and an "Org export"
 * stats summary into a single multi-page PDF.
 *
 * Uses html2canvas-pro (handles modern CSS color functions like oklch that
 * vanilla html2canvas rejects) plus jsPDF. The caller is responsible for
 * switching the visible tab so the target element is actually mounted/painted
 * before each capture — this util only does the screenshot + PDF assembly.
 */
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import { drawTable, type ReportTable } from './exportReport';

export interface DashboardStatsSummary {
  orgName: string;
  rangeLabel: string;
  incidents: {
    total: number;
    byStatus: Record<string, number>;
    bySeverity: Record<string, number>;
  };
  vulnerabilities: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  monitors: {
    hostCount: number | null;
    runningSensors: number | null;
  };
  automation?: {
    workflows?: number;
    runs?: number;
    successRate?: number | null;
  };
}

const PAGE_MARGIN = 32;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Snapshot a DOM node to a PNG data URL using html2canvas-pro. */
export const captureNode = async (node: HTMLElement): Promise<string> => {
  // Two animation frames + small delay so recharts has painted.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await wait(150);

  const canvas = await html2canvas(node, {
    backgroundColor: getComputedStyle(document.body).backgroundColor || '#0b0b0e',
    scale: Math.min(window.devicePixelRatio || 1, 2),
    useCORS: true,
    logging: false,
  });
  return canvas.toDataURL('image/png');
};

/** Fit a captured image into an A4 portrait page with margins. */
const addImageAsPage = (
  pdf: jsPDF,
  dataUrl: string,
  pageTitle: string,
) => {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const usableW = pageW - PAGE_MARGIN * 2;
  const usableH = pageH - PAGE_MARGIN * 2 - 24; // leave room for title

  // Title bar
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.setTextColor(20, 20, 20);
  pdf.text(pageTitle, PAGE_MARGIN, PAGE_MARGIN);

  // Compute image size preserving aspect ratio
  const img = new Image();
  img.src = dataUrl;
  // Synchronous size: rely on data URL header parsing fallback is messy, so
  // re-load through a temp canvas via a quick decode.
  // We use a Promise wrapper at the call site instead.
  return new Promise<void>((resolve) => {
    const probe = new Image();
    probe.onload = () => {
      const ratio = probe.width / probe.height;
      let w = usableW;
      let h = w / ratio;
      if (h > usableH) {
        h = usableH;
        w = h * ratio;
      }
      const x = (pageW - w) / 2;
      const y = PAGE_MARGIN + 16;
      pdf.addImage(dataUrl, 'PNG', x, y, w, h, undefined, 'FAST');
      resolve();
    };
    probe.src = dataUrl;
  });
};

const drawStatsPage = (pdf: jsPDF, stats: DashboardStatsSummary) => {
  const pageW = pdf.internal.pageSize.getWidth();
  let y = PAGE_MARGIN;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.setTextColor(20, 20, 20);
  pdf.text('Org export — raw stats', PAGE_MARGIN, y);
  y += 18;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(90, 90, 90);
  pdf.text(`Organization: ${stats.orgName}`, PAGE_MARGIN, y);
  y += 12;
  pdf.text(`Range: ${stats.rangeLabel}`, PAGE_MARGIN, y);
  y += 12;
  pdf.text(`Generated: ${new Date().toLocaleString()}`, PAGE_MARGIN, y);
  y += 22;

  const section = (title: string) => {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(20, 20, 20);
    pdf.text(title, PAGE_MARGIN, y);
    y += 14;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(50, 50, 50);
  };

  const row = (label: string, value: string | number) => {
    pdf.text(label, PAGE_MARGIN + 8, y);
    pdf.text(String(value), pageW - PAGE_MARGIN - 8, y, { align: 'right' });
    y += 12;
  };

  section('Incidents');
  row('Total incidents', stats.incidents.total);
  Object.entries(stats.incidents.byStatus).forEach(([k, v]) =>
    row(`  by status — ${k}`, v),
  );
  Object.entries(stats.incidents.bySeverity).forEach(([k, v]) =>
    row(`  by severity — ${k}`, v),
  );
  y += 6;

  section('Vulnerabilities');
  row('Critical', stats.vulnerabilities.critical);
  row('High', stats.vulnerabilities.high);
  row('Medium', stats.vulnerabilities.medium);
  row('Low', stats.vulnerabilities.low);
  row('Informational', stats.vulnerabilities.info);
  y += 6;

  section('Detection coverage');
  row('Host monitors deployed', stats.monitors.hostCount ?? '—');
  row('Pipeline sensors running', stats.monitors.runningSensors ?? '—');
  y += 6;

  if (stats.automation) {
    section('Automation');
    if (stats.automation.workflows !== undefined) row('Workflows', stats.automation.workflows);
    if (stats.automation.runs !== undefined) row('Runs in range', stats.automation.runs);
    if (stats.automation.successRate !== undefined && stats.automation.successRate !== null) {
      row('Success rate', `${stats.automation.successRate.toFixed(1)}%`);
    }
  }

  pdf.setFont('helvetica', 'italic');
  pdf.setFontSize(8);
  pdf.setTextColor(140, 140, 140);
  pdf.text(
    'Generated by Shuffle Security · shuffler.io',
    PAGE_MARGIN,
    pdf.internal.pageSize.getHeight() - PAGE_MARGIN / 2,
  );
};

export interface BuildDashboardPdfOptions {
  securityImage: string | null;
  automationImage: string | null;
  stats: DashboardStatsSummary;
  filename?: string;
  /** Include the raw stats page. Defaults to true. */
  includeStats?: boolean;
  /** Extra data tables rendered after the dashboard pages. */
  tables?: ReportTable[];
}

export const buildDashboardPdf = async ({
  securityImage,
  automationImage,
  stats,
  filename,
  includeStats = true,
  tables = [],
}: BuildDashboardPdfOptions): Promise<void> => {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

  // Cover
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  pdf.setFillColor(255, 102, 0);
  pdf.rect(0, 0, pageW, 6, 'F');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(28);
  pdf.setTextColor(20, 20, 20);
  pdf.text('Shuffle Security', PAGE_MARGIN, pageH / 2 - 30);
  pdf.setFontSize(18);
  pdf.setTextColor(80, 80, 80);
  pdf.text(tables.length > 0 ? 'Organization report' : 'Org dashboard export', PAGE_MARGIN, pageH / 2 - 4);
  pdf.setFontSize(11);
  pdf.setTextColor(120, 120, 120);
  pdf.text(`Organization: ${stats.orgName}`, PAGE_MARGIN, pageH / 2 + 24);
  pdf.text(`Range: ${stats.rangeLabel}`, PAGE_MARGIN, pageH / 2 + 40);
  pdf.text(`Generated: ${new Date().toLocaleString()}`, PAGE_MARGIN, pageH / 2 + 56);

  if (securityImage) {
    pdf.addPage();
    await addImageAsPage(pdf, securityImage, 'Security Operations');
  }
  if (automationImage) {
    pdf.addPage();
    await addImageAsPage(pdf, automationImage, 'Automation');
  }

  if (includeStats) {
    pdf.addPage();
    drawStatsPage(pdf, stats);
  }

  for (const table of tables) drawTable(pdf, table, stats.rangeLabel);

  const stamp = new Date().toISOString().slice(0, 10);
  pdf.save(filename || `shuffle-${tables.length > 0 ? 'report' : 'dashboard'}-${stamp}.pdf`);
};
