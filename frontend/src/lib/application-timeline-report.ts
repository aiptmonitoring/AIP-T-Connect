import type { PDFFont, PDFPage } from "pdf-lib";

export type TimelineReportDocument = {
  document_name: string;
  document_size: number;
  document_type: string;
  created_at: string;
};

export type TimelineReportEntry = {
  timeline_date: string;
  description: string;
  procedure: { description: string } | null;
  documents: TimelineReportDocument[];
};

export type ApplicationTimelineReportInput = {
  client: {
    assigned_id: number;
    company_name: string;
    email: string;
    phone: string;
    client_type: string;
    address: string;
    notes: string;
    status: string;
    country: { name: string; abbreviation: string } | null;
    fee_classification: { description: string } | null;
  };
  application: {
    matter_type: string;
    matter_date: string;
    aipt_ref_no: string;
    client_ref_no: string;
    project_name: string;
    class_number: number | null;
    filing_number: string | null;
    filing_date: string | null;
    acceptance_number: string | null;
    acceptance_date: string | null;
    opposition_date: string | null;
    register_number: string | null;
    registered_date: string | null;
    renewal_date: string | null;
    applicant: string;
    status: string;
    service: { service: string } | null;
    procedure: { description: string } | null;
    country: { name: string; abbreviation: string } | null;
  };
  timeline: TimelineReportEntry[];
  generatedAt: Date;
};

const pageWidth = 595.28;
const pageHeight = 841.89;
const margin = 42;
const bottomMargin = 64;
const contentWidth = pageWidth - margin * 2;

function reportText(value: unknown, fallback = "Not recorded") {
  const source = value === null || value === undefined || value === "" ? fallback : String(value);
  return source.normalize("NFKD").replace(/[^\x20-\x7E]/g, "?");
}

