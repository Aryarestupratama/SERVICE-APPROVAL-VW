// Alasan keterlambatan order (TASK-053, FR-041). Nilai harus sama dengan
// ServiceOrder::DELAY_REASONS di backend; backend tetap sumber kebenaran validasi.
export const DELAY_REASON_LABEL = {
    waiting_part: 'Waiting Part',
    waiting_approval: 'Waiting Approval',
};

// Pertanyaan konfirmasi saat delay dimatikan (pesan modal berbahasa Inggris, RULE-010).
export const DELAY_REASON_QUESTION = {
    waiting_part: 'Have all the parts arrived?',
    waiting_approval: 'Has the customer approved all items?',
};

export const DELAY_REASON_YES_LABEL = {
    waiting_part: 'Yes, parts have arrived',
    waiting_approval: 'Yes, customer has approved',
};

// Badge amber (teks amber-700 sesuai RULE-060). Awalan "Delay:" membedakannya dari label
// status item "Waiting Approval" yang sudah ada di detail order.
export const DELAY_BADGE_CLASS = 'border-amber-500 bg-amber-50 text-amber-700';
