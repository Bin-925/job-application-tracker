package com.bin.jobtracker.entity;

import com.bin.jobtracker.dto.ScheduleRequest;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.LocalDate;
import java.time.LocalTime;

@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ScheduleEvent extends BaseEntity {
    public enum Type { INTERVIEW, DEADLINE }
    public enum State { SCHEDULED, COMPLETED, CANCELLED }

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    private Application application;
    @Enumerated(EnumType.STRING) @Column(nullable = false)
    private Type type;
    @Column(nullable = false, length = 80)
    private String title;
    @Column(nullable = false)
    private LocalDate eventDate;
    private LocalTime eventTime;
    @Enumerated(EnumType.STRING) @Column(nullable = false)
    private State state;
    @Version
    private Long version;

    public ScheduleEvent(Application application, ScheduleRequest request) {
        this.application = application;
        update(request);
    }

    public void update(ScheduleRequest request) {
        type = request.type();
        title = request.title().trim();
        eventDate = request.date();
        eventTime = request.time();
        state = request.state();
    }
}
