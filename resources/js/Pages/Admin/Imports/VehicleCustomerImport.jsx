import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '@/Layouts/AdminLayout';
import { router, useForm, Head } from '@inertiajs/react';
import { toast } from 'sonner';
import { Button } from '@/Components/ui/button';
import { Badge } from '@/Components/ui/badge';
import { Checkbox } from '@/Components/ui/checkbox';
import { Input } from '@/Components/ui/input';
import { Label } from '@/Components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/Components/ui/alert';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/Components/ui/accordion';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/Components/ui/table';
import { UploadCloud, AlertTriangle, CheckCircle2 } from 'lucide-react';

const ISSUE_LABELS = {
    missing_vin: 'Missing VIN',
    vin_length: 'VIN not 17 chars',
    duplicate_vin: 'Duplicate VIN',
    missing_plate: 'Missing plate',
    duplicate_plate: 'Duplicate plate',
    invalid_brand: 'Brand not Audi/VW',
    missing_name: 'Missing customer name',
    phone_format: 'Phone may be truncated',
};

// Baris yang tidak bisa diimpor sama sekali: dikecualikan sejak awal dan
// checkbox-nya dikunci. Server juga men-skip baris ini saat commit.
const initialExcluded = (rows) =>
    new Set((rows ?? []).filter((r) => !r.included || r.blocking).map((r) => r.row_id));

function UploadForm({ hasRows }) {
    const { data, setData, post, processing, errors } = useForm({ file: null });

    const submit = (e) => {
        e.preventDefault();
        post(route('admin.vehicle-customer-import.preview'), {
            forceFormData: true,
            onSuccess: (page) => {
                // Server bisa membalas back()->with('error') tanpa melempar validation error.
                const flashError = page.props.flash?.error;
                if (flashError) {
                    toast.error('Nothing to import', { description: flashError });
                    return;
                }
                toast.success('File parsed', {
                    description: 'Review the rows below before importing.',
                });
            },
            onError: (errs) => toast.error('Failed to parse file', {
                description: errs?.file ?? 'Make sure the file is a valid .xlsx/.xls export.',
            }),
        });
    };

    return (
        <form onSubmit={submit} className="rounded-lg border border-vw-grey/20 bg-white p-6">
            <div className="flex items-start gap-3">
                <UploadCloud className="mt-1 h-5 w-5 text-vw-grey" />
                <div className="flex-1 space-y-3">
                    <div>
                        <Label htmlFor="file">Excel file (.xlsx / .xls)</Label>
                        <p className="text-sm text-muted-foreground">
                            Expected columns: No Chassis, No. Polisi, Brand, Variant, Contact Name, primary, Phone.
                        </p>
                    </div>
                    <Input
                        id="file"
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={(e) => setData('file', e.target.files?.[0] ?? null)}
                    />
                    {errors.file && <p className="text-sm text-urgent">{errors.file}</p>}
                    <Button type="submit" disabled={processing || !data.file}>
                        {processing ? 'Parsing...' : hasRows ? 'Re-upload & Re-parse' : 'Upload & Preview'}
                    </Button>
                </div>
            </div>
        </form>
    );
}

function RowIssueBadges({ issues }) {
    if (!issues?.length) return null;
    return (
        <div className="flex flex-wrap gap-1">
            {issues.map((issue) => (
                <Badge key={issue} variant="destructive" className="text-[10px]">
                    {ISSUE_LABELS[issue] ?? issue}
                </Badge>
            ))}
        </div>
    );
}

function CustomerCell({ row }) {
    return (
        <div className="text-sm">
            <div>{row.primary_name} <span className="text-[10px] text-vw-light-blue">(Primary)</span></div>
            {row.contact_name && (
                <div className="text-muted-foreground">{row.contact_name} (PIC)</div>
            )}
            {row.contact_deduped && (
                <div className="text-[11px] italic text-muted-foreground">Contact merged into primary</div>
            )}
        </div>
    );
}

