// ╔════════════════════════════════════════════════════════════╗
// ║   EduConnect — Attendance Report & Download Utility       ║
// ╚════════════════════════════════════════════════════════════╝

const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');
const { Student, Attendance } = require('../models');

/**
 * Format a date string (YYYY-MM-DD) to 'DD MMM YYYY' (e.g. '01 Sep 2026')
 */
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  const day = String(d.getDate()).padStart(2, '0');
  const mon = MONTHS[d.getMonth()];
  const yr = d.getFullYear();
  return `${day} ${mon} ${yr}`;
}

/**
 * Format a date string to compact '01Sep2026'
 */
function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return String(dateStr).replace(/[^a-zA-Z0-9]/g, '');
  const day = String(d.getDate()).padStart(2, '0');
  const mon = MONTHS[d.getMonth()];
  const yr = d.getFullYear();
  return `${day}${mon}${yr}`;
}

/**
 * Period label helper (1 -> '1st Hour', etc.)
 */
function getPeriodLabel(periodNum) {
  if (periodNum === undefined || periodNum === null || periodNum === '' || periodNum === 0 || periodNum === '0') {
    return 'All Periods';
  }
  const n = Number(periodNum);
  const suffix = ['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : (n % 10 < 4 ? n % 10 : 0)];
  return `${n}${suffix} Hour`;
}

/**
 * Generate a safe and clean filename matching specification
 * Example: EduConnect_Attendance_10A_Mathematics_01Sep-10Sep2026.xlsx
 */
function getSafeReportFilename(filter, ext) {
  const parts = ['EduConnect', 'Attendance'];
  if (filter.className) {
    parts.push(`${filter.className}${filter.section ? filter.section.trim() : ''}`);
  }
  if (filter.subject && filter.subject !== 'All' && filter.subject !== 'All Subjects') {
    parts.push(filter.subject.replace(/[^a-zA-Z0-9]/g, ''));
  } else {
    parts.push('AllSubjects');
  }

  if (filter.startDate && filter.endDate) {
    const s = formatShortDate(filter.startDate);
    const e = formatShortDate(filter.endDate);
    parts.push(`${s}-${e}`);
  } else if (filter.startDate) {
    parts.push(`from_${formatShortDate(filter.startDate)}`);
  } else {
    parts.push(new Date().toISOString().slice(0, 10).replace(/-/g, ''));
  }

  const safe = parts.join('_').replace(/[^a-zA-Z0-9_.-]/g, '_');
  return `${safe}.${ext}`;
}

/**
 * Fetch and aggregate attendance report data dynamically from MongoDB
 */
async function buildAttendanceReportData(params) {
  const className = params.class || params.className || '';
  const section = params.section || '';
  const subject = (params.subject && params.subject !== 'All' && params.subject !== 'All Subjects') ? params.subject : '';
  const period = (params.period !== undefined && params.period !== null && params.period !== '' && params.period !== 'All' && params.period !== 'All Periods') ? Number(params.period) : null;
  const startDate = params.startDate || '';
  const endDate = params.endDate || '';
  let viewMode = params.viewMode || 'daily'; // 'daily' | 'subject' | 'date'

  // If "All Subjects" or no subject specified and viewMode isn't explicitly date, default subject view if user requested all subjects
  if ((!subject || params.subject === 'All' || params.subject === 'All Subjects') && params.viewMode === 'subject') {
    viewMode = 'subject';
  }

  // 1. Fetch enrolled students for class and section
  const stuQuery = {};
  if (className) stuQuery.class = className;
  if (section) stuQuery.section = section;
  const students = await Student.find(stuQuery)
    .sort({ class: 1, section: 1, rollNumber: 1, name: 1 })
    .lean();

  // 2. Fetch finalized attendance records (exclude Pending)
  const attQuery = {
    status: { $in: ['Present', 'Absent', 'Late'] }
  };
  if (className) attQuery.class = className;
  if (section) attQuery.section = section;
  if (subject) attQuery.subject = subject;
  if (period !== null && !isNaN(period)) attQuery.period = period;

  if (startDate && endDate) {
    attQuery.date = { $gte: startDate, $lte: endDate };
  } else if (startDate) {
    attQuery.date = { $gte: startDate };
  } else if (endDate) {
    attQuery.date = { $lte: endDate };
  }

  const records = await Attendance.find(attQuery)
    .sort({ date: 1, period: 1, subject: 1 })
    .lean();

  // 3. Extract unique dates, sessions, and subjects
  const dateSet = new Set();
  const sessionMap = new Map(); // key: "YYYY-MM-DD|period|subject"
  const subjectSet = new Set();

  records.forEach(r => {
    if (r.date) dateSet.add(r.date);
    if (r.subject && r.subject !== 'All') subjectSet.add(r.subject);
    const sKey = `${r.date}|${r.period || 0}|${r.subject || 'All'}`;
    if (!sessionMap.has(sKey)) {
      sessionMap.set(sKey, {
        date: r.date,
        period: r.period || 0,
        subject: r.subject || 'All',
        label: `${formatDisplayDate(r.date)}${r.period ? ` (P${r.period})` : ''}`
      });
    }
  });

  const sortedDates = Array.from(dateSet).sort();
  const sortedSubjects = Array.from(subjectSet).sort();
  const sortedSessions = Array.from(sessionMap.values()).sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.period || 0) - (b.period || 0);
  });

  // ── MODE A: DAILY GRID ──
  // Determine column sessions:
  // If a single subject is filtered and period is specified or each date has single period, columns are sortedDates
  // If multiple sessions per date exist, use session columns
  const useSessionColumns = !period && sortedSessions.length > sortedDates.length;
  const gridColumns = useSessionColumns
    ? sortedSessions.map(s => ({ key: `${s.date}|${s.period}|${s.subject}`, label: s.label, date: s.date, period: s.period, subject: s.subject }))
    : sortedDates.map(d => ({ key: d, label: formatDisplayDate(d).slice(0, 6), fullLabel: formatDisplayDate(d), date: d }));

  // Index records for fast lookup: studentId -> columnKey -> record
  const studentRecordsMap = new Map();
  records.forEach(r => {
    if (!studentRecordsMap.has(r.studentId)) {
      studentRecordsMap.set(r.studentId, new Map());
    }
    const stuMap = studentRecordsMap.get(r.studentId);
    if (useSessionColumns) {
      const sKey = `${r.date}|${r.period || 0}|${r.subject || 'All'}`;
      stuMap.set(sKey, r);
    } else {
      // If single column per date, prefer highest priority status or latest
      const existing = stuMap.get(r.date);
      if (!existing || r.status === 'Present') {
        stuMap.set(r.date, r);
      }
    }
  });

  let grandPresent = 0;
  let grandAbsent = 0;

  const dailyStudentRows = students.map((stu, idx) => {
    const stuMap = studentRecordsMap.get(stu.studentId) || new Map();
    const attendanceByCol = {};
    let presentCount = 0;
    let absentCount = 0;

    gridColumns.forEach(col => {
      const rec = stuMap.get(col.key);
      if (!rec) {
        attendanceByCol[col.key] = '-';
      } else if (rec.status === 'Present' || rec.status === 'Late') {
        attendanceByCol[col.key] = 'P';
        presentCount++;
      } else if (rec.status === 'Absent') {
        attendanceByCol[col.key] = 'A';
        absentCount++;
      } else {
        attendanceByCol[col.key] = '-';
      }
    });

    const totalMarked = presentCount + absentCount;
    const percentage = totalMarked > 0 ? Math.round((presentCount / totalMarked) * 10000) / 100 : 0;

    grandPresent += presentCount;
    grandAbsent += absentCount;

    return {
      index: idx + 1,
      studentId: stu.studentId,
      name: stu.name,
      rollNumber: stu.rollNumber || '',
      class: stu.class,
      section: stu.section,
      attendance: attendanceByCol,
      presentCount,
      absentCount,
      totalMarked,
      percentage: percentage.toFixed(1) + '%',
      rawPercentage: percentage,
    };
  });

  // ── MODE B: SUBJECT-WISE SUMMARY ──
  // For each student, compute percentage in each subject
  const subjectStudentRows = students.map((stu, idx) => {
    const stuRecords = records.filter(r => r.studentId === stu.studentId);
    const subjectStats = {};
    let stuTotalP = 0;
    let stuTotalA = 0;

    sortedSubjects.forEach(sub => {
      const subRecs = stuRecords.filter(r => r.subject === sub);
      const p = subRecs.filter(r => r.status === 'Present' || r.status === 'Late').length;
      const a = subRecs.filter(r => r.status === 'Absent').length;
      const tot = p + a;
      const pct = tot > 0 ? (Math.round((p / tot) * 10000) / 100).toFixed(1) + '%' : '-';
      subjectStats[sub] = { present: p, absent: a, total: tot, percentage: pct };
      stuTotalP += p;
      stuTotalA += a;
    });

    const grandStuTot = stuTotalP + stuTotalA;
    const overallPct = grandStuTot > 0 ? (Math.round((stuTotalP / grandStuTot) * 10000) / 100).toFixed(1) + '%' : '-';

    return {
      index: idx + 1,
      studentId: stu.studentId,
      name: stu.name,
      rollNumber: stu.rollNumber || '',
      class: stu.class,
      section: stu.section,
      subjects: subjectStats,
      totalPresent: stuTotalP,
      totalAbsent: stuTotalA,
      overallPercentage: overallPct,
      rawOverallPercentage: grandStuTot > 0 ? Math.round((stuTotalP / grandStuTot) * 10000) / 100 : 0
    };
  });

  // ── MODE C: DATE-WISE SUMMARY ──
  // Group all records by date, subject, period
  const dateWiseMap = new Map();
  records.forEach(r => {
    const key = `${r.date}|${r.subject || 'General'}|${r.period || 0}`;
    if (!dateWiseMap.has(key)) {
      dateWiseMap.set(key, {
        date: r.date,
        formattedDate: formatDisplayDate(r.date),
        subject: r.subject || 'General',
        period: r.period || 0,
        periodLabel: getPeriodLabel(r.period),
        present: 0,
        absent: 0,
      });
    }
    const item = dateWiseMap.get(key);
    if (r.status === 'Present' || r.status === 'Late') item.present++;
    else if (r.status === 'Absent') item.absent++;
  });

  const dateWiseRows = Array.from(dateWiseMap.values())
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.period || 0) - (b.period || 0);
    })
    .map((item, idx) => {
      const total = item.present + item.absent;
      const pct = total > 0 ? (Math.round((item.present / total) * 10000) / 100).toFixed(1) + '%' : '0.0%';
      return {
        index: idx + 1,
        date: item.date,
        formattedDate: item.formattedDate,
        subject: item.subject,
        period: item.periodLabel,
        present: item.present,
        absent: item.absent,
        total,
        percentage: pct,
      };
    });

  // ── OVERALL SUMMARY STATS ──
  const totalStudents = students.length;
  const totalClassesConducted = sortedSessions.length || sortedDates.length;
  const overallTotal = grandPresent + grandAbsent;
  const overallPercentageVal = overallTotal > 0 ? Math.round((grandPresent / overallTotal) * 10000) / 100 : 0;

  const dateRangeDisplay = (startDate && endDate)
    ? `${formatDisplayDate(startDate)} – ${formatDisplayDate(endDate)}`
    : (startDate ? `From ${formatDisplayDate(startDate)}` : (endDate ? `Until ${formatDisplayDate(endDate)}` : 'All Dates'));

  return {
    meta: {
      institutionName: 'EduConnect',
      reportTitle: 'EduConnect Attendance Report',
      class: className || 'All Classes',
      section: section || 'All Sections',
      subject: subject || 'All Subjects',
      period: period ? getPeriodLabel(period) : 'All Periods',
      dateRange: dateRangeDisplay,
      startDate,
      endDate,
      generatedDate: formatDisplayDate(new Date().toISOString().slice(0, 10)),
      viewMode,
    },
    summary: {
      totalStudents,
      totalClassesConducted,
      totalPresent: grandPresent,
      totalAbsent: grandAbsent,
      overallPercentage: overallPercentageVal.toFixed(1) + '%',
      rawPercentage: overallPercentageVal,
    },
    dailyGrid: {
      columns: gridColumns,
      rows: dailyStudentRows,
    },
    subjectWise: {
      subjects: sortedSubjects,
      rows: subjectStudentRows,
    },
    dateWise: {
      rows: dateWiseRows,
    },
  };
}

