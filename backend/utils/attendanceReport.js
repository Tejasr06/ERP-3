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

  // ── MODE B: SUBJECT-WISE / INSTITUTIONAL SUMMARY ──
  // Calculate total classes conducted per subject
  const subjectConductedMap = {};
  sortedSubjects.forEach(sub => {
    // Unique session timestamps/periods for this subject
    const subSessions = new Set(
      records.filter(r => r.subject === sub).map(r => `${r.date}|${r.period || 0}`)
    );
    let maxMarked = 0;
    students.forEach(stu => {
      const cnt = records.filter(r => r.studentId === stu.studentId && r.subject === sub).length;
      if (cnt > maxMarked) maxMarked = cnt;
    });
    subjectConductedMap[sub] = Math.max(subSessions.size, maxMarked);
  });

  const totalConductedAllSubjects = Object.values(subjectConductedMap).reduce((a, b) => a + b, 0);

  // For each student, compute attendance in each subject
  const subjectStudentRows = students.map((stu, idx) => {
    const stuRecords = records.filter(r => r.studentId === stu.studentId);
    const subjectStats = {};
    let stuTotalP = 0;
    let stuTotalA = 0;

    sortedSubjects.forEach(sub => {
      const subRecs = stuRecords.filter(r => r.subject === sub);
      const p = subRecs.filter(r => r.status === 'Present' || r.status === 'Late').length;
      const a = subRecs.filter(r => r.status === 'Absent').length;
      const conducted = subjectConductedMap[sub] != null ? subjectConductedMap[sub] : (p + a);
      const tot = p + a;

      let pctVal = 0;
      let pctFormatted = '-';
      let pctWithSign = '-';

      // Attendance percentage calculated strictly on the basis of: (Classes Attended / Classes Taken) * 100
      if (conducted > 0) {
        if (tot > 0) {
          pctVal = Math.round((p / conducted) * 10000) / 100;
          pctFormatted = (pctVal % 1 === 0 ? pctVal.toString() : parseFloat(pctVal.toFixed(2)).toString());
          pctWithSign = (pctVal % 1 === 0 ? `${pctVal}.0%` : `${pctVal.toFixed(1)}%`);
        } else {
          // If classes were conducted but no attendance sessions recorded for this student
          pctVal = 0;
          pctFormatted = '-';
          pctWithSign = '-';
        }
      } else if (tot > 0) {
        pctVal = Math.round((p / tot) * 10000) / 100;
        pctFormatted = (pctVal % 1 === 0 ? pctVal.toString() : parseFloat(pctVal.toFixed(2)).toString());
        pctWithSign = (pctVal % 1 === 0 ? `${pctVal}.0%` : `${pctVal.toFixed(1)}%`);
      }

      subjectStats[sub] = {
        present: p,
        absent: a,
        attended: p,
        conducted,
        classesAttended: p,
        classesTaken: conducted,
        total: tot,
        percentage: pctWithSign,
        pctFormatted,
        rawPct: pctVal
      };
      stuTotalP += p;
      stuTotalA += a;
    });

    const grandStuTot = stuTotalP + stuTotalA;
    const overallVal = grandStuTot > 0 ? Math.round((stuTotalP / grandStuTot) * 10000) / 100 : 0;
    const overallPctFormatted = (overallVal % 1 === 0 ? overallVal.toString() : parseFloat(overallVal.toFixed(2)).toString());
    const overallPctWithSign = grandStuTot > 0 ? (overallVal % 1 === 0 ? `${overallVal}.0%` : `${overallVal.toFixed(1)}%`) : '-';

    return {
      index: idx + 1,
      sNo: idx + 1,
      studentId: stu.studentId,
      usn: stu.studentId,
      name: stu.name,
      rollNumber: stu.rollNumber || '',
      class: stu.class,
      section: stu.section,
      subjects: subjectStats,
      classesAttended: stuTotalP,
      classesTaken: grandStuTot,
      totalClassesAttended: stuTotalP,
      totalClassesTaken: grandStuTot,
      totalPresent: stuTotalP,
      totalAttended: stuTotalP,
      totalAbsent: stuTotalA,
      totalConducted: totalConductedAllSubjects,
      attAvg: overallPctFormatted,
      rawAttAvg: overallVal,
      overallPercentage: overallPctWithSign,
      rawOverallPercentage: overallVal
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
      conductedMap: subjectConductedMap,
      totalConducted: totalConductedAllSubjects,
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
/**
 * Generate formatted Excel (.xlsx) buffer
 */
function generateExcelReport(reportData) {
  const wb = XLSX.utils.book_new();
  const { meta, summary, dailyGrid, subjectWise, dateWise } = reportData;
  const subjects = subjectWise.subjects || [];
  const conductedMap = subjectWise.conductedMap || {};

  // ═════════════════════════════════════════════════════════════════════
  // SHEET 1: CONSOLIDATED INSTITUTIONAL ATTENDANCE REPORT
  // Matches exact academic department specification (image layout):
  // Row 0: Subject Code (A1:C1 merged) | Sub1 (2 cols) | Sub2 (2 cols) | ... | Att Avg
  // Row 1: No. of Classes Conducted (A2:C2 merged) | C1 (2 cols) | C2 (2 cols) | ... | ""
  // Row 2: S. No. | USN | Name of the Student | Attended | Att % | Attended | Att % | ... | Att Avg
  // Rows 3+: Student rows: 1 | 1SB23IS001 | ADITYA . | 23 | 76.67 | ... | 73.39
  // ═════════════════════════════════════════════════════════════════════
  const consAoa = [];
  const merges = [];
  const colWidths = [
    { wch: 6 },  // S. No.
    { wch: 16 }, // USN
    { wch: 30 }, // Name of the Student
  ];

  const row0 = ['Subject Code', '', ''];
  const row1 = ['No. of Classes Taken', '', ''];
  const row2 = ['S. No.', 'USN', 'Name of the Student'];

  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } });
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 2 } });

  subjects.forEach((sub, i) => {
    const colIdx = 3 + (i * 2);
    row0.push(sub, '');
    merges.push({ s: { r: 0, c: colIdx }, e: { r: 0, c: colIdx + 1 } });

    const conducted = conductedMap[sub] != null ? conductedMap[sub] : 0;
    row1.push(conducted, '');
    merges.push({ s: { r: 1, c: colIdx }, e: { r: 1, c: colIdx + 1 } });

    row2.push('Attended', 'Att %');
    colWidths.push({ wch: 10 }, { wch: 10 });
  });

  const lastColIdx = 3 + (subjects.length * 2);
  row0.push('Att Avg');
  row1.push('');
  row2.push('Att Avg');
  merges.push({ s: { r: 0, c: lastColIdx }, e: { r: 1, c: lastColIdx } });
  colWidths.push({ wch: 12 });

  consAoa.push(row0);
  consAoa.push(row1);
  consAoa.push(row2);

  // Student data rows
  subjectWise.rows.forEach((r, idx) => {
    const row = [
      idx + 1,
      r.usn || r.studentId,
      r.name
    ];
    subjects.forEach(sub => {
      const sInfo = r.subjects && r.subjects[sub];
      row.push(sInfo ? sInfo.present : 0);
      if (!sInfo || sInfo.pctFormatted === '-') {
        row.push('-');
      } else {
        row.push(sInfo.rawPct);
      }
    });
    row.push(r.rawAttAvg != null ? r.rawAttAvg : 0);
    consAoa.push(row);
  });

  const wsCons = XLSX.utils.aoa_to_sheet(consAoa);
  wsCons['!merges'] = merges;
  wsCons['!cols'] = colWidths;
  XLSX.utils.book_append_sheet(wb, wsCons, 'Attendance Report');

  // ═════════════════════════════════════════════════════════════════════
  // SHEET 2: DAILY ATTENDANCE GRID (Session-by-session log)
  // ═════════════════════════════════════════════════════════════════════
  if (dailyGrid && dailyGrid.columns && dailyGrid.columns.length > 0) {
    const gridAoa = [];
    gridAoa.push(['EduConnect — Daily Attendance Grid']);
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

    const headerRow = ['#', 'USN', 'Student Name'];
    dailyGrid.columns.forEach(c => headerRow.push(c.label));
    headerRow.push('Present', 'Absent', 'Total', 'Attendance %');
    gridAoa.push(headerRow);

    dailyGrid.rows.forEach(r => {
      const row = [r.index, r.studentId, r.name];
      dailyGrid.columns.forEach(c => row.push(r.attendance[c.key] || '-'));
      row.push(r.presentCount, r.absentCount, r.totalMarked, r.percentage);
      gridAoa.push(row);
    });

    const wsGrid = XLSX.utils.aoa_to_sheet(gridAoa);
    const dWidths = [{ wch: 4 }, { wch: 14 }, { wch: 22 }];
    dailyGrid.columns.forEach(() => dWidths.push({ wch: 10 }));
    dWidths.push({ wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 14 });
    wsGrid['!cols'] = dWidths;
    XLSX.utils.book_append_sheet(wb, wsGrid, 'Daily Grid');
  }

  // ═════════════════════════════════════════════════════════════════════
  // SHEET 3: DATE-WISE SUMMARY (if sessions exist)
  // ═════════════════════════════════════════════════════════════════════
  if (dateWise && dateWise.rows && dateWise.rows.length > 0) {
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
 * Helper to split date session into concise non-wrapping lines for PDF headers
 */
function getPdfDateHeader(col, colW) {
  let dayStr = '';
  let monthStr = '';
  let periodStr = '';

  if (col.date) {
    const parts = col.date.split('-');
    if (parts.length === 3) {
      dayStr = parts[2];
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      monthStr = months[parseInt(parts[1], 10) - 1] || '';
    }
  }

  if (!dayStr && col.label) {
    const m = col.label.match(/^(\d{1,2})\s*([A-Za-z]{3})?/);
    if (m) {
      dayStr = m[1];
      monthStr = m[2] || '';
    } else {
      dayStr = col.label.slice(0, 4);
    }
  }

  if (col.period) {
    periodStr = `P${col.period}`;
  } else if (col.label) {
    const pm = col.label.match(/\(P(\d+)\)/);
    if (pm) periodStr = `P${pm[1]}`;
  }

  if (colW >= 34) {
    return {
      line1: `${dayStr} ${monthStr}`.trim(),
      line2: periodStr
    };
  }

  return {
    line1: dayStr || col.label.slice(0, 3),
    line2: periodStr || monthStr
  };
}

/**
 * Generate printable PDF report using PDFKit
 */
function generatePdfReport(reportData, res) {
  const { meta, summary, dailyGrid, subjectWise, dateWise } = reportData;
  const subjects = subjectWise.subjects || [];
  const conductedMap = subjectWise.conductedMap || {};

  const margin = 20;
  const doc = new PDFDocument({
    margin,
    size: 'A4',
    layout: 'landscape'
  });

  doc.pipe(res);

  const pageWidth = 841.89;
  const pageHeight = 595.28;
  const contentWidth = pageWidth - (margin * 2); // 801.89 pt

  // ── INSTITUTION HEADER BANNER ──
  const instName = process.env.SCHOOL_NAME || meta.institutionName || 'Sri Sairam International School';
  doc.rect(margin, margin, contentWidth, 38).fill('#001f54');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14)
     .text(instName.toUpperCase(), margin + 12, margin + 7);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#93c5fd')
     .text('ATTENDANCE REPORT — CONSOLIDATED SUBJECT MATRIX', margin + 12, margin + 24);

  doc.font('Helvetica').fontSize(7.5).fillColor('#e2e8f0')
     .text(`Generated: ${meta.generatedDate}`, margin + contentWidth - 160, margin + 14, { width: 150, align: 'right' });

  let y = margin + 44;

  // ── METADATA BAR ──
  doc.rect(margin, y, contentWidth, 20).fill('#f8fafc').stroke('#cbd5e1');
  doc.fillColor('#334155').font('Helvetica-Bold').fontSize(7.5);
  const metaColW = contentWidth / 4;
  doc.text(`Class: ${meta.class} (${meta.section})`, margin + 6, y + 6, { width: metaColW - 10 });
  doc.text(`Subject Filter: ${meta.subject}`, margin + 6 + metaColW, y + 6, { width: metaColW - 10 });
  doc.text(`Date Range: ${meta.dateRange}`, margin + 6 + (metaColW * 2), y + 6, { width: metaColW - 10 });
  doc.text(`Total Students: ${summary.totalStudents}  |  Avg: ${summary.overallPercentage}`, margin + 6 + (metaColW * 3), y + 6, { width: metaColW - 10 });

  y += 26;

  // Check if we should render institutional multi-subject format
  // Render institutional multi-subject format by default or whenever subjectWise exists
  const useInstitutional = (meta.viewMode === 'subject' || subjects.length > 0) && meta.viewMode !== 'date';

  if (useInstitutional && subjects.length > 0) {
    // ═════════════════════════════════════════════════════════════════════
    // INSTITUTIONAL MULTI-SUBJECT ATTENDANCE TABLE (Image Match)
    // ═════════════════════════════════════════════════════════════════════
    const colSNoW = 26;
    const colUsnW = 68;
    const colNameW = 110;
    const colAvgW = 42;
    const fixedW = colSNoW + colUsnW + colNameW + colAvgW; // 246 pt
    const remW = contentWidth - fixedW; // ~555.89 pt

    const N = subjects.length;
    const subW = Math.max(34, remW / N);
    const attW = Math.floor(subW / 2);
    const pctW = subW - attW;
    const tableW = Math.min(contentWidth, colSNoW + colUsnW + colNameW + (N * subW) + colAvgW);

    const hdrH1 = 18;
    const hdrH2 = 18;
    const hdrH3 = 18;
    const totalHdrH = hdrH1 + hdrH2 + hdrH3;
    const rowH = 14;

    const drawTableHeader = (curY) => {
      // ── Header Row 1: Subject Code ──
      const mergedLeftW = colSNoW + colUsnW + colNameW;
      doc.rect(margin, curY, mergedLeftW, hdrH1).fillAndStroke('#f1f5f9', '#000000');
      doc.fillColor('#000000').font('Helvetica-Bold').fontSize(8)
         .text('Subject Code', margin, curY + 5, { width: mergedLeftW, align: 'center' });

      subjects.forEach((sub, i) => {
        const cx = margin + mergedLeftW + (i * subW);
        doc.rect(cx, curY, subW, hdrH1).fillAndStroke('#f1f5f9', '#000000');
        doc.fillColor('#000000').font('Helvetica-Bold').fontSize(6.5)
           .text(sub, cx + 1, curY + 5, { width: subW - 2, align: 'center' });
      });

      const avgX = margin + mergedLeftW + (N * subW);
      doc.rect(avgX, curY, colAvgW, hdrH1 + hdrH2).fillAndStroke('#f1f5f9', '#000000');
      doc.fillColor('#000000').font('Helvetica-Bold').fontSize(7.5)
         .text('Att\nAvg', avgX, curY + 8, { width: colAvgW, align: 'center' });

      // ── Header Row 2: No. of Classes Taken ──
      const curY2 = curY + hdrH1;
      doc.rect(margin, curY2, mergedLeftW, hdrH2).fillAndStroke('#ffffff', '#000000');
      doc.fillColor('#000000').font('Helvetica-Bold').fontSize(8)
         .text('No. of Classes Taken', margin, curY2 + 5, { width: mergedLeftW, align: 'center' });

      subjects.forEach((sub, i) => {
        const cx = margin + mergedLeftW + (i * subW);
        const conducted = conductedMap[sub] != null ? conductedMap[sub] : 0;
        doc.rect(cx, curY2, subW, hdrH2).fillAndStroke('#ffffff', '#000000');
        doc.fillColor('#000000').font('Helvetica-Bold').fontSize(7.5)
           .text(String(conducted), cx, curY2 + 5, { width: subW, align: 'center' });
      });

      // ── Header Row 3: Sub-headers ──
      const curY3 = curY2 + hdrH2;
      doc.rect(margin, curY3, colSNoW, hdrH3).fillAndStroke('#f8fafc', '#000000');
      doc.fillColor('#000000').font('Helvetica-Bold').fontSize(6.5)
         .text('S. No.', margin, curY3 + 5, { width: colSNoW, align: 'center' });

      doc.rect(margin + colSNoW, curY3, colUsnW, hdrH3).fillAndStroke('#f8fafc', '#000000');
      doc.fillColor('#000000').font('Helvetica-Bold').fontSize(6.5)
         .text('USN', margin + colSNoW, curY3 + 5, { width: colUsnW, align: 'center' });

      doc.rect(margin + colSNoW + colUsnW, curY3, colNameW, hdrH3).fillAndStroke('#f8fafc', '#000000');
      doc.fillColor('#000000').font('Helvetica-Bold').fontSize(6.5)
         .text('Name of the Student', margin + colSNoW + colUsnW + 3, curY3 + 5, { width: colNameW - 6, align: 'left' });

      subjects.forEach((sub, i) => {
        const cx = margin + mergedLeftW + (i * subW);
        doc.rect(cx, curY3, attW, hdrH3).fillAndStroke('#f8fafc', '#000000');
        doc.fillColor('#000000').font('Helvetica-Bold').fontSize(6)
           .text('Attended', cx, curY3 + 5, { width: attW, align: 'center' });

        doc.rect(cx + attW, curY3, pctW, hdrH3).fillAndStroke('#f8fafc', '#000000');
        doc.fillColor('#000000').font('Helvetica-Bold').fontSize(6)
           .text('Att %', cx + attW, curY3 + 5, { width: pctW, align: 'center' });
      });

      doc.rect(avgX, curY3, colAvgW, hdrH3).fillAndStroke('#f8fafc', '#000000');
      doc.fillColor('#000000').font('Helvetica-Bold').fontSize(6.5)
         .text('Att Avg', avgX, curY3 + 5, { width: colAvgW, align: 'center' });
    };

    drawTableHeader(y);
    y += totalHdrH;

    // ── Student Rows ──
    subjectWise.rows.forEach((r, idx) => {
      if (y + rowH > pageHeight - margin - 20) {
        doc.addPage({ margin, size: 'A4', layout: 'landscape' });
        y = margin;
        drawTableHeader(y);
        y += totalHdrH;
      }

      const rowBg = idx % 2 === 0 ? '#ffffff' : '#fbfcfe';
      let curX = margin;

      // S. No.
      doc.rect(curX, y, colSNoW, rowH).fillAndStroke(rowBg, '#000000');
      doc.fillColor('#000000').font('Helvetica').fontSize(6.5)
         .text(String(idx + 1), curX, y + 4, { width: colSNoW, align: 'center' });
      curX += colSNoW;

      // USN
      doc.rect(curX, y, colUsnW, rowH).fillAndStroke(rowBg, '#000000');
      doc.fillColor('#000000').font('Helvetica-Bold').fontSize(6.5)
         .text(r.usn || r.studentId, curX, y + 4, { width: colUsnW, align: 'center' });
      curX += colUsnW;

      // Name
      doc.rect(curX, y, colNameW, rowH).fillAndStroke(rowBg, '#000000');
      doc.fillColor('#000000').font('Helvetica').fontSize(6.5)
         .text(r.name, curX + 3, y + 4, { width: colNameW - 6, align: 'left' });
      curX += colNameW;

      // Subjects
      subjects.forEach(sub => {
        const sInfo = r.subjects && r.subjects[sub];
        const att = sInfo ? sInfo.present : 0;
        const pct = sInfo && sInfo.pctFormatted !== '-' ? sInfo.pctFormatted : '-';

        doc.rect(curX, y, attW, rowH).fillAndStroke(rowBg, '#000000');
        doc.fillColor('#000000').font('Helvetica').fontSize(6.5)
           .text(String(att), curX, y + 4, { width: attW, align: 'center' });
        curX += attW;

        doc.rect(curX, y, pctW, rowH).fillAndStroke(rowBg, '#000000');
        doc.fillColor('#000000').font('Helvetica').fontSize(6.5)
           .text(String(pct), curX, y + 4, { width: pctW, align: 'center' });
        curX += pctW;
      });

      // Att Avg
      doc.rect(curX, y, colAvgW, rowH).fillAndStroke(rowBg, '#000000');
      doc.fillColor('#000000').font('Helvetica-Bold').fontSize(6.5)
         .text(String(r.attAvg != null ? r.attAvg : '-'), curX, y + 4, { width: colAvgW, align: 'center' });

      y += rowH;
    });

  } else if (meta.viewMode === 'date' && dateWise && dateWise.rows && dateWise.rows.length > 0) {
    // Date-Wise Table
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text('Date-Wise Attendance Sessions', margin, y);
    y += 16;

    const cols = ['Date', 'Subject', 'Period', 'Present', 'Absent', 'Total', 'Attendance %'];
    const wList = [95, 140, 90, 65, 65, 65, 95];
    const totalW = Math.min(contentWidth, wList.reduce((a, b) => a + b, 0));

    doc.rect(margin, y, totalW, 20).fill('#0f172a');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
    let curX = margin;
    cols.forEach((col, i) => {
      doc.text(col, curX + 4, y + 6, { width: wList[i] - 8, align: i >= 3 ? 'center' : 'left' });
      curX += wList[i];
    });
    y += 20;

    dateWise.rows.forEach((r, idx) => {
      if (y + 16 > pageHeight - margin - 20) {
        doc.addPage({ margin, size: 'A4', layout: 'landscape' });
        y = margin;
      }
      const rowBg = idx % 2 === 0 ? '#f8fafc' : '#ffffff';
      doc.rect(margin, y, totalW, 16).fill(rowBg);
      doc.rect(margin, y + 15.5, totalW, 0.5).fill('#e2e8f0');

      doc.fillColor('#1e293b').font('Helvetica').fontSize(7.5);
      let cx = margin;
      doc.text(r.formattedDate, cx + 4, y + 4, { width: wList[0] - 8 }); cx += wList[0];
      doc.text(r.subject, cx + 4, y + 4, { width: wList[1] - 8 }); cx += wList[1];
      doc.text(r.period, cx + 4, y + 4, { width: wList[2] - 8 }); cx += wList[2];
      doc.fillColor('#059669').font('Helvetica-Bold').text(String(r.present), cx + 4, y + 4, { width: wList[3] - 8, align: 'center' }); cx += wList[3];
      doc.fillColor('#dc2626').text(String(r.absent), cx + 4, y + 4, { width: wList[4] - 8, align: 'center' }); cx += wList[4];
      doc.fillColor('#64748b').font('Helvetica').text(String(r.total), cx + 4, y + 4, { width: wList[5] - 8, align: 'center' }); cx += wList[5];
      doc.font('Helvetica-Bold').fillColor('#001f54').text(r.percentage, cx + 4, y + 4, { width: wList[6] - 8, align: 'center' });
      y += 16;
    });

  } else {
    // Daily Grid Fallback
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text('Daily Attendance Records', margin, y);
    y += 16;

    const idColW = 60;
    const nameColW = 95;
    const statPColW = 24;
    const statAColW = 24;
    const statTColW = 24;
    const statPctColW = 32;
    const summaryW = statPColW + statAColW + statTColW + statPctColW;

    const totalSessions = dailyGrid.columns.length;
    const MAX_COLS_PER_PAGE = 24;
    const columnChunks = [];
    if (totalSessions <= MAX_COLS_PER_PAGE) {
      columnChunks.push(dailyGrid.columns);
    } else {
      for (let i = 0; i < totalSessions; i += MAX_COLS_PER_PAGE) {
        columnChunks.push(dailyGrid.columns.slice(i, i + MAX_COLS_PER_PAGE));
      }
    }

    columnChunks.forEach((chunkCols, chunkIdx) => {
      const isFirstChunk = chunkIdx === 0;
      const isLastChunk = chunkIdx === columnChunks.length - 1;

      if (!isFirstChunk) {
        doc.addPage({ margin, size: 'A4', layout: 'landscape' });
        y = margin;
        doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11)
           .text(`Daily Attendance Records (Part ${chunkIdx + 1} of ${columnChunks.length})`, margin, y);
        y += 16;
      }

      const hasSummary = isLastChunk;
      const fixedW = idColW + nameColW + (hasSummary ? summaryW : 0);
      const remainingForDates = contentWidth - fixedW;
      const dateColW = chunkCols.length > 0 ? Math.min(48, Math.max(18, remainingForDates / chunkCols.length)) : 24;
      const tableW = idColW + nameColW + (chunkCols.length * dateColW) + (hasSummary ? summaryW : 0);

      const headerHeight = 24;
      const rowHeight = 15;

      const drawHeader = (curY) => {
        doc.rect(margin, curY, tableW, headerHeight).fill('#0f172a');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7);
        doc.text('Student ID', margin + 3, curY + 8, { width: idColW - 6 });
        doc.text('Student Name', margin + idColW, curY + 8, { width: nameColW - 6 });

        chunkCols.forEach((col, i) => {
          const cx = margin + idColW + nameColW + (i * dateColW);
          const hdr = getPdfDateHeader(col, dateColW);
          doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(6);
          doc.text(hdr.line1, cx, curY + 4, { width: dateColW, align: 'center' });
          if (hdr.line2) {
            doc.fillColor('#93c5fd').font('Helvetica-Bold').fontSize(5.5);
            doc.text(hdr.line2, cx, curY + 13, { width: dateColW, align: 'center' });
          }
        });

        if (hasSummary) {
          const sX = margin + idColW + nameColW + (chunkCols.length * dateColW);
          doc.fillColor('#4ade80').font('Helvetica-Bold').fontSize(6.5).text('Pres', sX, curY + 8, { width: statPColW, align: 'center' });
          doc.fillColor('#f87171').font('Helvetica-Bold').fontSize(6.5).text('Abs', sX + statPColW, curY + 8, { width: statAColW, align: 'center' });
          doc.fillColor('#cbd5e1').font('Helvetica-Bold').fontSize(6.5).text('Tot', sX + statPColW + statAColW, curY + 8, { width: statTColW, align: 'center' });
          doc.fillColor('#38bdf8').font('Helvetica-Bold').fontSize(6.5).text('%', sX + statPColW + statAColW + statTColW, curY + 8, { width: statPctColW, align: 'center' });
        }
      };

      drawHeader(y);
      y += headerHeight;

      dailyGrid.rows.forEach((r, idx) => {
        if (y + rowHeight > pageHeight - margin - 20) {
          doc.addPage({ margin, size: 'A4', layout: 'landscape' });
          y = margin;
          drawHeader(y);
          y += headerHeight;
        }

        const rowBg = idx % 2 === 0 ? '#f8fafc' : '#ffffff';
        doc.rect(margin, y, tableW, rowHeight).fill(rowBg);
        doc.rect(margin, y + rowHeight - 0.5, tableW, 0.5).fill('#e2e8f0');

        doc.fillColor('#1e293b').font('Helvetica').fontSize(6.5);
        doc.text(r.studentId, margin + 3, y + 4, { width: idColW - 6 });
        doc.font('Helvetica-Bold').text(r.name, margin + idColW, y + 4, { width: nameColW - 6 });

        chunkCols.forEach((col, i) => {
          const val = r.attendance[col.key] || '-';
          const cx = margin + idColW + nameColW + (i * dateColW);
          if (val === 'P') {
            doc.fillColor('#059669').font('Helvetica-Bold').fontSize(7).text('P', cx, y + 4, { width: dateColW, align: 'center' });
          } else if (val === 'A') {
            doc.fillColor('#dc2626').font('Helvetica-Bold').fontSize(7).text('A', cx, y + 4, { width: dateColW, align: 'center' });
          } else {
            doc.fillColor('#cbd5e1').font('Helvetica').fontSize(6.5).text('—', cx, y + 4, { width: dateColW, align: 'center' });
          }
        });

        if (hasSummary) {
          const sX = margin + idColW + nameColW + (chunkCols.length * dateColW);
          doc.font('Helvetica-Bold').fontSize(6.5);
          doc.fillColor('#059669').text(String(r.presentCount), sX, y + 4, { width: statPColW, align: 'center' });
          doc.fillColor('#dc2626').text(String(r.absentCount), sX + statPColW, y + 4, { width: statAColW, align: 'center' });
          doc.fillColor('#64748b').text(String(r.totalMarked), sX + statPColW + statAColW, y + 4, { width: statTColW, align: 'center' });
          doc.fillColor('#001f54').text(r.percentage, sX + statPColW + statAColW + statTColW, y + 4, { width: statPctColW, align: 'center' });
        }

        y += rowHeight;
      });
    });
  }

  // ── FOOTER ──
  doc.fontSize(7).fillColor('#64748b').font('Helvetica')
     .text(`EduConnect Attendance System • Institutional Report Export • Generated on ${new Date().toLocaleString('en-IN')}`, margin, pageHeight - margin + 8, { width: contentWidth, align: 'center' });

  doc.end();
}