function FailedRowsAlert({ failedRows, onDismiss }) {
    return (
        <div className="space-y-2">
            <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{failedRows.length} rows failed to import</AlertTitle>
                <AlertDescription>
                    All other rows were saved. Fix the rows below in the Excel file and import them again,
                    or add them manually.
                </AlertDescription>
            </Alert>
            <div className="overflow-x-auto rounded-lg border border-vw-grey/20 bg-white">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Excel row</TableHead>
                            <TableHead>Plate</TableHead>
                            <TableHead>Reason</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {failedRows.map((f, i) => (
                            <TableRow key={`${f.excel_row}-${i}`}>
                                <TableCell className="text-xs text-muted-foreground">{f.excel_row}</TableCell>
                                <TableCell>{f.plate_number}</TableCell>
                                <TableCell className="text-sm">{f.error}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={onDismiss}>Dismiss</Button>
            </div>
        </div>
    );
}

function PreviewTable({ rows, excludedIds, onToggle, showToggle = true }) {
    return (
        <div className="overflow-x-auto rounded-lg border border-vw-grey/20 bg-white">
            <Table>
                <TableHeader>
                    <TableRow>
                        {showToggle && <TableHead className="w-10">Include</TableHead>}
                        <TableHead>Row</TableHead>
                        <TableHead>VIN</TableHead>
                        <TableHead>Plate</TableHead>
                        <TableHead>Brand / Model</TableHead>
                        <TableHead>Customer(s)</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Issues</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((row) => (
                        <TableRow key={row.row_id} className="hover:bg-vw-grey-light/60">
                            {showToggle && (
                                <TableCell>
                                    <Checkbox
                                        checked={!excludedIds.has(row.row_id)}
                                        disabled={row.blocking}
                                        onCheckedChange={() => onToggle(row.row_id)}
                                    />
                                </TableCell>
                            )}
                            <TableCell className="text-xs text-muted-foreground">{row.excel_row}</TableCell>
                            <TableCell className="font-mono text-xs">{row.vin}</TableCell>
                            <TableCell>{row.plate_number}</TableCell>
                            <TableCell className="text-sm">{row.brand} {row.model}</TableCell>
                            <TableCell><CustomerCell row={row} /></TableCell>
                            <TableCell className="text-xs">{row.phone}</TableCell>
                            <TableCell>
                                <Badge variant={row.existing_vehicle_id ? 'secondary' : 'outline'}>
                                    {row.existing_vehicle_id ? 'Update' : 'Create'}
                                </Badge>
                            </TableCell>
                            <TableCell><RowIssueBadges issues={row.issues} /></TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

export default function VehicleCustomerImport({ rows, failedRows }) {
    const hasRows = Array.isArray(rows) && rows.length > 0;
    const hasFailed = Array.isArray(failedRows) && failedRows.length > 0;

    // excludedIds: row_id yang TIDAK akan diimport. Diinisialisasi dari
    // row.included (backend: default true kalau tidak ada issue, false
    // kalau ada issue) — jadi issue rows start OFF, admin opt-in manual.
    // Baris `blocking` selalu excluded dan tidak bisa dicentang.
    const [excludedIds, setExcludedIds] = useState(() => initialExcluded(rows));
    const [committing, setCommitting] = useState(false);

    // Upload ulang menghasilkan `rows` baru dengan row_id mulai dari 0 lagi;
    // tanpa reset ini pilihan lama menempel ke baris yang salah.
    useEffect(() => {
        setExcludedIds(initialExcluded(rows));
    }, [rows]);

    const { issueRows, cleanRows, blockedCount } = useMemo(() => {
        if (!hasRows) return { issueRows: [], cleanRows: [], blockedCount: 0 };
        return {
            issueRows: rows.filter((r) => r.issues.length > 0),
            cleanRows: rows.filter((r) => r.issues.length === 0),
            blockedCount: rows.filter((r) => r.blocking).length,
        };
    }, [rows]);

    const toggleRow = (rowId) => {
        if (rows?.find((r) => r.row_id === rowId)?.blocking) return;
        setExcludedIds((current) => {
            const next = new Set(current);
            next.has(rowId) ? next.delete(rowId) : next.add(rowId);
            return next;
        });
    };

    const includedCount = hasRows ? rows.length - excludedIds.size : 0;

    const handleCommit = () => {
        setCommitting(true);
        router.post(
            route('admin.vehicle-customer-import.commit'),
            { excluded_row_ids: Array.from(excludedIds) },
            {
                onSuccess: (page) => {
                    // Server bisa membalas back()->with('error') (mis. session habis);
                    // jangan tampilkan toast sukses untuk kasus itu.
                    const flash = page.props.flash;
                    if (flash?.error) {
                        toast.error('Import failed', { description: flash.error });
                        return;
                    }
                    toast.success('Import complete', { description: flash?.success });
                },
                onError: () => {
                    toast.error('Import failed', {
                        description: 'Please check the data and try again.',
                    });
                },
                onFinish: () => setCommitting(false),
            }
        );
    };

    const handleCancel = () => {
        router.delete(route('admin.vehicle-customer-import.cancel'), {
            onSuccess: () => toast('Import cancelled'),
        });
    };

    const handleDismissFailed = () => {
        router.delete(route('admin.vehicle-customer-import.cancel'), { preserveScroll: true });
    };

    return (
        <AdminLayout title="Import Customer & Vehicle">
            <Head title="Import Customer & Vehicle" />
            <div className="space-y-6">
                {hasFailed && (
                    <FailedRowsAlert failedRows={failedRows} onDismiss={handleDismissFailed} />
                )}

                <UploadForm hasRows={hasRows} />

                {hasRows && (
                    <>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <SummaryCard label="Total rows" value={rows.length} />
                            <SummaryCard label="Needs review" value={issueRows.length} tone="warning" />
                            <SummaryCard label="Clean rows" value={cleanRows.length} tone="success" />
                            <SummaryCard label="Will be imported" value={includedCount} tone="primary" />
                        </div>

                        {issueRows.length > 0 && (
                            <div className="space-y-2">
                                <Alert variant="destructive">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>{issueRows.length} rows need manual review</AlertTitle>
                                    <AlertDescription>
                                        These rows have an unusual VIN length, a duplicate VIN/plate, or a possibly truncated phone.
                                        Check the box to include a row anyway, or leave it unchecked to skip it.
                                        {blockedCount > 0 && (
                                            <> {blockedCount} rows have missing or invalid required data (VIN, plate, brand, or name)
                                            and cannot be imported; fix them in the Excel file.</>
                                        )}
                                    </AlertDescription>
                                </Alert>
                                <PreviewTable rows={issueRows} excludedIds={excludedIds} onToggle={toggleRow} />
                            </div>
                        )}

                        {cleanRows.length > 0 && (
                            <Accordion type="single" collapsible>
                                <AccordionItem value="clean-rows">
                                    <AccordionTrigger className="rounded-lg border border-vw-grey/20 bg-white px-4">
                                        <span className="flex items-center gap-2 text-sm font-medium">
                                            <CheckCircle2 className="h-4 w-4 text-approved" />
                                            {cleanRows.length} clean rows (ready to import)
                                        </span>
                                    </AccordionTrigger>
                                    <AccordionContent className="pt-3">
                                        <PreviewTable rows={cleanRows} excludedIds={excludedIds} onToggle={toggleRow} />
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                        )}

                        <div className="flex items-center justify-end gap-3 border-t border-vw-grey/20 pt-4">
                            <Button variant="outline" onClick={handleCancel} disabled={committing}>
                                Cancel
                            </Button>
                            <Button onClick={handleCommit} disabled={committing || includedCount === 0}>
                                {committing ? 'Importing...' : `Import ${includedCount} rows`}
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </AdminLayout>
    );
}

function SummaryCard({ label, value, tone = 'default' }) {
    const toneClass = {
        default: 'text-foreground',
        warning: 'text-urgent',
        success: 'text-approved',
        primary: 'text-vw-blue',
    }[tone];

    return (
        <div className="rounded-lg border border-vw-grey/20 bg-white p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-2xl font-semibold ${toneClass}`}>{value}</p>
        </div>
    );
}