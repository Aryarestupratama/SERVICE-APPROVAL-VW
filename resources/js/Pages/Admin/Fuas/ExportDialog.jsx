import { useState } from 'react';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import { Label } from '@/Components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/Components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/Components/ui/select';
import { Download } from 'lucide-react';
import { toast } from 'sonner';

// Ekspor jawaban feedback FUAS ke Excel untuk bagian CR (FR-037, API-026). Hanya admin.
// Periode dipilih eksplisit; server yang menghitung rentang tanggalnya (Asia/Jakarta) dan
// membatasi data. File diunduh lewat axios (blob) supaya setiap kegagalan tampil sebagai
// pesan di layar, bukan halaman kosong (RULE-042).

const PERIOD_OPTIONS = [
    { value: 'this_month', label: 'This month' },
    { value: 'last_month', label: 'Last month' },
    { value: 'month', label: 'Specific month' },
    { value: 'custom', label: 'Custom date range' },
];

const ALL_ADVISORS = '__all__';

// Bulan berjalan dari komponen lokal, bukan toISOString (RULE-014).
function currentMonthValue() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function filenameFrom(header) {
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header ?? '');
    return match ? decodeURIComponent(match[1]) : 'fuas-feedback.xlsx';
}

// Respons error datang sebagai Blob karena responseType 'blob'; baca isinya untuk pesan server.
async function errorMessageFrom(error) {
    const response = error.response;
    if (!response) return 'Could not reach the server. Check your connection and try again.';

    if (response.status === 422) {
        try {
            const body = JSON.parse(await response.data.text());
            const firstError = body.errors ? Object.values(body.errors)[0]?.[0] : null;
            return firstError || body.message || 'Check the selected period and try again.';
        } catch {
            return 'Check the selected period and try again.';
        }
    }
    if (response.status === 403) return 'Only admins can export feedback.';
    if (response.status === 419) return 'Your session expired. Reload the page and try again.';
    if (response.status === 429) return 'Too many exports. Wait a minute and try again.';
    return 'Something went wrong while creating the file. Please try again.';
}

export default function ExportDialog({ open, onOpenChange, serviceAdvisors, defaultServiceAdvisorId }) {
    const [period, setPeriod] = useState('this_month');
    const [month, setMonth] = useState(currentMonthValue);
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [advisorId, setAdvisorId] = useState(defaultServiceAdvisorId || ALL_ADVISORS);
    const [busy, setBusy] = useState(false);

    // Pemeriksaan ringan di klien; aturan sebenarnya tetap di server.
    let problem = null;
    if (period === 'month' && !month) problem = 'Choose a month.';
    if (period === 'custom') {
        if (!from || !to) problem = 'Choose a start date and an end date.';
        else if (to < from) problem = 'The end date must be on or after the start date.';
    }

    const handleDownload = async () => {
        if (busy || problem) return;

        setBusy(true);
        try {
            const response = await window.axios.get(route('admin.fuas.export'), {
                params: {
                    period,
                    month: period === 'month' ? month : undefined,
                    from: period === 'custom' ? from : undefined,
                    to: period === 'custom' ? to : undefined,
                    service_advisor_id: advisorId !== ALL_ADVISORS ? advisorId : undefined,
                },
                responseType: 'blob',
                headers: { Accept: 'application/json' },
            });

            const url = URL.createObjectURL(response.data);
            const link = document.createElement('a');
            link.href = url;
            link.download = filenameFrom(response.headers['content-disposition']);
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);

            toast.success('Excel file downloaded.');
            onOpenChange(false);
        } catch (error) {
            toast.error(await errorMessageFrom(error));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Export feedback to Excel</DialogTitle>
                    <DialogDescription>
                        One row per customer feedback, with the work order, vehicle, and customer details. The period is
                        based on the date the customer submitted the feedback. The file contains customer phone
                        numbers, so share it only with the people who need it.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="export-period">Period</Label>
                        <Select value={period} onValueChange={setPeriod}>
                            <SelectTrigger id="export-period">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {PERIOD_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {period === 'month' && (
                        <div className="space-y-1.5">
                            <Label htmlFor="export-month">Month</Label>
                            <Input id="export-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
                        </div>
                    )}

                    {period === 'custom' && (
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label htmlFor="export-from">From</Label>
                                <Input id="export-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="export-to">To</Label>
                                <Input id="export-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
                            </div>
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor="export-advisor">Service Advisor</Label>
                        <Select value={advisorId} onValueChange={setAdvisorId}>
                            <SelectTrigger id="export-advisor">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={ALL_ADVISORS}>All service advisors</SelectItem>
                                {serviceAdvisors.map((sa) => (
                                    <SelectItem key={sa.id} value={String(sa.id)}>
                                        {sa.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {problem && (
                        <p role="alert" className="text-sm text-amber-700">
                            {problem}
                        </p>
                    )}
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" className="min-h-[36px]" disabled={busy} onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button type="button" className="min-h-[36px]" disabled={busy || Boolean(problem)} onClick={handleDownload}>
                        <Download aria-hidden="true" />
                        {busy ? 'Preparing file...' : 'Download Excel'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