/**
 * Generate standard CSV string with UTF-8 BOM
 * Formats matching institutional multi-subject attendance layout
 */
function generateCsvReport(reportData) {
  const { meta, summary, subjectWise } = reportData;
  const subjects = subjectWise.subjects || [];
  const conductedMap = subjectWise.conductedMap || {};
  const lines = [];

  function esc(val) {
    if (val === undefined || val === null) return '""';
    const s = String(val).replace(/"/g, '""');
    return `"${s}"`;
  }

  // Header Metadata block
  lines.push([esc('EduConnect Attendance Report')].join(','));
  lines.push([esc('Class:'), esc(meta.class), esc('Section:'), esc(meta.section), esc('Date Range:'), esc(meta.dateRange)].join(','));
  lines.push([]);

  // ── Row 1: Subject Code ──
  const r1 = [esc('Subject Code'), '', ''];
  subjects.forEach(s => {
    r1.push(esc(s), '');
  });
  r1.push(esc('Att Avg'));
  lines.push(r1.join(','));

  // ── Row 2: No. of Classes Taken ──
  const r2 = [esc('No. of Classes Taken'), '', ''];
  subjects.forEach(s => {
    r2.push(esc(conductedMap[s] != null ? conductedMap[s] : 0), '');
  });
  r2.push('');
  lines.push(r2.join(','));

  // ── Row 3: Column Sub-Headers ──
  const r3 = [esc('S. No.'), esc('USN'), esc('Name of the Student')];
  subjects.forEach(() => {
    r3.push(esc('Attended'), esc('Att %'));
  });
  r3.push(esc('Att Avg'));
  lines.push(r3.join(','));

  // ── Data Rows ──
  subjectWise.rows.forEach((r, idx) => {
    const row = [
      esc(idx + 1),
      esc(r.usn || r.studentId),
      esc(r.name)
    ];
    subjects.forEach(s => {
      const sInfo = r.subjects && r.subjects[s];
      row.push(esc(sInfo ? sInfo.present : 0));
      row.push(esc(sInfo && sInfo.pctFormatted !== '-' ? sInfo.pctFormatted : '-'));
    });
    row.push(esc(r.attAvg != null ? r.attAvg : 0));
    lines.push(row.join(','));
  });

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
