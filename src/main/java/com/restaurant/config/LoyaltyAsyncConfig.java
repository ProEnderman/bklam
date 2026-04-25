package com.restaurant.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionHandler;
import java.util.concurrent.ThreadPoolExecutor;

@Slf4j
@Configuration
public class LoyaltyAsyncConfig {

    @Value("${loyalty.executor.core-pool-size:2}")
    private int corePoolSize;

    @Value("${loyalty.executor.max-pool-size:8}")
    private int maxPoolSize;

    @Value("${loyalty.executor.queue-capacity:500}")
    private int queueCapacity;

    @Value("${loyalty.executor.await-termination-seconds:20}")
    private int awaitTerminationSeconds;

    @Bean(name = "loyaltyExecutor")
    public Executor loyaltyExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(corePoolSize);
        executor.setMaxPoolSize(maxPoolSize);
        executor.setQueueCapacity(queueCapacity);
        executor.setThreadNamePrefix("loyalty-");
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(awaitTerminationSeconds);
        executor.setRejectedExecutionHandler(loggingCallerRunsPolicy());
        executor.initialize();
        return executor;
    }

    /**
     * CallerRunsPolicy semantics (never drops tasks) with WARN-level visibility
     * for queue saturation. The caller thread executes the task as back-pressure.
     */
    private RejectedExecutionHandler loggingCallerRunsPolicy() {
        return (runnable, pool) -> {
            log.warn("loyaltyExecutor saturated: active={} poolSize={} queueSize={} — executing on caller thread",
                pool.getActiveCount(), pool.getPoolSize(), pool.getQueue().size());
            // TODO: increment loyalty.executor.rejected counter when Micrometer is added
            if (!pool.isShutdown()) {
                runnable.run();
            }
        };
    }
}
