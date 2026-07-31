<?php

namespace App\Notifications;

use App\Models\ServiceOrder;
use Illuminate\Notifications\Notification;

class FollowUpReminderNotification extends Notification
{
    public function __construct(public ServiceOrder $serviceOrder)
    {
    }

    public function via(object $notifiable): array
    {
        // In-app saja untuk sekarang (PROJECT-RULES bagian 6, poin 5) — belum
        // ada channel lain (WA/email) yang diminta.
        return ['database'];
    }

    public function toDatabase(object $notifiable): array
    {
        return [
            'type' => 'follow_up_reminder',
            'service_order_id' => $this->serviceOrder->id,
            'work_order_number' => $this->serviceOrder->work_order_number,
            'message' => "Work order #{$this->serviceOrder->work_order_number} has been waiting for pickup for 3 days. Please follow up with the customer.",
        ];
    }
}