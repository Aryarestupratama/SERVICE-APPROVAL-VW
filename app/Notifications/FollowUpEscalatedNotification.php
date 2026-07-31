<?php

namespace App\Notifications;

use App\Models\ServiceOrder;
use Illuminate\Notifications\Notification;

class FollowUpEscalatedNotification extends Notification
{
    public function __construct(public ServiceOrder $serviceOrder)
    {
    }

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toDatabase(object $notifiable): array
    {
        return [
            'type' => 'follow_up_escalated',
            'service_order_id' => $this->serviceOrder->id,
            'work_order_number' => $this->serviceOrder->work_order_number,
            'service_advisor_name' => $this->serviceOrder->serviceAdvisor->name,
            'message' => "Work order #{$this->serviceOrder->work_order_number} is still waiting for pickup and has been escalated — SA {$this->serviceOrder->serviceAdvisor->name} has not resolved it.",
        ];
    }
}