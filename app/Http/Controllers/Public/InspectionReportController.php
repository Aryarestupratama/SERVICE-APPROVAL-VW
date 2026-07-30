<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use Inertia\Inertia;

class InspectionReportController extends Controller
{
    public function show(string $token)
    {
        // Sementara raw/dummy dulu — belum query ke database pakai $token
        // Nanti diganti: cari ServiceOrder::where('inspection_token', $token)->firstOrFail()
        // + cek isInspectionLinkExpired()

        return Inertia::render('Public/InspectionReport');
    }
}