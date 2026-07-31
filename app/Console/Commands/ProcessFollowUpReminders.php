<?php

namespace App\Console\Commands;

use App\Models\ServiceOrder;
use App\Notifications\FollowUpEscalatedNotification;
use App\Notifications\FollowUpReminderNotification;
use App\Models\User;
use Illuminate\Console\Command;

class ProcessFollowUpReminders extends Command
{
    protected $signature = 'follow-up:process';

    protected $description = 'Send in-app reminder to SA at H+3 in follow_up status, and escalate to admin if still unresolved.';

    // ASUMSI (belum dikonfirmasi owner): eskalasi terjadi N hari setelah
    // reminder pertama terkirim, bukan langsung di H+3 yang sama.
    // Ganti angka ini kalau owner tentukan jeda berbeda.
    private const ESCALATE_AFTER_REMINDER_DAYS = 2;

    public function handle(): int
    {
        $this->sendReminders();
        $this->escalateOverdue();

        return self::SUCCESS;
    }

    private function sendReminders(): void
    {
        $orders = ServiceOrder::where('status', ServiceOrder::STATUS_FOLLOW_UP)
            ->whereNull('follow_up_reminder_sent_at')
            ->whereNotNull('follow_up_deadline')
            ->where('follow_up_deadline', '<=', now())
            ->with('serviceAdvisor')
            ->get();

        foreach ($orders as $order) {
            $order->serviceAdvisor->notify(new FollowUpReminderNotification($order));
            $order->update(['follow_up_reminder_sent_at' => now()]);

            $this->info("Reminder sent for order #{$order->work_order_number}");
        }
    }

    private function escalateOverdue(): void
    {
        $orders = ServiceOrder::where('status', ServiceOrder::STATUS_FOLLOW_UP)
            ->whereNotNull('follow_up_reminder_sent_at')
            ->whereNull('follow_up_escalated_to_admin_at')
            ->where(
                'follow_up_reminder_sent_at',
                '<=',
                now()->subDays(self::ESCALATE_AFTER_REMINDER_DAYS)
            )
            ->with('serviceAdvisor')
            ->get();

        $admins = User::where('role', 'admin')->get();

        foreach ($orders as $order) {
            foreach ($admins as $admin) {
                $admin->notify(new FollowUpEscalatedNotification($order));
            }
            $order->update(['follow_up_escalated_to_admin_at' => now()]);

            $this->info("Order #{$order->work_order_number} escalated to admin.");
        }
    }
}