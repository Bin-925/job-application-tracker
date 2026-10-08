package com.bin.jobtracker.service;

import com.bin.jobtracker.exception.MailUnavailableException;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import java.util.concurrent.*;

@Component
@Slf4j
public class AccountMailTasks {
    // Enqueue before account lookup to keep unknown-account requests on the same response path.
    private final ThreadPoolExecutor executor = new ThreadPoolExecutor(2, 2, 0, TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(32), runnable -> {
                Thread thread = new Thread(runnable, "account-mail");
                thread.setDaemon(true);
                return thread;
            }, new ThreadPoolExecutor.AbortPolicy());

    public void submit(Runnable task) {
        try {
            executor.execute(() -> {
                try { task.run(); }
                catch (RuntimeException error) { log.warn("Account mail task failed; recipient may retry later"); }
            });
        } catch (RejectedExecutionException error) { throw new MailUnavailableException(); }
    }

    @PreDestroy
    public void close() { executor.shutdownNow(); }
}
