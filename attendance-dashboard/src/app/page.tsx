"use client";

import { useEffect, useMemo, useState } from "react";

type Student = {
  id: string;
  name: string;
};

type AttendanceMatrix = Record<
  string,
  Record<string, Record<string, boolean>>
>;

const WEEKDAY_LABELS: Record<number, string> = {
  6: "شنبه",
  0: "یکشنبه",
  1: "دوشنبه",
  2: "سه‌شنبه",
  3: "چهارشنبه",
  4: "پنجشنبه",
  5: "جمعه",
};

const STORAGE_KEYS = {
  students: "attendance-students",
  attendance: "attendance-records",
  selectedWeek: "attendance-selected-week",
};

const toISODate = (date: Date) => {
  const normalized = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  return normalized.toISOString().slice(0, 10);
};

const fromISODate = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) {
    return new Date(NaN);
  }
  return new Date(year, month - 1, day);
};

const startOfWeekSaturday = (input: Date | string) => {
  const base =
    typeof input === "string" ? fromISODate(input) : new Date(input.getTime());
  if (Number.isNaN(base.getTime())) {
    return startOfWeekSaturday(new Date());
  }
  const clone = new Date(base);
  const diff = (clone.getDay() + 1) % 7;
  clone.setDate(clone.getDate() - diff);
  return toISODate(clone);
};

const buildDayKeys = (weekStart: string) => {
  const start = fromISODate(weekStart);
  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(start);
    current.setDate(start.getDate() + index);
    return toISODate(current);
  });
};

const formatDateForDisplay = (iso: string) => {
  const formatter = new Intl.DateTimeFormat("fa-IR", {
    weekday: "short",
    month: "long",
    day: "numeric",
  });
  return formatter.format(fromISODate(iso));
};

const generateId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 10);

const readStudentsFromStorage = (): Student[] => {
  if (typeof window === "undefined") return [];
  const stored = window.localStorage.getItem(STORAGE_KEYS.students);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored) as Student[];
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (item): item is Student =>
          typeof item?.id === "string" && typeof item?.name === "string",
      );
    }
    return [];
  } catch {
    return [];
  }
};

const readAttendanceFromStorage = (): AttendanceMatrix => {
  if (typeof window === "undefined") return {};
  const stored = window.localStorage.getItem(STORAGE_KEYS.attendance);
  if (!stored) return {};
  try {
    const parsed = JSON.parse(stored) as AttendanceMatrix;
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
    return {};
  } catch {
    return {};
  }
};

const readWeekFromStorage = () => {
  if (typeof window === "undefined") return startOfWeekSaturday(new Date());
  const stored = window.localStorage.getItem(STORAGE_KEYS.selectedWeek);
  if (!stored) return startOfWeekSaturday(new Date());
  return startOfWeekSaturday(stored);
};

