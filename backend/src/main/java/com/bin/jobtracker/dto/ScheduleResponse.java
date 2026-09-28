package com.bin.jobtracker.dto;

import com.bin.jobtracker.entity.ScheduleEvent;
import java.time.LocalDate;
import java.time.LocalTime;

public record ScheduleResponse(Long id, ScheduleEvent.Type type, String title,
        LocalDate date, LocalTime time, ScheduleEvent.State state, Long version) {
    public static ScheduleResponse from(ScheduleEvent event) {
        return new ScheduleResponse(event.getId(), event.getType(), event.getTitle(),
                event.getEventDate(), event.getEventTime(), event.getState(), event.getVersion());
    }
}
