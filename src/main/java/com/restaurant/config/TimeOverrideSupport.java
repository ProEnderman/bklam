package com.restaurant.config;

import org.springframework.core.env.Environment;

import java.util.Locale;

/**
 * Whether virtual time override (request-scoped header / dev API) is allowed in this process.
 * Never allowed when a prod/stage deployment profile is active.
 */
public final class TimeOverrideSupport {

    private TimeOverrideSupport() {}

    public static boolean isAllowed(Environment env) {
        if (Boolean.parseBoolean(env.getProperty("app.time-override.force-disable", "false"))) {
            return false;
        }
        String[] profiles = env.getActiveProfiles();
        for (String p : profiles) {
            String pl = p.toLowerCase(Locale.ROOT);
            if (pl.equals("prod") || pl.equals("production") || pl.equals("stage") || pl.equals("staging")) {
                return false;
            }
        }
        String enabledProp = env.getProperty("app.time-override.enabled");
        if (enabledProp != null) {
            return Boolean.parseBoolean(enabledProp);
        }
        if (profiles.length == 0) {
            return true;
        }
        for (String p : profiles) {
            String pl = p.toLowerCase(Locale.ROOT);
            if (pl.equals("dev") || pl.equals("test") || pl.equals("local") || pl.equals("local-docker")
                    || pl.equals("default")) {
                return true;
            }
        }
        return false;
    }
}
