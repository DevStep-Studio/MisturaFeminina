<?php

namespace App\Support\Monitoring;

use Sentry\Event;

class SanitizeSentry
{
    public static function event(Event $event): ?Event
    {
        $event->setRequest([]);
        $event->setUser(null);
        $event->setBreadcrumb([]);
        $event->setExtra([]);

        return $event;
    }
}
