<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ServiceOrderFuas;
use App\Services\FuasFeedbackExport;
use Carbon\CarbonInterface;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * API-026. Ekspor jawaban feedback FUAS ke Excel untuk bagian CR (FR-037). Hanya admin (route
 * `role:admin`). Periode WAJIB dipilih eksplisit (tidak ada ekspor "semua"), dihitung dari waktu
 * customer mengisi feedback (`submitted_at`, zona Asia/Jakarta). Hanya order berstatus Feedback
 * Received yang punya jawaban, jadi hanya itu yang diekspor.
 */
class FuasExportController extends Controller
{
    /** Batas rentang untuk menjaga beban shared hosting (RULE-020, RULE-044). */
    private const MAX_RANGE_DAYS = 366;

    public const PERIODS = ['this_month', 'last_month', 'month', 'custom'];

    public function __invoke(Request $request, FuasFeedbackExport $export): StreamedResponse|JsonResponse
    {
        $data = $request->validate([
            'period' => ['required', Rule::in(self::PERIODS)],
            'month' => ['required_if:period,month', 'nullable', 'date_format:Y-m'],
            'from' => ['required_if:period,custom', 'nullable', 'date_format:Y-m-d'],
            'to' => ['required_if:period,custom', 'nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
            'service_advisor_id' => [
                'nullable',
                'integer',
                Rule::exists('users', 'id')->where('role', 'service_advisor'),
            ],
        ], [
            'period.required' => 'Choose a period to export.',
            'period.in' => 'Choose a valid period.',
            'month.required_if' => 'Choose a month.',
            'month.date_format' => 'Choose a valid month.',
            'from.required_if' => 'Choose a start date.',
            'from.date_format' => 'Choose a valid start date.',
            'to.required_if' => 'Choose an end date.',
            'to.date_format' => 'Choose a valid end date.',
            'to.after_or_equal' => 'The end date must be on or after the start date.',
            'service_advisor_id.exists' => 'Choose a valid service advisor.',
        ]);

        [$start, $end] = $this->resolvePeriod($data);

        if ($end->getTimestamp() - $start->getTimestamp() > self::MAX_RANGE_DAYS * 86400) {
            throw ValidationException::withMessages([
                'to' => 'The period can be at most 1 year. Choose a shorter range.',
            ]);
        }

        $saId = (int) ($data['service_advisor_id'] ?? 0);

        $query = ServiceOrderFuas::query()
            ->whereNotNull('submitted_at')
            ->whereBetween('submitted_at', [$start->format('Y-m-d H:i:s'), $end->format('Y-m-d H:i:s')])
            ->when($saId > 0, fn ($q) => $q->whereHas(
                'serviceOrder',
                fn ($o) => $o->where('service_advisor_id', $saId)
            ))
            ->with([
                'serviceOrder.vehicle.customer',
                'serviceOrder.serviceAdvisor:id,name',
                'serviceOrder.technician:id,name',
            ])
            ->orderBy('submitted_at')
            ->orderBy('id');

        if (! $query->exists()) {
            return response()->json([
                'message' => 'No feedback was submitted in this period. Try a longer period or another service advisor.',
            ], 422);
        }

        $label = $start->format('Y-m-d') . ' to ' . $end->format('Y-m-d');
        // Spreadsheet dibangun penuh SEBELUM mulai mengalir, supaya kegagalan tampil sebagai error
        // biasa, bukan file rusak.
        $spreadsheet = $export->build($this->rows($query->lazy(200)), $label);
        $filename = 'fuas-feedback_' . $start->format('Y-m-d') . '_to_' . $end->format('Y-m-d') . '.xlsx';

        return response()->streamDownload(function () use ($spreadsheet) {
            (new Xlsx($spreadsheet))->save('php://output');
            $spreadsheet->disconnectWorksheets();
        }, $filename, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Cache-Control' => 'no-store',
        ]);
    }

    /**
     * Awal dan akhir periode (inklusif) dalam zona waktu aplikasi (Asia/Jakarta).
     *
     * @param  array<string, mixed>  $data
     * @return array{0: CarbonInterface, 1: CarbonInterface}
     */
    private function resolvePeriod(array $data): array
    {
        $tz = config('app.timezone');

        return match ($data['period']) {
            'this_month' => [now()->startOfMonth(), now()->endOfMonth()],
            'last_month' => [
                now()->startOfMonth()->subMonthNoOverflow()->startOfMonth(),
                now()->startOfMonth()->subMonthNoOverflow()->endOfMonth(),
            ],
            'month' => (function () use ($data, $tz) {
                $first = Carbon::createFromFormat('!Y-m', $data['month'], $tz)->startOfMonth();

                return [$first, $first->copy()->endOfMonth()];
            })(),
            default => [
                Carbon::createFromFormat('!Y-m-d', $data['from'], $tz)->startOfDay(),
                Carbon::createFromFormat('!Y-m-d', $data['to'], $tz)->endOfDay(),
            ],
        };
    }

    /**
     * Bentuk baris datar untuk FuasFeedbackExport. Tanpa feedback_token.
     *
     * @param  iterable<ServiceOrderFuas>  $feedbacks
     * @return \Generator<int, array<string, mixed>>
     */
    private function rows(iterable $feedbacks): \Generator
    {
        foreach ($feedbacks as $fuas) {
            $order = $fuas->serviceOrder;
            $vehicle = $order?->vehicle;
            $customer = $vehicle?->customer;

            yield [
                'work_order_number' => $order?->work_order_number,
                'completed_at' => $order?->status_changed_at,
                'brand' => $vehicle?->brand,
                'model' => $vehicle?->model,
                'plate_number' => $vehicle?->plate_number,
                'vin' => $vehicle?->vin,
                'customer' => $customer ? trim(($customer->title ? $customer->title . ' ' : '') . $customer->name) : null,
                // Disimpan sebagai 62xxx (mutator Customer, RULE-013, RULE-031); ditulis sebagai teks.
                'customer_phone' => $customer?->phone,
                'service_advisor' => $order?->serviceAdvisor?->name,
                'technician' => $order?->technician?->name,
                'customer_complaint' => $order?->customer_complaint,
                'submitted_at' => $fuas->submitted_at,
                'satisfaction_score' => $fuas->satisfaction_score,
                'recommend_score' => $fuas->recommend_score,
                'vehicle_issue_note' => $fuas->vehicle_issue_note,
                'suggestion' => $fuas->suggestion,
                'categories' => $fuas->suggestion_categories ?? [],
            ];
        }
    }
}