export default function Home() {
  const [students, setStudents] = useState<Student[]>(readStudentsFromStorage);
  const [attendance, setAttendance] =
    useState<AttendanceMatrix>(readAttendanceFromStorage);
  const [selectedWeek, setSelectedWeek] = useState(readWeekFromStorage);
  const [studentName, setStudentName] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      STORAGE_KEYS.students,
      JSON.stringify(students),
    );
  }, [students]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      STORAGE_KEYS.attendance,
      JSON.stringify(attendance),
    );
  }, [attendance]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEYS.selectedWeek, selectedWeek);
  }, [selectedWeek]);

  const weekDays = useMemo(() => buildDayKeys(selectedWeek), [selectedWeek]);

  const absentSummary = useMemo(() => {
    const weeklyRecords = attendance[selectedWeek] ?? {};
    const absentees: Record<string, string[]> = {};

    Object.entries(weeklyRecords).forEach(([studentId, days]) => {
      const missed = Object.entries(days)
        .filter(([, present]) => present === false)
        .map(([dayKey]) => dayKey);
      if (missed.length) {
        absentees[studentId] = missed;
      }
    });

    return absentees;
  }, [attendance, selectedWeek]);

  const handleAddStudent = () => {
    const trimmed = studentName.trim();
    if (!trimmed) return;
    const exists = students.some(
      (student) => student.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (exists) {
      setStudentName("");
      return;
    }
    const newStudent = { id: generateId(), name: trimmed };
    setStudents((prev) => [...prev, newStudent]);
    setStudentName("");
  };

  const updateAttendance = (studentId: string, dayKey: string) => {
    setAttendance((prev) => {
      const weekRecords = prev[selectedWeek] ?? {};
      const studentRecords = weekRecords[studentId] ?? {};
      const current = studentRecords[dayKey] ?? true;
      return {
        ...prev,
        [selectedWeek]: {
          ...weekRecords,
          [studentId]: {
            ...studentRecords,
            [dayKey]: !current,
          },
        },
      };
    });
  };

  const removeStudent = (studentId: string) => {
    setStudents((prev) => prev.filter((student) => student.id !== studentId));
    setAttendance((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((weekKey) => {
        if (next[weekKey]) {
          const updated = { ...next[weekKey] };
          delete updated[studentId];
          next[weekKey] = updated;
        }
      });
      return next;
    });
  };

  const downloadCsv = () => {
    const headers = [
      "نام دانش‌آموز",
      "روز غیبت",
      "تاریخ شمسی",
      "هفته آغازین",
    ];

    const rows: string[][] = [];
    Object.entries(absentSummary).forEach(([studentId, missedDays]) => {
      const studentName =
        students.find((student) => student.id === studentId)?.name ?? "";
      missedDays.forEach((day) => {
        const formatted = formatDateForDisplay(day);
        rows.push([
          studentName,
          WEEKDAY_LABELS[fromISODate(day).getDay()] ?? "",
          formatted,
          formatDateForDisplay(selectedWeek),
        ]);
      });
    });

    if (!rows.length) return;

    const csvContent = [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${cell.replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `غایبین-${selectedWeek}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex min-h-screen justify-center bg-slate-100 px-4 py-10 font-sans">
      <main className="w-full max-w-6xl rounded-3xl bg-white p-8 shadow-lg" dir="rtl">
        <header className="border-b border-slate-200 pb-6">
          <h1 className="text-3xl font-semibold text-slate-900">
            سامانه حضور و غیاب دانش‌آموزان
          </h1>
          <p className="mt-2 text-slate-600">
            دانش‌آموزان را اضافه کنید، حضور روزانه را ثبت نمایید و گزارش
            غایبین هر هفته را دریافت کنید.
          </p>
        </header>

        <section className="mt-6 grid gap-6 lg:grid-cols-[2fr,3fr]">
          <div className="flex flex-col gap-6">
            <div className="rounded-2xl border border-slate-200 p-6">
              <h2 className="text-xl font-semibold text-slate-800">
                مدیریت دانش‌آموزان
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                نام دانش‌آموز جدید را وارد کنید تا در فهرست ثبت شود.
              </p>
              <div className="mt-4 flex items-center gap-3">
                <input
                  type="text"
                  value={studentName}
                  onChange={(event) => setStudentName(event.target.value)}
                  placeholder="نام و نام خانوادگی"
                  className="w-full rounded-xl border border-slate-300 px-4 py-2 text-base outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                />
                <button
                  type="button"
                  onClick={handleAddStudent}
                  className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                  disabled={!studentName.trim()}
                >
                  افزودن
                </button>
              </div>
              <ul className="mt-5 space-y-2">
                {students.length === 0 && (
                  <li className="rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500">
                    هنوز دانش‌آموزی اضافه نشده است.
                  </li>
                )}
                {students.map((student) => (
                  <li
                    key={student.id}
                    className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 shadow-sm"
                  >
                    <span>{student.name}</span>
                    <button
                      type="button"
                      onClick={() => removeStudent(student.id)}
                      className="text-xs font-medium text-red-500 transition hover:text-red-600"
                    >
                      حذف
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-200 p-6">
              <h2 className="text-xl font-semibold text-slate-800">
                انتخاب هفته
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                تاریخ شروع هفته (شنبه) را انتخاب کنید تا جدول حضور نمایش داده
                شود.
              </p>
              <input
                type="date"
                className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-2 text-base outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                value={selectedWeek}
                onChange={(event) => {
                  const { value } = event.target;
                  if (!value) return;
                  setSelectedWeek(startOfWeekSaturday(value));
                }}
              />
              <p className="mt-3 text-xs text-slate-500">
                هفته انتخابی از {formatDateForDisplay(selectedWeek)} آغاز می‌شود.
              </p>
            </div>

            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-6">
              <h2 className="text-lg font-semibold text-blue-800">
                راهنمای استفاده
              </h2>
              <ul className="mt-3 list-disc space-y-2 pr-5 text-sm text-blue-900">
                <li>با کلیک روی هر خانه حضور/غیاب، وضعیت بین حاضر و غایب تغییر می‌کند.</li>
                <li>در صورت غیبت، خانه به رنگ قرمز در می‌آید و در گزارش غایبین ثبت می‌شود.</li>
                <li>تمام اطلاعات به‌صورت خودکار در مرورگر ذخیره می‌شود.</li>
              </ul>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="overflow-hidden rounded-2xl border border-slate-200 shadow">
              <table className="w-full table-fixed border-collapse text-sm text-slate-700">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="w-44 px-4 py-3 text-right font-semibold">
                      دانش‌آموز
                    </th>
                    {weekDays.map((dayKey) => {
                      const label =
                        WEEKDAY_LABELS[fromISODate(dayKey).getDay()] ?? "";
                      return (
                        <th key={dayKey} className="px-4 py-3 font-semibold">
                          <div className="flex flex-col items-center gap-1">
                            <span>{label}</span>
                            <span className="text-[11px] text-slate-400">
                              {new Intl.DateTimeFormat("fa-IR", {
                                month: "numeric",
                                day: "numeric",
                              }).format(fromISODate(dayKey))}
                            </span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {students.length === 0 && (
                    <tr>
                      <td
                        colSpan={weekDays.length + 1}
                        className="px-4 py-12 text-center text-sm text-slate-400"
                      >
                        برای نمایش جدول ابتدا دانش‌آموزان را اضافه کنید.
                      </td>
                    </tr>
                  )}
                  {students.map((student) => (
                    <tr
                      key={student.id}
                      className="border-t border-slate-200 text-center hover:bg-slate-50"
                    >
                      <td className="px-4 py-3 text-right font-medium text-slate-800">
                        {student.name}
                      </td>
                      {weekDays.map((dayKey) => {
                        const weekRecords = attendance[selectedWeek] ?? {};
                        const studentRecords = weekRecords[student.id] ?? {};
                        const present = studentRecords[dayKey] ?? true;
                        return (
                          <td key={dayKey} className="px-2 py-2">
                            <button
                              type="button"
                              onClick={() => updateAttendance(student.id, dayKey)}
                              className={`flex h-10 w-full items-center justify-center rounded-xl border text-sm transition ${
                                present
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                  : "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
                              }`}
                            >
                              {present ? "حاضر" : "غایب"}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-2xl border border-slate-200 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-slate-800">
                  گزارش غایبین هفته
                </h2>
                <button
                  type="button"
                  onClick={downloadCsv}
                  className="rounded-xl border border-blue-500 px-4 py-2 text-xs font-medium text-blue-600 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
                  disabled={Object.keys(absentSummary).length === 0}
                >
                  دانلود فایل CSV
                </button>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                فهرست غایبین این هفته براساس روزهای ثبت‌شده در جدول حضور/غیاب.
              </p>
              <div className="mt-5 space-y-4">
                {Object.keys(absentSummary).length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
                    هیچ دانش‌آموز غایبی برای این هفته ثبت نشده است.
                  </div>
                )}
                {Object.entries(absentSummary).map(([studentId, missedDays]) => {
                  const studentName =
                    students.find((student) => student.id === studentId)?.name ??
                    "دانش‌آموز";
                  return (
                    <div
                      key={studentId}
                      className="rounded-2xl border border-rose-200 bg-rose-50 p-4"
                    >
                      <h3 className="text-sm font-semibold text-rose-700">
                        {studentName}
                      </h3>
                      <ul className="mt-2 flex flex-wrap gap-2 text-xs text-rose-600">
                        {missedDays.map((dayKey) => (
                          <li
                            key={dayKey}
                            className="rounded-full border border-rose-200 bg-white px-3 py-1"
                          >
                            {`${
                              WEEKDAY_LABELS[fromISODate(dayKey).getDay()] ?? ""
                            } - ${formatDateForDisplay(dayKey)}`}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
