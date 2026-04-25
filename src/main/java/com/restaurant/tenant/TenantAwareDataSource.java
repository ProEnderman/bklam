package com.restaurant.tenant;

import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.datasource.AbstractDataSource;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import javax.sql.DataSource;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;

/**
 * Wraps the tenant DataSource so that the first statement on each connection
 * (inside an active transaction) runs SET LOCAL app.current_restaurant_id.
 * Guarantees the variable is set on the exact JDBC connection used by Hibernate.
 *
 * When TenantContext is null (e.g. auth endpoints, scheduled tasks), SET LOCAL
 * is skipped — RLS policies handle visibility at the DB level.
 */
@Slf4j
public class TenantAwareDataSource extends AbstractDataSource {

    private static final String TX_MARKER = "TENANT_SET_MARKER";
    private final DataSource delegate;

    public TenantAwareDataSource(DataSource delegate) {
        this.delegate = delegate;
    }

    @Override
    public Connection getConnection() throws SQLException {
        Connection c = delegate.getConnection();
        return wrap(c);
    }

    @Override
    public Connection getConnection(String username, String password) throws SQLException {
        Connection c = delegate.getConnection(username, password);
        return wrap(c);
    }

    private Connection wrap(Connection c) {
        return (Connection) Proxy.newProxyInstance(
                c.getClass().getClassLoader(),
                new Class[]{Connection.class},
                new TenantConnectionInvocationHandler(this, c));
    }

    private static class TenantConnectionInvocationHandler implements InvocationHandler {
        private final TenantAwareDataSource dataSource;
        private final Connection target;

        TenantConnectionInvocationHandler(TenantAwareDataSource dataSource, Connection target) {
            this.dataSource = dataSource;
            this.target = target;
        }

        @Override
        public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
            String name = method.getName();
            if ("prepareStatement".equals(name) || "createStatement".equals(name) || "prepareCall".equals(name)) {
                dataSource.ensureTenantSetLocal(target);
            }
            return method.invoke(target, args);
        }
    }

    private void ensureTenantSetLocal(Connection c) throws SQLException {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            return;
        }
        Object marked = TransactionSynchronizationManager.getResource(TX_MARKER);
        if (marked != null) {
            return;
        }
        Long restaurantId = TenantContext.getRestaurantId();
        Long locationId = TenantContext.getLocationId();
        if (restaurantId == null && locationId == null) {
            return;
        }
        TransactionSynchronizationManager.bindResource(TX_MARKER, Boolean.TRUE);
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                try {
                    TransactionSynchronizationManager.unbindResourceIfPossible(TX_MARKER);
                } catch (Exception ignored) {
                }
            }
        });
        if (restaurantId != null) {
            try (PreparedStatement ps = c.prepareStatement("SELECT set_config('app.current_restaurant_id', ?, true)")) {
                ps.setString(1, restaurantId.toString());
                ps.execute();
            }
        }
        if (locationId != null) {
            try (PreparedStatement ps = c.prepareStatement("SELECT set_config('app.location_id', ?, true)")) {
                ps.setString(1, locationId.toString());
                ps.execute();
            }
        }
    }
}