/**
 * Generate formatted Excel (.xlsx) buffer
 */
function generateExcelReport(reportData) {
  const wb = XLSX.utils.book_new();
  const { meta, summary, dailyGrid, subjectWise, dateWise } = reportData;

  // Sheet 1: Daily Attendance Grid
  const gridAoa = [];
  gridAoa.push(['EduConnect — Attendance Report']);
  gridAoa.push([]);
  gridAoa.push(['Class:', meta.class, 'Section:', meta.section, 'Subject:', meta.subject]);
  gridAoa.push(['Period:', meta.period, 'Date Range:', meta.dateRange, 'Generated On:', meta.generatedDate]);
  gridAoa.push([]);
  gridAoa.push([
    'Total Students:', summary.totalStudents,
    'Total Classes:', summary.totalClassesConducted,
    'Total Present:', summary.totalPresent,
    'Total Absent:', summary.totalAbsent,
    'Overall Attendance:', summary.overallPercentage
  ]);
  gridAoa.push([]);

  // Table header
  const headerRow = ['#', 'Student ID', 'Student Name'];
  dailyGrid.columns.forEach(c => headerRow.push(c.label));
  headerRow.push('Present', 'Absent', 'Total', 'Attendance %');
  gridAoa.push(headerRow);

  // Rows
  dailyGrid.rows.forEach(r => {
    const row = [r.index, r.studentId, r.name];
    dailyGrid.columns.forEach(c => row.push(r.attendance[c.key] || '-'));
    row.push(r.presentCount, r.absentCount, r.totalMarked, r.percentage);
    gridAoa.push(row);
  });

  const wsGrid = XLSX.utils.aoa_to_sheet(gridAoa);

  // Set widths
  const colWidths = [{ wch: 4 }, { wch: 14 }, { wch: 22 }];
  dailyGrid.columns.forEach(() => colWidths.push({ wch: 10 }));
  colWidths.push({ wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 14 });
  wsGrid['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(wb, wsGrid, 'Daily Attendance');

  // Sheet 2: Subject-Wise Summary (if multiple subjects exist)
  if (subjectWise.subjects && subjectWise.subjects.length > 0) {
    const subAoa = [];
    subAoa.push(['EduConnect — Subject-Wise Attendance Summary']);
    subAoa.push([]);
    subAoa.push(['Class:', meta.class, 'Section:', meta.section, 'Date Range:', meta.dateRange]);
    subAoa.push([]);
    const subHeader = ['#', 'Student ID', 'Student Name'];
    subjectWise.subjects.forEach(s => subHeader.push(`${s} %`));
    subHeader.push('Overall %');
    subAoa.push(subHeader);

    subjectWise.rows.forEach(r => {
      const row = [r.index, r.studentId, r.name];
      subjectWise.subjects.forEach(s => {
        row.push(r.subjects[s]?.percentage || '-');
      });
      row.push(r.overallPercentage);
      subAoa.push(row);
    });

    const wsSub = XLSX.utils.aoa_to_sheet(subAoa);
    const subColWidths = [{ wch: 4 }, { wch: 14 }, { wch: 22 }];
    subjectWise.subjects.forEach(() => subColWidths.push({ wch: 16 }));
    subColWidths.push({ wch: 14 });
    wsSub['!cols'] = subColWidths;

    XLSX.utils.book_append_sheet(wb, wsSub, 'Subject-Wise Summary');
  }

  // Sheet 3: Date-Wise Summary
  if (dateWise.rows && dateWise.rows.length > 0) {
    const dateAoa = [];
    dateAoa.push(['EduConnect — Date-Wise Attendance Summary']);
    dateAoa.push([]);
    dateAoa.push(['Class:', meta.class, 'Section:', meta.section, 'Subject:', meta.subject]);
    dateAoa.push([]);
    dateAoa.push(['#', 'Date', 'Subject', 'Period', 'Present', 'Absent', 'Total', 'Attendance %']);
    dateWise.rows.forEach(r => {
      dateAoa.push([r.index, r.formattedDate, r.subject, r.period, r.present, r.absent, r.total, r.percentage]);
    });
    const wsDate = XLSX.utils.aoa_to_sheet(dateAoa);
    wsDate['!cols'] = [{ wch: 4 }, { wch: 14 }, { wch: 18 }, { wch: 12 }, { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsDate, 'Date-Wise Summary');
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Generate printable PDF report using PDFKit
 */
function generatePdfReport(reportData, res) {
  const { meta, summary, dailyGrid, subjectWise, dateWise } = reportData;

  // Use landscape orientation if column count is large (> 6 dates) or viewMode is daily with many dates
  const isLandscape = dailyGrid.columns.length > 5 || meta.viewMode === 'daily';
  const doc = new PDFDocument({
    margin: 36,
    size: 'A4',
    layout: isLandscape ? 'landscape' : 'portrait'
  });

  doc.pipe(res);

  const pageWidth = isLandscape ? 841.89 : 595.28;
  const pageHeight = isLandscape ? 595.28 : 841.89;
  const margin = 36;
  const contentWidth = pageWidth - (margin * 2);

  // ── HEADER BANNER ──
  doc.rect(margin, margin, contentWidth, 54).fill('#001f54');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18)
     .text('EduConnect', margin + 14, margin + 10);
  doc.font('Helvetica').fontSize(10).fillColor('#93c5fd')
     .text('ATTENDANCE REPORT', margin + 14, margin + 32);

  doc.font('Helvetica').fontSize(9).fillColor('#e2e8f0')
     .text(`Generated: ${meta.generatedDate}`, margin + contentWidth - 160, margin + 22, { width: 145, align: 'right' });

  let y = margin + 64;

  // ── FILTER METADATA BLOCK ──
  doc.rect(margin, y, contentWidth, 34).fill('#f8fafc').stroke('#cbd5e1');
  doc.fillColor('#334155').font('Helvetica-Bold').fontSize(9);

  const colW = contentWidth / 4;
  doc.text(`Class: ${meta.class} (${meta.section})`, margin + 8, y + 6);
  doc.text(`Subject: ${meta.subject}`, margin + 8 + colW, y + 6);
  doc.text(`Period: ${meta.period}`, margin + 8 + (colW * 2), y + 6);
  doc.text(`Date Range: ${meta.dateRange}`, margin + 8 + (colW * 3), y + 6, { width: colW - 12 });

  y += 42;

  // ── SUMMARY CARDS ROW ──
  const cardW = (contentWidth - 36) / 5;
  const cardH = 38;
  const cards = [
    { label: 'TOTAL STUDENTS', val: summary.totalStudents, color: '#0284c7' },
    { label: 'CLASSES CONDUCTED', val: summary.totalClassesConducted, color: '#7c3aed' },
    { label: 'TOTAL PRESENT', val: summary.totalPresent, color: '#16a34a' },
    { label: 'TOTAL ABSENT', val: summary.totalAbsent, color: '#dc2626' },
    { label: 'OVERALL ATTENDANCE', val: summary.overallPercentage, color: '#0f766e' },
  ];

  cards.forEach((c, i) => {
    const cx = margin + (i * (cardW + 9));
    doc.rect(cx, y, cardW, cardH).fill('#ffffff').stroke('#e2e8f0');
    doc.rect(cx, y, cardW, 3).fill(c.color);
    doc.fillColor(c.color).font('Helvetica-Bold').fontSize(13)
       .text(String(c.val), cx + 6, y + 7, { width: cardW - 12, align: 'center' });
    doc.fillColor('#64748b').font('Helvetica').fontSize(6.5)
       .text(c.label, cx + 2, y + 24, { width: cardW - 4, align: 'center' });
  });

  y += 50;

  // ── CHOSEN VIEW TABLE ──
  if (meta.viewMode === 'subject' && subjectWise.subjects.length > 0) {
    // Subject-Wise Table
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text('Subject-Wise Attendance Percentage', margin, y);
    y += 16;

    const subCols = subjectWise.subjects;
    const sNameW = 140;
    const sIdW = 70;
    const remW = contentWidth - sNameW - sIdW;
    const subColW = Math.max(50, remW / (subCols.length + 1));

    // Header
    doc.rect(margin, y, contentWidth, 18).fill('#0f172a');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
    doc.text('Student ID', margin + 4, y + 5, { width: sIdW - 6 });
    doc.text('Student Name', margin + sIdW, y + 5, { width: sNameW - 6 });
    subCols.forEach((sc, i) => {
      doc.text(sc.slice(0, 10), margin + sIdW + sNameW + (i * subColW), y + 5, { width: subColW - 4, align: 'center' });
    });
    doc.text('Overall', margin + sIdW + sNameW + (subCols.length * subColW), y + 5, { width: subColW - 4, align: 'center' });
    y += 18;

    subjectWise.rows.forEach((r, idx) => {
      const rowBg = idx % 2 === 0 ? '#f8fafc' : '#ffffff';
      doc.rect(margin, y, contentWidth, 16).fill(rowBg).stroke('#f1f5f9');
      doc.fillColor('#1e293b').font('Helvetica').fontSize(7.5);
      doc.text(r.studentId, margin + 4, y + 4, { width: sIdW - 6 });
      doc.font('Helvetica-Bold').text(r.name, margin + sIdW, y + 4, { width: sNameW - 6 });

      doc.font('Helvetica');
      subCols.forEach((sc, i) => {
        const pct = r.subjects[sc]?.percentage || '-';
        doc.text(pct, margin + sIdW + sNameW + (i * subColW), y + 4, { width: subColW - 4, align: 'center' });
      });
      doc.font('Helvetica-Bold').fillColor('#0284c7')
         .text(r.overallPercentage, margin + sIdW + sNameW + (subCols.length * subColW), y + 4, { width: subColW - 4, align: 'center' });

      y += 16;
    });

  } else if (meta.viewMode === 'date' && dateWise.rows.length > 0) {
    // Date-Wise Table
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text('Date-Wise Attendance Sessions', margin, y);
    y += 16;

    const cols = ['Date', 'Subject', 'Period', 'Present', 'Absent', 'Total', 'Attendance %'];
    const wList = [90, 140, 90, 60, 60, 60, 90];
    const totalW = wList.reduce((a, b) => a + b, 0);

    doc.rect(margin, y, totalW, 18).fill('#0f172a');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
    let curX = margin;
    cols.forEach((col, i) => {
      doc.text(col, curX + 4, y + 5, { width: wList[i] - 8, align: i >= 3 ? 'center' : 'left' });
      curX += wList[i];
    });
    y += 18;

    dateWise.rows.forEach((r, idx) => {
      const rowBg = idx % 2 === 0 ? '#f8fafc' : '#ffffff';
      doc.rect(margin, y, totalW, 16).fill(rowBg).stroke('#f1f5f9');
      doc.fillColor('#1e293b').font('Helvetica').fontSize(8);
      let cx = margin;
      doc.text(r.formattedDate, cx + 4, y + 4, { width: wList[0] - 8 }); cx += wList[0];
      doc.text(r.subject, cx + 4, y + 4, { width: wList[1] - 8 }); cx += wList[1];
      doc.text(r.period, cx + 4, y + 4, { width: wList[2] - 8 }); cx += wList[2];
      doc.fillColor('#16a34a').text(String(r.present), cx + 4, y + 4, { width: wList[3] - 8, align: 'center' }); cx += wList[3];
      doc.fillColor('#dc2626').text(String(r.absent), cx + 4, y + 4, { width: wList[4] - 8, align: 'center' }); cx += wList[4];
      doc.fillColor('#1e293b').text(String(r.total), cx + 4, y + 4, { width: wList[5] - 8, align: 'center' }); cx += wList[5];
      doc.font('Helvetica-Bold').fillColor('#0284c7').text(r.percentage, cx + 4, y + 4, { width: wList[6] - 8, align: 'center' });
      y += 16;
    });

  } else {
    // Daily Grid Table (Default)
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text('Daily Attendance Records', margin, y);
    y += 16;

    const idColW = 70;
    const nameColW = 120;
    const statColW = 40; // Present, Absent, %
    const fixedW = idColW + nameColW + (statColW * 3);
    const dateColW = dailyGrid.columns.length > 0 ? Math.min(48, Math.max(26, (contentWidth - fixedW) / dailyGrid.columns.length)) : 30;
    const totalTableW = idColW + nameColW + (dailyGrid.columns.length * dateColW) + (statColW * 3);

    // Header
    doc.rect(margin, y, totalTableW, 18).fill('#0f172a');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5);
    doc.text('Student ID', margin + 4, y + 5, { width: idColW - 6 });
    doc.text('Student Name', margin + idColW, y + 5, { width: nameColW - 6 });

    dailyGrid.columns.forEach((col, i) => {
      doc.text(col.label, margin + idColW + nameColW + (i * dateColW), y + 5, { width: dateColW, align: 'center' });
    });

    const statStartX = margin + idColW + nameColW + (dailyGrid.columns.length * dateColW);
    doc.text('Pres', statStartX, y + 5, { width: statColW, align: 'center' });
    doc.text('Abs', statStartX + statColW, y + 5, { width: statColW, align: 'center' });
    doc.text('%', statStartX + (statColW * 2), y + 5, { width: statColW, align: 'center' });
    y += 18;

    dailyGrid.rows.forEach((r, idx) => {
      // Auto page break if needed
      if (y + 20 > pageHeight - margin) {
        doc.addPage({ margin, size: 'A4', layout: isLandscape ? 'landscape' : 'portrait' });
        y = margin;
      }

      const rowBg = idx % 2 === 0 ? '#f8fafc' : '#ffffff';
      doc.rect(margin, y, totalTableW, 16).fill(rowBg).stroke('#f1f5f9');
      doc.fillColor('#1e293b').font('Helvetica').fontSize(7);
      doc.text(r.studentId, margin + 4, y + 4, { width: idColW - 6 });
      doc.font('Helvetica-Bold').text(r.name, margin + idColW, y + 4, { width: nameColW - 6 });

      dailyGrid.columns.forEach((col, i) => {
        const val = r.attendance[col.key] || '-';
        const cx = margin + idColW + nameColW + (i * dateColW);
        if (val === 'P') {
          doc.fillColor('#16a34a').font('Helvetica-Bold').text('P', cx, y + 4, { width: dateColW, align: 'center' });
        } else if (val === 'A') {
          doc.fillColor('#dc2626').font('Helvetica-Bold').text('A', cx, y + 4, { width: dateColW, align: 'center' });
        } else {
          doc.fillColor('#94a3b8').font('Helvetica').text('-', cx, y + 4, { width: dateColW, align: 'center' });
        }
      });

      doc.font('Helvetica-Bold').fillColor('#16a34a').text(String(r.presentCount), statStartX, y + 4, { width: statColW, align: 'center' });
      doc.fillColor('#dc2626').text(String(r.absentCount), statStartX + statColW, y + 4, { width: statColW, align: 'center' });
      doc.fillColor('#0284c7').text(r.percentage, statStartX + (statColW * 2), y + 4, { width: statColW, align: 'center' });

      y += 16;
    });
  }

  // ── FOOTER ──
  doc.fontSize(7).fillColor('#94a3b8').font('Helvetica')
     .text(`EduConnect Attendance System • Generated on ${new Date().toLocaleString('en-IN')}`, margin, pageHeight - margin + 10, { width: contentWidth, align: 'center' });

  doc.end();
}

/**
 * Generate standard CSV string with UTF-8 BOM
 */
function generateCsvReport(reportData) {
  const { meta, summary, dailyGrid, subjectWise, dateWise } = reportData;
  const lines = [];

  // Helper to escape CSV values
  function esc(val) {
    if (val === undefined || val === null) return '""';
    const s = String(val).replace(/"/g, '""');
    return `"${s}"`;
  }

  // Header metadata
  lines.push([esc('EduConnect Attendance Report')].join(','));
  lines.push([esc('Class:'), esc(meta.class), esc('Section:'), esc(meta.section), esc('Subject:'), esc(meta.subject)].join(','));
  lines.push([esc('Period:'), esc(meta.period), esc('Date Range:'), esc(meta.dateRange), esc('Generated Date:'), esc(meta.generatedDate)].join(','));
  lines.push([]);
  lines.push([
    esc('Total Students:'), esc(summary.totalStudents),
    esc('Classes Conducted:'), esc(summary.totalClassesConducted),
    esc('Total Present:'), esc(summary.totalPresent),
    esc('Total Absent:'), esc(summary.totalAbsent),
    esc('Overall Attendance:'), esc(summary.overallPercentage)
  ].join(','));
  lines.push([]);

  if (meta.viewMode === 'subject' && subjectWise.subjects.length > 0) {
    // Subject-Wise Mode
    const headers = ['#', 'Student ID', 'Student Name'];
    subjectWise.subjects.forEach(s => headers.push(`${s} %`));
    headers.push('Overall %');
    lines.push(headers.map(esc).join(','));

    subjectWise.rows.forEach(r => {
      const row = [r.index, r.studentId, r.name];
      subjectWise.subjects.forEach(s => row.push(r.subjects[s]?.percentage || '-'));
      row.push(r.overallPercentage);
      lines.push(row.map(esc).join(','));
    });

  } else if (meta.viewMode === 'date' && dateWise.rows.length > 0) {
    // Date-Wise Mode
    lines.push(['#', 'Date', 'Subject', 'Period', 'Present', 'Absent', 'Total', 'Attendance %'].map(esc).join(','));
    dateWise.rows.forEach(r => {
      lines.push([r.index, r.formattedDate, r.subject, r.period, r.present, r.absent, r.total, r.percentage].map(esc).join(','));
    });

  } else {
    // Daily Grid Mode
    const headers = ['#', 'Student ID', 'Student Name'];
    dailyGrid.columns.forEach(c => headers.push(c.label));
    headers.push('Present', 'Absent', 'Total Classes', 'Attendance %');
    lines.push(headers.map(esc).join(','));

    dailyGrid.rows.forEach(r => {
      const row = [r.index, r.studentId, r.name];
      dailyGrid.columns.forEach(c => row.push(r.attendance[c.key] || '-'));
      row.push(r.presentCount, r.absentCount, r.totalMarked, r.percentage);
      lines.push(row.map(esc).join(','));
    });
  }

  // Prepend UTF-8 BOM for Excel compatibility
  return '\uFEFF' + lines.join('\r\n');
}

module.exports = {
  buildAttendanceReportData,
  generateExcelReport,
  generatePdfReport,
  generateCsvReport,
  getSafeReportFilename,
  formatDisplayDate,
  formatShortDate,
  getPeriodLabel,
};
