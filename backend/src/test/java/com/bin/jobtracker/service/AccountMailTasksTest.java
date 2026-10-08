package com.bin.jobtracker.service;

import com.bin.jobtracker.exception.MailUnavailableException;
import org.junit.jupiter.api.Test;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;

class AccountMailTasksTest {
    @Test void boundsWorkersAndQueueAndRejectsAfterShutdown() throws Exception {
        var tasks = new AccountMailTasks();
        var running = new CountDownLatch(2); var release = new CountDownLatch(1);
        Runnable blocked = () -> {
            running.countDown();
            try { release.await(); } catch (InterruptedException error) { Thread.currentThread().interrupt(); }
        };
        try {
            tasks.submit(blocked); tasks.submit(blocked);
            assertThat(running.await(3, TimeUnit.SECONDS)).isTrue();
            for (int i = 0; i < 32; i++) tasks.submit(() -> {});
            assertThatThrownBy(() -> tasks.submit(() -> {})).isInstanceOf(MailUnavailableException.class);
        } finally { release.countDown(); tasks.close(); }
        assertThatThrownBy(() -> tasks.submit(() -> {})).isInstanceOf(MailUnavailableException.class);
    }
}
