export interface Student {
  id: string;
  name: string;
  registered_date: string;
}

export interface Attendance {
  id: string;
  name: string;
  date: string;
  period: string;
  status: 'Present' | 'Absent' | 'Late' | 'Excused';
  method: string;
  timestamp: string;
}

export interface Period {
  period: string;
  start_time: string;
  end_time: string;
  classroom?: string;
  subject?: string;
}

const STORAGE_KEYS = {
  STUDENTS: 'classlens_students',
  ATTENDANCE: 'classlens_attendance',
  PERIODS: 'classlens_periods'
};

// --- Generic Helpers ---
const getItem = <T>(key: string, defaultValue: T): T => {
  const item = localStorage.getItem(key);
  try {
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
};

const setItem = (key: string, value: any) => {
  localStorage.setItem(key, JSON.stringify(value));
};

// --- Student Persistence ---
export const getStudents = (): Student[] => getItem(STORAGE_KEYS.STUDENTS, []);

export const saveStudent = (student: Student) => {
  const students = getStudents();
  // Update if exists (by ID), otherwise add
  const index = students.findIndex(s => s.id === student.id);
  if (index !== -1) {
    students[index] = student;
  } else {
    students.push(student);
  }
  setItem(STORAGE_KEYS.STUDENTS, students);
};

export const deleteStudent = (id: string) => {
  const students = getStudents().filter(s => s.id !== id);
  setItem(STORAGE_KEYS.STUDENTS, students);
  // Also clean up attendance records for this student
  const attendance = getAttendance().filter(a => a.id !== id);
  setItem(STORAGE_KEYS.ATTENDANCE, attendance);
};

// --- Attendance Persistence ---
export const getAttendance = (): Attendance[] => getItem(STORAGE_KEYS.ATTENDANCE, []);

export const saveAttendance = (record: Attendance) => {
  const attendance = getAttendance();
  attendance.unshift(record); // Add to beginning
  setItem(STORAGE_KEYS.ATTENDANCE, attendance);
};

export const updateAttendanceRecord = (updatedRecord: Attendance) => {
  const attendance = getAttendance();
  const index = attendance.findIndex(a => a.id === updatedRecord.id && a.timestamp === updatedRecord.timestamp);
  if (index !== -1) {
    attendance[index] = updatedRecord;
    setItem(STORAGE_KEYS.ATTENDANCE, attendance);
  }
};

// --- Timetable Persistence ---
export const getPeriods = (): Period[] => getItem(STORAGE_KEYS.PERIODS, []);

export const savePeriod = (period: Period) => {
  const periods = getPeriods();
  const index = periods.findIndex(p => p.period === period.period);
  if (index !== -1) {
    periods[index] = period;
  } else {
    periods.push(period);
  }
  setItem(STORAGE_KEYS.PERIODS, periods);
};

export const deletePeriod = (periodName: string) => {
  const periods = getPeriods().filter(p => p.period !== periodName);
  setItem(STORAGE_KEYS.PERIODS, periods);
};

export const deleteAttendanceRecord = (timestamp: string) => {
  const attendance = getAttendance().filter(a => a.timestamp !== timestamp);
  setItem(STORAGE_KEYS.ATTENDANCE, attendance);
};
