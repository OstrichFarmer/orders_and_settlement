'use client';

import { useEffect, useRef, useState } from 'react';

interface DatePickerProps {
  id?: string;
  value: string; // 'YYYY-MM-DD', or '' for unset
  onChange: (value: string) => void;
  placeholder?: string;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseISODate(s: string): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function DatePicker({ id, value, onChange, placeholder = 'Select date' }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = parseISODate(value);
  const [viewDate, setViewDate] = useState(() => selected ?? new Date());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function openPicker() {
    setViewDate(selected ?? new Date());
    setOpen((o) => !o);
  }

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const today = new Date();

  return (
    <div className="datepicker" ref={containerRef}>
      <button
        type="button"
        id={id}
        className="datepicker-trigger"
        onClick={openPicker}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span style={{ color: selected ? 'var(--text-main)' : 'var(--text-dim)' }}>
          {selected
            ? selected.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
            : placeholder}
        </span>
        <span className="datepicker-icon">📅</span>
      </button>

      {open && (
        <div className="datepicker-popover" role="dialog" aria-label="Choose a date">
          <div className="datepicker-header">
            <button type="button" onClick={() => setViewDate(new Date(year, month - 1, 1))} aria-label="Previous month">
              ‹
            </button>
            <span>
              {MONTHS[month]} {year}
            </span>
            <button type="button" onClick={() => setViewDate(new Date(year, month + 1, 1))} aria-label="Next month">
              ›
            </button>
          </div>
          <div className="datepicker-weekdays">
            {WEEKDAYS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="datepicker-grid">
            {cells.map((d, i) =>
              d ? (
                <button
                  key={i}
                  type="button"
                  className={
                    'datepicker-day' +
                    (selected && isSameDay(d, selected) ? ' selected' : '') +
                    (isSameDay(d, today) ? ' today' : '')
                  }
                  onClick={() => {
                    onChange(toISODate(d));
                    setOpen(false);
                  }}
                >
                  {d.getDate()}
                </button>
              ) : (
                <span key={i} />
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
