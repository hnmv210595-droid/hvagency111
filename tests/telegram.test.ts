import { describe, expect, it } from 'vitest';
import { formatPayrollTelegramMessage, escapeHtml } from '../worker/lib/telegram';

describe('formatPayrollTelegramMessage', () => {
  it('one line per field with bold values', () => {
    const text = formatPayrollTelegramMessage({
      employeeName: 'Nguyễn Văn A',
      year: 2026,
      month: 8,
      baseSalary: 10_000_000,
      commission: 1_500_000,
      unpaidLeaveDays: 2,
      netSalary: 10_700_000,
    });

    expect(text).toBe(
      [
        'Tên NV: <b>Nguyễn Văn A</b>',
        'Tháng: <b>08/2026</b>',
        'Lương CB: <b>10.000.000 VNĐ</b>',
        'HH: <b>1.500.000 VNĐ</b>',
        'Nghỉ không lương: <b>2</b>',
        'Thực Nhận: <b>10.700.000 VNĐ</b>',
      ].join('\n'),
    );
  });

  it('escapes HTML in employee name', () => {
    expect(escapeHtml('A <B> & "C"')).toBe('A &lt;B&gt; &amp; &quot;C&quot;');
    const text = formatPayrollTelegramMessage({
      employeeName: 'Test <script>',
      year: 2026,
      month: 1,
      baseSalary: 0,
      commission: 0,
      unpaidLeaveDays: 0,
      netSalary: 0,
    });
    expect(text).toContain('<b>Test &lt;script&gt;</b>');
  });
});
