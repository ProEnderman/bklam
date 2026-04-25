-- Удаляем все записи REFRESH_TOKEN из activity_log, чтобы не захламлять журнал
DELETE FROM activity_log WHERE action_type = 'REFRESH_TOKEN';