function reportDate(value: string | null | undefined) {
  if (!value) return "Not recorded";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return reportText(value);
  return new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function reportGeneratedAt(value: Date) {
  return reportText(
    new Intl.DateTimeFormat("en", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(value),
  );
}

function reportFileSize(value: number) {
  if (!Number.isFinite(value) || value < 1) return "Not recorded";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function wrapText(value: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  const pushLongWord = (word: string) => {
    let chunk = "";
    for (const character of word) {
      const candidate = `${chunk}${character}`;
      if (font.widthOfTextAtSize(candidate, size) <= width || !chunk) {
        chunk = candidate;
      } else {
        lines.push(chunk);
        chunk = character;
      }
    }
    if (chunk) lines.push(chunk);
  };

  for (const paragraph of reportText(value, "").split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }

    let line = "";
    for (const word of words) {
      if (font.widthOfTextAtSize(word, size) > width) {
        if (line) lines.push(line);
        pushLongWord(word);
        line = "";
        continue;
      }

      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width || !line) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }

  return lines.length ? lines : [""];
}

function downloadName(projectName: string) {
  const clean = projectName.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "application";
  return `${clean}-timeline-report.pdf`;
}

export async function createApplicationTimelineReport(input: ApplicationTimelineReportInput) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  type PdfColor = ReturnType<typeof rgb>;

  const purple = rgb(0.34, 0.18, 0.82);
  const deepPurple = rgb(0.14, 0.1, 0.42);
  const dark = rgb(0.09, 0.11, 0.24);
  const muted = rgb(0.36, 0.41, 0.55);
  const palePurple = rgb(0.95, 0.93, 1);
  const cardFill = rgb(0.985, 0.986, 1);
  const line = rgb(0.86, 0.88, 0.94);
  const white = rgb(1, 1, 1);
  const warmStatus = rgb(0.98, 0.7, 0.21);
  const coolStatus = rgb(0.24, 0.67, 0.49);
  const neutralStatus = rgb(0.4, 0.43, 0.58);

  const projectName = reportText(input.application.project_name, "Client application");
  const applicationReference = reportText(input.application.aipt_ref_no, "Reference not recorded");
  const generatedAt = reportGeneratedAt(input.generatedAt);
  let page: PDFPage = pdf.addPage([pageWidth, pageHeight]);
  let cursorY = 0;

  const ellipsize = (value: string, font: PDFFont, size: number, width: number) => {
    const clean = reportText(value, "");
    if (font.widthOfTextAtSize(clean, size) <= width) return clean;
    const suffix = "...";
    let shortened = clean;
    while (shortened && font.widthOfTextAtSize(`${shortened}${suffix}`, size) > width) shortened = shortened.slice(0, -1);
    return `${shortened}${suffix}`;
  };

  const drawRight = (value: string, right: number, y: number, size: number, font: PDFFont, color: PdfColor, maxWidth?: number) => {
    const text = maxWidth ? ellipsize(value, font, size, maxWidth) : value;
    page.drawText(text, { x: right - font.widthOfTextAtSize(text, size), y, size, font, color });
  };

  const statusColor = (value: string) => {
    const normalized = value.toLowerCase();
    if (/(registered|granted|published|active)/.test(normalized)) return coolStatus;
    if (/(filed|pending|opposition|deadline)/.test(normalized)) return warmStatus;
    return neutralStatus;
  };

  const drawStatusPill = (value: string, right: number, y: number) => {
    const label = ellipsize(reportText(value, "Status not recorded").toUpperCase(), bold, 7.5, 96);
    const width = Math.max(52, bold.widthOfTextAtSize(label, 7.5) + 18);
    const color = statusColor(value);
    page.drawRectangle({ x: right - width, y, width, height: 18, color, borderColor: white, borderWidth: 0.5, borderOpacity: 0.34 });
    page.drawText(label, { x: right - 9 - bold.widthOfTextAtSize(label, 7.5), y: y + 5.5, size: 7.5, font: bold, color: white });
  };

  const drawFirstPageHeader = () => {
    const bannerHeight = 137;
    const bannerBottom = pageHeight - bannerHeight;
    page.drawRectangle({ x: 0, y: bannerBottom, width: pageWidth, height: bannerHeight, color: deepPurple });
    page.drawRectangle({ x: 0, y: bannerBottom, width: 7, height: bannerHeight, color: purple });
    page.drawText("AIP&T INTELLECTUAL PROPERTY", { x: margin, y: pageHeight - 29, size: 9, font: bold, color: white });
    page.drawText("CLIENT APPLICATION", { x: margin, y: pageHeight - 47, size: 7.5, font: bold, color: rgb(0.79, 0.72, 1) });
    page.drawText("Application Timeline", { x: margin, y: pageHeight - 80, size: 23, font: bold, color: white });
    page.drawText("Report", { x: margin, y: pageHeight - 106, size: 23, font: bold, color: white });
    drawRight(projectName, pageWidth - margin, pageHeight - 47, 10, bold, white, 196);
    drawRight(`AIP&T Ref. ${applicationReference}`, pageWidth - margin, pageHeight - 65, 8, regular, rgb(0.89, 0.87, 1), 196);
    drawRight(`Generated ${generatedAt}`, pageWidth - margin, pageHeight - 83, 8, regular, rgb(0.89, 0.87, 1), 196);
    drawStatusPill(input.application.status, pageWidth - margin, bannerBottom + 18);
    cursorY = bannerBottom - 22;
  };

  const prepareRunningPage = () => {
    const headerHeight = 58;
    cursorY = pageHeight - headerHeight - 24;
  };

  const addPage = () => {
    page = pdf.addPage([pageWidth, pageHeight]);
    prepareRunningPage();
  };

  const ensureSpace = (height: number) => {
    if (cursorY - height < bottomMargin) addPage();
  };

  const drawHighlights = () => {
    const highlights = [
      ["CLIENT", reportText(input.client.company_name)],
      ["SERVICE", reportText(input.application.service?.service)],
      ["COUNTRY", reportText(input.application.country?.name)],
      ["APPLICATION TYPE", reportText(input.application.matter_type)],
    ];
    const gap = 8;
    const cellWidth = (contentWidth - gap * (highlights.length - 1)) / highlights.length;
    const height = 61;
    ensureSpace(height + 8);
    highlights.forEach(([label, value], index) => {
      const x = margin + index * (cellWidth + gap);
      page.drawRectangle({ x, y: cursorY - height, width: cellWidth, height, color: cardFill, borderColor: line, borderWidth: 0.7 });
      page.drawRectangle({ x, y: cursorY - 5, width: cellWidth, height: 5, color: index === 0 ? purple : palePurple });
      page.drawText(label, { x: x + 9, y: cursorY - 21, size: 6.5, font: bold, color: muted });
      const lines = wrapText(value, bold, 8.5, cellWidth - 18).slice(0, 2);
      lines.forEach((lineValue, lineIndex) => page.drawText(lineValue, { x: x + 9, y: cursorY - 36 - lineIndex * 11, size: 8.5, font: bold, color: dark }));
    });
    cursorY -= height + 16;
  };

  const rowHeightFor = (left: [string, string], right?: [string, string]) => {
    const columnGap = 16;
    const columnWidth = (contentWidth - columnGap) / 2;
    const lines = Math.max(wrapText(left[1], regular, 8.8, columnWidth).length, right ? wrapText(right[1], regular, 8.8, columnWidth).length : 1);
    return Math.max(35, 20 + lines * 11.5);
  };

  const drawDetailsCard = (title: string, fields: Array<[string, string]>) => {
    const columnGap = 16;
    const columnWidth = (contentWidth - columnGap) / 2;
    let index = 0;
    let continued = false;

    const drawHeader = () => {
      page.drawRectangle({ x: margin, y: cursorY - 24, width: contentWidth, height: 24, color: palePurple, borderColor: line, borderWidth: 0.7 });
      page.drawRectangle({ x: margin, y: cursorY - 24, width: 4, height: 24, color: purple });
      page.drawText(continued ? `${title} (continued)` : title, { x: margin + 12, y: cursorY - 15, size: 9, font: bold, color: deepPurple });
      cursorY -= 32;
    };

    while (index < fields.length) {
      const left = fields[index];
      const right = fields[index + 1];
      const rowHeight = rowHeightFor(left, right);
      ensureSpace(32 + rowHeight);
      drawHeader();

      while (index < fields.length) {
        const currentLeft = fields[index];
        const currentRight = fields[index + 1];
        const currentRowHeight = rowHeightFor(currentLeft, currentRight);
        if (cursorY - currentRowHeight < bottomMargin) {
          addPage();
          continued = true;
          break;
        }

        page.drawRectangle({ x: margin, y: cursorY - currentRowHeight + 3, width: contentWidth, height: currentRowHeight - 3, color: cardFill, borderColor: line, borderWidth: 0.4 });
        page.drawLine({ start: { x: margin + columnWidth + columnGap / 2, y: cursorY - 5 }, end: { x: margin + columnWidth + columnGap / 2, y: cursorY - currentRowHeight + 8 }, thickness: 0.5, color: line });

        const drawField = (field: [string, string] | undefined, x: number) => {
          if (!field) return;
          const lines = wrapText(field[1], regular, 8.8, columnWidth);
          page.drawText(reportText(field[0]).toUpperCase(), { x, y: cursorY - 12, size: 6.5, font: bold, color: muted });
          lines.forEach((lineValue, lineIndex) => page.drawText(lineValue, { x, y: cursorY - 25 - lineIndex * 11.5, size: 8.8, font: regular, color: dark }));
        };

        drawField(currentLeft, margin + 10);
        drawField(currentRight, margin + columnWidth + columnGap + 2);
        cursorY -= currentRowHeight;
        index += 2;
      }
    }
    cursorY -= 12;
  };

  const drawNarrativeCard = (title: string, value: string) => {
    const lines = wrapText(value, regular, 8.8, contentWidth - 20);
    let lineIndex = 0;
    let continued = false;

    const drawHeader = () => {
      ensureSpace(35);
      page.drawRectangle({ x: margin, y: cursorY - 24, width: contentWidth, height: 24, color: palePurple, borderColor: line, borderWidth: 0.7 });
      page.drawRectangle({ x: margin, y: cursorY - 24, width: 4, height: 24, color: purple });
      page.drawText(continued ? `${title} (continued)` : title, { x: margin + 12, y: cursorY - 15, size: 9, font: bold, color: deepPurple });
      cursorY -= 35;
    };

    drawHeader();
    while (lineIndex < lines.length) {
      if (cursorY - 14 < bottomMargin) {
        addPage();
        continued = true;
        drawHeader();
      }
      page.drawText(lines[lineIndex], { x: margin + 10, y: cursorY, size: 8.8, font: regular, color: dark });
      cursorY -= 13;
      lineIndex += 1;
    }
    cursorY -= 12;
  };

  const drawTimelineHeading = (title: string, followingHeight = 0) => {
    ensureSpace(40 + followingHeight);
    page.drawText(title, { x: margin, y: cursorY, size: 14, font: bold, color: dark });
    page.drawText("Procedure milestones and supporting-document register", { x: margin, y: cursorY - 15, size: 8, font: regular, color: muted });
    page.drawLine({ start: { x: margin, y: cursorY - 23 }, end: { x: pageWidth - margin, y: cursorY - 23 }, thickness: 1, color: line });
    cursorY -= 38;
  };

  const drawTimelineEntry = (entry: TimelineReportEntry, index: number) => {
    const procedure = reportText(entry.procedure?.description, "Procedure update");
    const headingLines = wrapText(procedure, bold, 10, contentWidth - 57);
    const descriptionLines = wrapText(entry.description, regular, 8.8, contentWidth - 35);
    const markerX = margin + 11;
    let headingDrawn = false;

    const drawEntryHeader = (continuation = false) => {
      const headerHeight = Math.max(43, headingLines.length * 12 + 30);
      ensureSpace(headerHeight + 24);
      page.drawRectangle({ x: margin, y: cursorY - headerHeight + 3, width: contentWidth, height: headerHeight - 3, color: cardFill, borderColor: line, borderWidth: 0.6 });
      page.drawCircle({ x: markerX, y: cursorY - 15, size: 10.5, color: purple });
      const sequence = String(index + 1);
      page.drawText(sequence, { x: markerX - bold.widthOfTextAtSize(sequence, 7) / 2, y: cursorY - 17.5, size: 7, font: bold, color: white });
      headingLines.forEach((lineValue, lineIndex) => page.drawText(lineValue, { x: margin + 31, y: cursorY - 13 - lineIndex * 12, size: 10, font: bold, color: deepPurple }));
      page.drawText(`${reportDate(entry.timeline_date)}${continuation ? " | Continued" : ""}`, { x: margin + 31, y: cursorY - 13 - headingLines.length * 12 - 3, size: 7.5, font: regular, color: muted });
      cursorY -= headerHeight + 7;
      headingDrawn = true;
    };

    const drawDocumentTableHeader = () => {
      page.drawRectangle({ x: margin + 24, y: cursorY - 17, width: contentWidth - 24, height: 18, color: deepPurple });
      page.drawText("DOCUMENT", { x: margin + 32, y: cursorY - 11, size: 6.5, font: bold, color: white });
      page.drawText("TYPE", { x: margin + 273, y: cursorY - 11, size: 6.5, font: bold, color: white });
      page.drawText("SIZE", { x: margin + 361, y: cursorY - 11, size: 6.5, font: bold, color: white });
      page.drawText("UPLOADED", { x: margin + 420, y: cursorY - 11, size: 6.5, font: bold, color: white });
      cursorY -= 22;
    };

    drawEntryHeader();
    descriptionLines.forEach((lineValue) => {
      if (cursorY - 14 < bottomMargin) {
        addPage();
        drawEntryHeader(true);
      }
      page.drawLine({ start: { x: markerX, y: cursorY + 3 }, end: { x: markerX, y: cursorY - 11 }, thickness: 1.2, color: line });
      page.drawText(lineValue, { x: margin + 31, y: cursorY, size: 8.8, font: regular, color: dark });
      cursorY -= 13;
    });

    if (entry.documents.length) {
      const firstDocument = entry.documents[0];
      const firstDocumentNameLines = wrapText(reportText(firstDocument.document_name), regular, 8, 230);
      const firstDocumentTypeLines = wrapText(reportText(firstDocument.document_type, "File"), regular, 7.2, 76);
      const firstDocumentRowHeight = Math.max(25, Math.max(firstDocumentNameLines.length * 10, firstDocumentTypeLines.length * 9) + 12);
      if (cursorY - (35 + firstDocumentRowHeight) < bottomMargin) {
        addPage();
        drawEntryHeader(true);
      }
      page.drawText(`Supporting documents (${entry.documents.length})`, { x: margin + 31, y: cursorY - 3, size: 7.5, font: bold, color: muted });
      cursorY -= 13;
      drawDocumentTableHeader();

      entry.documents.forEach((document) => {
        const nameLines = wrapText(reportText(document.document_name), regular, 8, 230);
        const typeLines = wrapText(reportText(document.document_type, "File"), regular, 7.2, 76);
        const rowHeight = Math.max(25, Math.max(nameLines.length * 10, typeLines.length * 9) + 12);
        if (cursorY - rowHeight < bottomMargin) {
          addPage();
          drawEntryHeader(true);
          page.drawText("Supporting documents (continued)", { x: margin + 31, y: cursorY - 3, size: 7.5, font: bold, color: muted });
          cursorY -= 13;
          drawDocumentTableHeader();
        }

        page.drawRectangle({ x: margin + 24, y: cursorY - rowHeight + 3, width: contentWidth - 24, height: rowHeight - 3, color: cardFill, borderColor: line, borderWidth: 0.45 });
        nameLines.forEach((lineValue, lineIndex) => page.drawText(lineValue, { x: margin + 32, y: cursorY - 11 - lineIndex * 10, size: 8, font: regular, color: dark }));
        typeLines.forEach((lineValue, lineIndex) => page.drawText(lineValue, { x: margin + 273, y: cursorY - 11 - lineIndex * 9, size: 7.2, font: regular, color: dark }));
        page.drawText(reportFileSize(document.document_size), { x: margin + 361, y: cursorY - 11, size: 7.2, font: regular, color: dark });
        page.drawText(reportDate(document.created_at), { x: margin + 420, y: cursorY - 11, size: 7.2, font: regular, color: dark });
        cursorY -= rowHeight;
      });
    }

    if (headingDrawn) cursorY -= 14;
  };

  drawFirstPageHeader();
  drawHighlights();
  drawDetailsCard("Application overview", [
    ["Project", projectName],
    ["Application type", reportText(input.application.matter_type)],
    ["Service", reportText(input.application.service?.service)],
    ["Procedure", reportText(input.application.procedure?.description)],
    ["AIP&T Ref. No.", applicationReference],
    ["Client Ref. No.", reportText(input.application.client_ref_no)],
    ["Application date", reportDate(input.application.matter_date)],
    ["Country", reportText(input.application.country?.name)],
    ["Class", input.application.class_number ? String(input.application.class_number) : "Not applicable"],
    ["Status", reportText(input.application.status)],
    ["Applicant", reportText(input.application.applicant)],
    ["Renewal date", reportDate(input.application.renewal_date)],
  ]);
  drawDetailsCard("Client profile", [
    ["Client", reportText(input.client.company_name)],
    ["Client ID", String(input.client.assigned_id)],
    ["Client type", reportText(input.client.client_type)],
    ["Client status", reportText(input.client.status)],
    ["Fee classification", reportText(input.client.fee_classification?.description)],
    ["Country", reportText(input.client.country?.name)],
    ["Email", reportText(input.client.email)],
    ["Phone", reportText(input.client.phone)],
    ["Address", reportText(input.client.address)],
  ]);
  if (input.client.notes.trim()) drawNarrativeCard("Client notes", input.client.notes);
  drawDetailsCard("Filing and registration", [
    ["Filing number", reportText(input.application.filing_number)],
    ["Filing date", reportDate(input.application.filing_date)],
    ["Acceptance number", reportText(input.application.acceptance_number)],
    ["Acceptance date", reportDate(input.application.acceptance_date)],
    ["Opposition date", reportDate(input.application.opposition_date)],
    ["Register number", reportText(input.application.register_number)],
    ["Registered date", reportDate(input.application.registered_date)],
  ]);

  drawTimelineHeading(`Timeline history (${input.timeline.length})`, input.timeline.length ? 70 : 54);
  if (!input.timeline.length) {
    ensureSpace(54);
    page.drawRectangle({ x: margin, y: cursorY - 42, width: contentWidth, height: 42, color: cardFill, borderColor: line, borderWidth: 0.7 });
    page.drawText("No timeline entries have been recorded for this application.", { x: margin + 12, y: cursorY - 24, size: 9, font: regular, color: muted });
    cursorY -= 54;
  } else {
    input.timeline.forEach((entry, index) => drawTimelineEntry(entry, index));
  }

  pdf.getPages().forEach((reportPage, index, pages) => {
    if (index > 0) {
      const headerHeight = 58;
      const headerProject = ellipsize(projectName, bold, 8.5, 214);
      const headerReference = ellipsize(`Ref. ${applicationReference}`, regular, 7.5, 214);
      reportPage.drawRectangle({ x: 0, y: pageHeight - headerHeight, width: pageWidth, height: headerHeight, color: deepPurple });
      reportPage.drawRectangle({ x: 0, y: pageHeight - headerHeight, width: 5, height: headerHeight, color: purple });
      reportPage.drawText("AIP&T | APPLICATION TIMELINE REPORT", { x: margin, y: pageHeight - 28, size: 8.5, font: bold, color: white });
      reportPage.drawText(headerProject, { x: pageWidth - margin - bold.widthOfTextAtSize(headerProject, 8.5), y: pageHeight - 24, size: 8.5, font: bold, color: white });
      reportPage.drawText(headerReference, { x: pageWidth - margin - regular.widthOfTextAtSize(headerReference, 7.5), y: pageHeight - 39, size: 7.5, font: regular, color: rgb(0.89, 0.87, 1) });
    }
    reportPage.drawLine({ start: { x: margin, y: 42 }, end: { x: pageWidth - margin, y: 42 }, thickness: 0.8, color: line });
    reportPage.drawText("CONFIDENTIAL | AIP&T Intellectual Property", { x: margin, y: 25, size: 8, font: bold, color: muted });
    reportPage.drawText(`Generated ${generatedAt}`, { x: margin, y: 13, size: 7.2, font: regular, color: muted });
    const pageLabel = `Page ${index + 1} of ${pages.length}`;
    reportPage.drawText(pageLabel, { x: pageWidth - margin - regular.widthOfTextAtSize(pageLabel, 8), y: 25, size: 8, font: regular, color: muted });
    const referenceLabel = ellipsize(`AIP&T Ref. ${applicationReference}`, regular, 7.2, 170);
    reportPage.drawText(referenceLabel, { x: pageWidth - margin - regular.widthOfTextAtSize(referenceLabel, 7.2), y: 13, size: 7.2, font: regular, color: muted });
  });

  pdf.setTitle(`${projectName} timeline report`);
  pdf.setAuthor("AIP&T Intellectual Property");
  pdf.setSubject("Client application timeline report");
  pdf.setKeywords(["AIP&T", "client application", "timeline", "intellectual property"]);

  return { bytes: await pdf.save(), fileName: downloadName(input.application.project_name) };
}
