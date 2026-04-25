package com.restaurant.observability;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * Counts each {@link Scheduled} invocation and failures (exceptions).
 */
@Aspect
@Component
@Order
public class ScheduledJobMetricsAspect {

    private final BusinessMetrics businessMetrics;

    public ScheduledJobMetricsAspect(BusinessMetrics businessMetrics) {
        this.businessMetrics = businessMetrics;
    }

    @Around("@annotation(org.springframework.scheduling.annotation.Scheduled)")
    public Object recordScheduled(ProceedingJoinPoint pjp) throws Throwable {
        String job = pjp.getSignature().getDeclaringType().getSimpleName() + "." + pjp.getSignature().getName();
        try {
            Object result = pjp.proceed();
            businessMetrics.incrementSchedulerRun(job);
            return result;
        } catch (Throwable t) {
            businessMetrics.incrementSchedulerFailure(job);
            throw t;
        }
    }
}
