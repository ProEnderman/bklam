package com.restaurant.config;

import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.core.type.AnnotatedTypeMetadata;

/**
 * Registers time-override filter/controller beans only when {@link TimeOverrideSupport#isAllowed} is true.
 */
public class TimeOverrideAllowedCondition implements Condition {

    @Override
    public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
        return TimeOverrideSupport.isAllowed(context.getEnvironment());
    }
}
